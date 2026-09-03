// Package scheduler は EventBridge Scheduler への抽選開票スケジュール登録を提供します。
// Admin API が抽選商品を作成する際、draw_at 時刻のワンタイムScheduleを登録します。
package scheduler

import (
	"context"
	"fmt"
	"sync"
	"time"

	"flashbuy/api/config"
	"flashbuy/api/pkg/logger"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/scheduler"
	"github.com/aws/aws-sdk-go-v2/service/scheduler/types"
	"go.uber.org/zap"
)

var (
	client *scheduler.Client
	cfg    *config.SchedulerConfig
	mu     sync.RWMutex
)

// InitScheduler は EventBridge Scheduler クライアントを初期化します。
// 設定が空（schedule_group_name 未指定）の場合はスキップし、RegisterDrawSchedule は何もしない。
func InitScheduler(c *config.SchedulerConfig) {
	mu.Lock()
	defer mu.Unlock()

	cfg = c
	if c == nil || c.ScheduleGroupName == "" {
		logger.Info("scheduler設定が空のため、開票スケジュール登録をスキップします")
		return
	}

	awsCfg, err := awsconfig.LoadDefaultConfig(context.TODO(),
		awsconfig.WithRegion(c.Region))
	if err != nil {
		logger.Warn("EventBridge Schedulerクライアントの初期化に失敗しました", zap.Error(err))
		return
	}
	client = scheduler.NewFromConfig(awsCfg)
}

// RegisterDrawSchedule は抽選商品の開票用ワンタイムScheduleを登録します。
// - Schedule名は lotteryID から一意に決まる（同じ抽選の再登録は上書きになる）
// - draw_at 到達時に1回だけLambdaを呼び出し、実行後にScheduleを自動削除する
//
// 設定が空の場合（ローカル環境など）は nil を返してスキップする。
func RegisterDrawSchedule(lotteryID string, drawAt time.Time) error {
	mu.RLock()
	defer mu.RUnlock()

	if client == nil || cfg == nil {
		// 未設定（ローカルdocker環境など）は登録せず正常終了とする
		return nil
	}

	name := fmt.Sprintf("draw-%s", lotteryID)
	input := fmt.Sprintf(`{"lotteryId":%q}`, lotteryID)
	groupName := cfg.ScheduleGroupName
	arn := cfg.DrawerFunctionARN
	roleArn := cfg.ExecutionRoleARN
	// at() 式は UTC 時刻を yyyy-mm-ddThh:mm:ss 形式で指定する（Z サフィックスは付与しない。
	// Z を付けると ValidationException: Invalid Schedule Expression になる）
	at := drawAt.UTC().Format("2006-01-02T15:04:05")

	_, err := client.CreateSchedule(context.TODO(), &scheduler.CreateScheduleInput{
		Name:               &name,
		GroupName:          &groupName,
		Description:        ptr("抽選開票（作成時に自動登録。実行後に自動削除）"),
		ScheduleExpression: ptr(fmt.Sprintf("at(%s)", at)),
		// 指定時刻ちょうどに実行する（柔軟ウィンドウなし）
		FlexibleTimeWindow: &types.FlexibleTimeWindow{
			Mode: types.FlexibleTimeWindowModeOff,
		},
		// 実行後にScheduleを自動削除する（再実行されない）
		ActionAfterCompletion: types.ActionAfterCompletionDelete,
		Target: &types.Target{
			Arn:     &arn,
			RoleArn: &roleArn,
			Input:   &input,
		},
	})
	return err
}

// RegisterExpireSchedule は注文の支払期限切れ取消用ワンタイムScheduleを登録します。
//
// 購入（秒殺）・当選（抽選）のそれぞれで支払期限が確定した時点で呼び出し、
// 期限到来時に OrderExpirer Lambda を1件だけ対象に呼び出させます（遅延なしで在庫が戻る）。
//
// 取りこぼし（登録失敗・Lambda失敗）に備え、OrderExpirer 側には cron による
// スキャン兜底も別途用意しているため、ここでの登録失敗はエラーにせずログのみ残します
// （呼び出し側で warn ログを出して処理を継続する）。
//
// Schedule名は orderID から一意に決まるため、重複登録は上書きになります。
func RegisterExpireSchedule(orderType, orderID string, expiresAt time.Time) error {
	mu.RLock()
	defer mu.RUnlock()

	if client == nil || cfg == nil {
		// 未設定（ローカルdocker環境など）は登録せず正常終了とする
		return nil
	}
	if cfg.ExpirerFunctionARN == "" {
		// OrderExpirer 未デプロイ（terraform apply 前）はスキップ
		return nil
	}

	name := fmt.Sprintf("expire-%s", orderID)
	// ハンドラは mode で処理を分岐するため、mode を必ず含める
	input := fmt.Sprintf(`{"mode":"cancel","orderType":%q,"orderId":%q}`, orderType, orderID)
	groupName := cfg.ScheduleGroupName
	arn := cfg.ExpirerFunctionARN
	roleArn := cfg.ExecutionRoleARN
	// at() 式は UTC 時刻（Z サフィックスは付与しない。付けると ValidationException になる）
	at := expiresAt.UTC().Format("2006-01-02T15:04:05")

	_, err := client.CreateSchedule(context.TODO(), &scheduler.CreateScheduleInput{
		Name:               &name,
		GroupName:          &groupName,
		Description:        ptr("未払い注文の期限切れ取消（作成時に自動登録。実行後に自動削除）"),
		ScheduleExpression: ptr(fmt.Sprintf("at(%s)", at)),
		FlexibleTimeWindow: &types.FlexibleTimeWindow{
			Mode: types.FlexibleTimeWindowModeOff,
		},
		ActionAfterCompletion: types.ActionAfterCompletionDelete,
		Target: &types.Target{
			Arn:     &arn,
			RoleArn: &roleArn,
			Input:   &input,
		},
	})
	return err
}

func ptr(s string) *string { return &s }
