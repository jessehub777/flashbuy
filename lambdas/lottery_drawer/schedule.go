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

// registerSchedules は当選者ごとの支払期限取消Scheduleを EventBridge Scheduler に登録する。
//
// 開票Lambda自身が登録する理由:
//
//	当選者IDは開票トランザクションの中で決まるため、ここで登録するのが最も確実。
//	（API側からは「誰が当選したか」を事前に知りようがない）
//
// 冪等性:
//
//	Schedule名を orderID から一意に決めているため、再実行（再試行）しても
//	同じScheduleが上書きされるだけ。
//
// 環境変数が未設定の場合（ローカル実行・未デプロイ時）はスキップする。
func registerSchedules(ctx context.Context, orderIDs []string, payDeadline time.Time) error {
	functionARN := os.Getenv("EXPIRER_FUNCTION_ARN")
	groupName := os.Getenv("SCHEDULE_GROUP_NAME")
	roleARN := os.Getenv("SCHEDULER_ROLE_ARN")

	if functionARN == "" || groupName == "" || roleARN == "" {
		// 未設定なら登録しない（cronスキャン兜底が拾うため問題ない）
		return nil
	}

	cfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(os.Getenv("AWS_REGION")))
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

		_, err := client.CreateSchedule(ctx, &scheduler.CreateScheduleInput{
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
