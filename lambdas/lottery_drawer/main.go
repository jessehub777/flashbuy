// LotteryDrawer — 抽選開票を行う Lambda 関数。
//
// EventBridge Scheduler が draw_at 時刻に一回だけトリガーする（Schedule は Admin API が作成時に登録）。
// 処理内容:
//  1. RDS から WAITING 状態の応募一覧を取得
//  2. draw パッケージ（crypto/rand + Fisher-Yates）で当選者を選出
//  3. トランザクションで当選者を UNPAID（支払期限3日）、落選者を LOST に一括更新
//  4. SNS トピック lottery.drawn に結果イベントを発行
//
// 環境変数:
//
//	DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD / DB_SSLMODE
//	SNS_TOPIC_ARN（空なら SNS 発行をスキップ）
//
// パスワードは環境変数から直接取得する（VPC内のLambdaからはSecrets Managerへ到達できないため）。
// 本番移行時（ECS / NAT + VPC Endpoint 導入時）は Secrets Manager 方式に戻す。
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"time"

	"flashbuy/lambdas/lottery_drawer/draw"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

// Event は EventBridge Scheduler の Target Input。
// Admin API が Schedule を作成する際に指定する。
type Event struct {
	LotteryID string `json:"lotteryId"`
}

// 当選者の支払期限（当選日から3日）
const payDeadlineDuration = 72 * time.Hour

func handler(ctx context.Context, event Event) error {
	if event.LotteryID == "" {
		return fmt.Errorf("lotteryId が空です")
	}
	slog.Info("抽選を開始します", "lotteryId", event.LotteryID)

	db, err := connectDB()
	if err != nil {
		return fmt.Errorf("DB接続に失敗しました: %w", err)
	}
	defer db.Close()

	winnerCount, appliedCount, err := drawLottery(ctx, db, event.LotteryID)
	if err != nil {
		return err
	}

	slog.Info("抽選が完了しました",
		"lotteryId", event.LotteryID,
		"appliedCount", appliedCount,
		"winnerCount", winnerCount)

	// SNS への結果イベント発行（ARN 未設定ならスキップ）
	if err := publishResult(ctx, event.LotteryID, appliedCount, winnerCount); err != nil {
		// 開票自体は完了しているため、SNS 失敗でエラーにはしない（ログのみ）
		slog.Warn("SNS発行に失敗しました（開票結果はDBに反映済み）",
			"lotteryId", event.LotteryID,
			"error", err)
	}
	return nil
}

