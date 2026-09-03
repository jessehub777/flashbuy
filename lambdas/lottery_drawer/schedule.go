package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/scheduler"
	"github.com/aws/aws-sdk-go-v2/service/scheduler/types"
)

// scheduleCallTimeout は CreateSchedule 1回あたりに掛けるタイムアウト。
// AWS SDK のデフォルトはリトライ込みでかなり長く、SYN破棄環境（VPC内NATなし）では
// 1回の呼び出しが Lambda 全体の残り時間を食い潰すため、短めに区切って早く諦める。
const scheduleCallTimeout = 3 * time.Second

// registerSchedules は当選者ごとの「支払期限切れ取消」用 Schedule を EventBridge Scheduler に登録する。
//
// ⚠️ 重要: この関数は現在「意図的に無効化」されています（必要な環境変数を設定しない運用）。
//
// 理由:
//
//	LotteryDrawer は private_subnet に配置されており、このVPCにはNAT Gatewayも
//	EventBridge Scheduler の VPC Endpoint も存在しません。そのため Lambda 内から
//	scheduler.*.amazonaws.com を呼ぶとSYNパケットが破棄され、応答を待ち続けて
//	Lambdaタイムアウト（60秒）までハングします。
//	過去に Secrets Manager で全く同じ事故が発生しています（AGENTS.md 参照）。
//	ハングすると開票自体が失敗扱いになり、SNS通知も飛ばず、再試行も発生します。
//
// 再有効化する場合の前提（いずれか必須）:
//   - private subnet に NAT Gateway を追加（約$32/月）
//   - EventBridge Scheduler 用の VPC Endpoint を追加
//   - もしくは開票LambdaをVPC外に出し、RDSへは別経路で接続する
//
// 現在の代替:
//
//	当選者の期限切れは order_expirer の cron スキャン（1分間隔）が回収します。
//	抽選の支払期限は72時間あり、1分程度の遅延は実用上問題ありません。
//	また抽選は枠数制で在庫を持たないため、即時の取消が必須ではありません。
//
// 冪等性（再有効化時）:
//
//	Schedule名を orderID から一意に決めているため、再実行（再試行）しても
//	同じScheduleが上書きされるだけ。
//
// 環境変数（EXPIRER_FUNCTION_ARN / SCHEDULE_GROUP_NAME / SCHEDULER_ROLE_ARN）が
// 未設定の場合は何もせず nil を返します（現在のデプロイ構成はこれに該当）。
func registerSchedules(ctx context.Context, orderIDs []string, payDeadline time.Time) error {
	functionARN := os.Getenv("EXPIRER_FUNCTION_ARN")
	groupName := os.Getenv("SCHEDULE_GROUP_NAME")
	roleARN := os.Getenv("SCHEDULER_ROLE_ARN")

	if functionARN == "" || groupName == "" || roleARN == "" {
		// 未設定なら登録しない（cronスキャンという安全網があるため問題ない）
		return nil
	}

	// AWS設定の読み込みにも短いタイムアウトを掛ける（Lambda全体のctxをそのまま渡さない）
	cfgCtx, cfgCancel := context.WithTimeout(ctx, scheduleCallTimeout)
	defer cfgCancel()

	cfg, err := awsconfig.LoadDefaultConfig(cfgCtx, awsconfig.WithRegion(os.Getenv("AWS_REGION")))
	if err != nil {
		return fmt.Errorf("AWS設定の読み込みに失敗しました: %w", err)
	}
	client := scheduler.NewFromConfig(cfg)

	// at() は UTC 時刻（Z サフィックスを付けると ValidationException になる）
	at := payDeadline.UTC().Format("2006-01-02T15:04:05")

	var firstErr error
	for _, id := range orderIDs {
		name := fmt.Sprintf("expire-%s", id)
		input := fmt.Sprintf(`{"mode":"cancel","orderType":"lottery","orderId":%q}`, id)

		// 1件ごとに短いタイムアウトを区切る。
		// Lambda全体のctxをそのまま渡すと、1回のネットワーク遅延が
		// 関数まるごとの残り時間を食い潰してしまう（開票自体は完了済みなので、
		// 登録は「できる範囲でやる」に留めて早めに諦めるのが安全）。
		callCtx, cancel := context.WithTimeout(ctx, scheduleCallTimeout)
		_, err := client.CreateSchedule(callCtx, &scheduler.CreateScheduleInput{
			Name:               aws.String(name),
			GroupName:          aws.String(groupName),
			Description:        aws.String("当選後の支払期限切れ取消（開票時に自動登録。実行後に自動削除）"),
			ScheduleExpression: aws.String(fmt.Sprintf("at(%s)", at)),
			FlexibleTimeWindow: &types.FlexibleTimeWindow{
				Mode: types.FlexibleTimeWindowModeOff,
			},
			ActionAfterCompletion: types.ActionAfterCompletionDelete,
			Target: &types.Target{
				Arn:     aws.String(functionARN),
				RoleArn: aws.String(roleARN),
				Input:   aws.String(input),
			},
		})
		// タイマーリークを防ぐため、必ずすぐに解放する（ループ内で defer すると
		// 解放が関数末尾まで積み上がってしまう）
		cancel()
		if err != nil {
			slog.Warn("支払期限Scheduleの登録に失敗しました", "orderId", id, "error", err)
			if firstErr == nil {
				firstErr = err
			}
			continue // 1件失敗しても残りは続行する
		}
	}
	return firstErr
}
