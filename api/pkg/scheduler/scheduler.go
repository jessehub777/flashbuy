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

func ptr(s string) *string { return &s }