// drawLottery は抽選の本体。単一トランザクションで開票結果を書き込む。
// 返り値: 当選者数, 応募者数
func drawLottery(ctx context.Context, db *sqlx.DB, lotteryID string) (int, int, error) {
	tx, err := db.Beginx()
	if err != nil {
		return 0, 0, fmt.Errorf("トランザクション開始に失敗しました: %w", err)
	}
	defer tx.Rollback()

	// 当選枠数を取得（応募者より多い場合は全員当選になるため、枠数をそのまま使う）
	var winnerCount int
	if err := tx.Get(&winnerCount,
		`SELECT winner_count FROM lottery_items WHERE id = $1`, lotteryID); err != nil {
		return 0, 0, fmt.Errorf("抽選商品の取得に失敗しました（存在しない可能性）: %w", err)
	}

	// WAITING 状態の応募者を取得
	var applicantIDs []string
	if err := tx.Select(&applicantIDs,
		`SELECT id FROM lottery_orders WHERE lottery_id = $1 AND status = 'WAITING'`,
		lotteryID); err != nil {
		return 0, 0, fmt.Errorf("応募一覧の取得に失敗しました: %w", err)
	}

	if len(applicantIDs) == 0 {
		// 応募なし、または既に開票済み（WAITING が残っていない）。冪等として正常終了する
		slog.Info("対象の WAITING 応募がありません（応募なし or 開票済み）", "lotteryId", lotteryID)
		return 0, 0, nil
	}

	// 抽選実行（crypto/rand + Fisher-Yates）。当選者IDのみ取得すればよい
	winnerIDs, _ := draw.PickWinners(applicantIDs, winnerCount)

	// ① 全応募者を一旦 LOST に更新する（WHERE 条件のみで更新できるため、
	//    超長の IN リスト（例: 10万人分）を構築する必要がない）
	//    status='WAITING' を条件にすることで、既に PAID / CANCELLED の行を巻き込まない（冪等性）
	if _, err := tx.Exec(`
		UPDATE lottery_orders
		SET status = 'LOST', updated_at = now()
		WHERE lottery_id = $1 AND status = 'WAITING'`, lotteryID); err != nil {
		return 0, 0, fmt.Errorf("落選者の更新に失敗しました: %w", err)
	}

	// ② 当選者のみ UNPAID + 支払期限で上書きする（対象は winner_count 件のみ）
	payDeadline := time.Now().Add(payDeadlineDuration)
	if len(winnerIDs) > 0 {
		query, args, err := sqlx.In(`
			UPDATE lottery_orders
			SET status = 'UNPAID', pay_deadline = ?, updated_at = now()
			WHERE id IN (?)`, payDeadline, winnerIDs)
		if err != nil {
			return 0, 0, fmt.Errorf("当選者更新SQLの構築に失敗しました: %w", err)
		}
		query = tx.Rebind(query)
		if _, err := tx.Exec(query, args...); err != nil {
			return 0, 0, fmt.Errorf("当選者の更新に失敗しました: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, 0, fmt.Errorf("コミットに失敗しました: %w", err)
	}

	// 当選者ごとに「支払期限到来で取消」のワンタイムScheduleを登録する。
	// 抽選は枠数制で在庫を持たないため取消はステータス変更だけで済むが、
	// 期限切れを放置すると当選枠が宙吊りになる（繰上げ当選等の判断に支障が出る）。
	// 登録失敗は開票結果そのものを巻き込まないよう、ログのみ残して正常終了とする
	// （OrderExpirer の cron スキャン兜底が後から回収する）。
	registerPayDeadlineSchedules(ctx, winnerIDs, payDeadline)

	return len(winnerIDs), len(applicantIDs), nil
}

// registerPayDeadlineSchedules は当選者全員の支払期限取消Scheduleを登録する。
// 1件失敗しても残りは続行する（部分的な失敗は兜底スキャンが回収する）
func registerPayDeadlineSchedules(ctx context.Context, winnerIDs []string, payDeadline time.Time) {
	if len(winnerIDs) == 0 {
		return
	}
	if err := registerSchedules(ctx, winnerIDs, payDeadline); err != nil {
		// 開票は完了しているため、Schedule登録の失敗で err にはしない
		slog.Warn("支払期限Scheduleの登録に失敗しました（cronスキャンで回収されます）",
			"winnerCount", len(winnerIDs), "error", err)
	}
}

// connectDB は環境変数から RDS への接続を作る。
// パスワードは DB_PASSWORD 環境変数から直接取得する。
func connectDB() (*sqlx.DB, error) {
	host := envOr("DB_HOST", "")
	port := envOr("DB_PORT", "5432")
	name := envOr("DB_NAME", "flashbuy")
	user := envOr("DB_USER", "flashbuy")
	password := os.Getenv("DB_PASSWORD")
	sslmode := envOr("DB_SSLMODE", "require")

	if host == "" || password == "" {
		return nil, fmt.Errorf("DB_HOST / DB_PASSWORD 環境変数が設定されていません")
	}

	// connect_timeout: RDS が応答しない場合にTCP接続の確立で無限に待たされるのを防ぐ。
	// （Lambda のタイムアウト60秒で強制終了されると、Schedule は実行済みとして削除されるため
	//   その抽選の開票機会が失われる。早めに失敗させて再試行に回す方が安全）
	dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s connect_timeout=5",
		host, port, user, password, name, sslmode)

	db, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		return nil, err
	}

	// Lambda は 1 invocation = 1並行で、開票処理は1トランザクションの直列実行のため接続は1本で十分。
	// プールは各 invocation で作り直される（handler の defer db.Close()）ため、それ以上の設定は不要
	db.SetMaxOpenConns(1)
	return db, nil
}

// publishResult は SNS トピック lottery.drawn に開票結果イベントを発行する
func publishResult(ctx context.Context, lotteryID string, appliedCount, winnerCount int) error {
	topicArn := os.Getenv("SNS_TOPIC_ARN")
	if topicArn == "" {
		return nil // 未設定ならスキップ
	}

	// SNS クライアントは都度生成で十分（呼び出し頻度が極めて低いため）
	// 循環 import を避けるため、このファイル内で初期化する
	client, err := newSNSClient(ctx)
	if err != nil {
		return err
	}

	payload, _ := json.Marshal(map[string]any{
		"event":        "lottery.drawn",
		"lotteryId":    lotteryID,
		"appliedCount": appliedCount,
		"winnerCount":  winnerCount,
		"drawnAt":      time.Now().UTC().Format(time.RFC3339),
	})

	_, err = client.publish(ctx, topicArn, string(payload))
	return err
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	// 構造化ログ（JSON）を CloudWatch Logs へ出力する。
	// これにより CloudWatch Logs Insights で lotteryId 等のフィールドで検索・集計できる
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	lambda.Start(handler)
}
