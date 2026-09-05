// LotteryDrawer — 抽選開票を行う Lambda 関数。
//
// 2種類のトリガーを受け取り、イベントの mode で処理を振り分ける
// （Lambda は1関数1エントリのため、1つのハンドラで両方を扱う）:
//
//  1. mode="draw" — EventBridge Scheduler の at() による「個別開票」
//     Admin API が抽選作成時に draw_at 時刻のワンタイム Schedule を登録し、
//     その時刻にこの Lambda を該当の抽選1件だけを対象に呼び出す。遅延なく開票される。
//
//  2. mode="scan" — EventBridge の cron による「一括スキャン（安全網）」
//     Schedule の登録漏れ / Lambda の失敗などで取りこぼした抽選を、
//     定期的なテーブルスキャンで検出して開票する。
//
// なぜ2層構成か:
//
//	遅延実行（at() など）は「登録」と「配信」が別の仕組みであり、
//	登録失敗・配信失敗・処理失敗のいずれかで取りこぼしが起こりうる。
//	実際に IAM 権限の ARN 誤りで Schedule 登録が全件失敗し、
//	開票が一切行われない事故が発生している（その際、エラーは warn ログのみで
//	管理画面は成功を返すため、ユーザーは「開票待ち」のまま気づけなかった）。
//	取りこぼした抽選は永久に開票されないため、必ずスキャンを安全網として重ねる。
//
// 冪等性:
//
//	開票は「WAITING を全て LOST にしてから当選者だけ UNPAID に戻す」2段階で行う。
//	対象抽選に WAITING が残っていなければ何もせず正常終了するため、
//	二重起動（再試行・スキャンとの重複）しても結果は変わらない。
//	並行実行については drawLottery 内の FOR UPDATE で直列化する（後述）。
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

// Event は EventBridge からの入力。mode で処理を分岐する。
type Event struct {
	Mode      string `json:"mode"`      // "draw" | "scan"（空なら "draw" として扱う）
	LotteryID string `json:"lotteryId"` // draw時のみ
}

// 当選者の支払期限（当選日から3日）
const payDeadlineDuration = 72 * time.Hour

// scanBatchSize は mode="scan" の1回あたりで開票する抽選の最大件数。
// 開票は1抽選あたり「全応募のUPDATE + 当選者のUPDATE」と重いため、
// OrderExpirer の scanBatchSize（100件）より少ない値にしている。
const scanBatchSize = 10

// mode="scan" 用: 開票時刻を過ぎても WAITING 応募が残っている抽選を古い順に拾う。
// 通常は0件（at() が正常に開票済み）で、Schedule 登録漏れ等があったときだけ引っ掛かる。
//
// EXISTS で「WAITING が残っているか」を先に判定しているため、
// 応募ゼロの抽選（開票しても何も起きない）を無駄に拾わない。
const drawScanSQLText = `
	SELECT id FROM lottery_items
	WHERE draw_at <= now()
	  AND EXISTS (
	    SELECT 1 FROM lottery_orders
	    WHERE lottery_id = lottery_items.id AND status = 'WAITING'
	  )
	ORDER BY draw_at
	LIMIT $1`

func drawScanSQL() string { return drawScanSQLText }

func handler(ctx context.Context, event Event) error {
	db, err := connectDB()
	if err != nil {
		return fmt.Errorf("DB接続に失敗しました: %w", err)
	}
	defer db.Close()

	switch event.Mode {
	case "draw", "":
		return handleDraw(ctx, db, event)
	case "scan":
		return handleScan(ctx, db)
	default:
		return fmt.Errorf("未知のmodeです: %s", event.Mode)
	}
}

// handleDraw は at() で指定された1件の抽選だけを開票する（本線）
func handleDraw(ctx context.Context, db *sqlx.DB, event Event) error {
	if event.LotteryID == "" {
		return fmt.Errorf("mode=draw では lotteryId が必須です")
	}
	slog.Info("抽選を開始します", "lotteryId", event.LotteryID)

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

// handleScan は開票時刻を過ぎても未開票の抽選をスキャンして開票する（安全網）
func handleScan(ctx context.Context, db *sqlx.DB) error {
	var lotteryIDs []string
	if err := db.Select(&lotteryIDs, drawScanSQL(), scanBatchSize); err != nil {
		return fmt.Errorf("未開票の抽選の取得に失敗しました: %w", err)
	}

	drawn, failed := 0, 0
	for _, id := range lotteryIDs {
		winnerCount, appliedCount, err := drawLottery(ctx, db, id)
		if err != nil {
			// 1件失敗しても残りは続行する。失敗した抽選は WAITING のままなので
			// 次回のスキャンで自動的に再挑戦される
			slog.Warn("開票に失敗しました（次回スキャンで再試行されます）",
				"lotteryId", id, "error", err)
			failed++
			continue
		}
		slog.Info("スキャンによる開票が完了しました",
			"lotteryId", id, "appliedCount", appliedCount, "winnerCount", winnerCount)
		drawn++
	}

	slog.Info("スキャンによる開票処理が完了しました", "drawn", drawn, "failed", failed)
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
	//
	// FOR UPDATE で抽選商品の行をロックする。開票は「WAITING を読む→抽選→書く」の
	// 3段階でできており、このままでは並行実行時に結果が壊れる:
	//   A と B が同じ WAITING 一覧を読み、A が全員 LOST にして当選者を UNPAID にしたあと、
	//   B の「当選者を UNPAID にする UPDATE」には status 条件が無いため、
	//   A が確定させた LOST（落選）まで UNPAID に書き戻してしまう。
	//   並行は at() による本線開票と cron スキャンが重なったときに起こりうる。
	// ロックを取ることで同じ抽選の開票は直列化され、後からロックを取れた侧は
	// WAITING が残っていない（＝開票済み）ことを検出して何もせず正常終了する（冪等）。
	var winnerCount int
	if err := tx.Get(&winnerCount,
		`SELECT winner_count FROM lottery_items WHERE id = $1 FOR UPDATE`, lotteryID); err != nil {
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
	// （OrderExpirer の cron スキャンが後から回収する）。
	registerPayDeadlineSchedules(ctx, winnerIDs, payDeadline)

	return len(winnerIDs), len(applicantIDs), nil
}

// registerPayDeadlineSchedules は当選者全員の「支払期限切れ取消」用 Schedule を登録する。
// 1件失敗しても残りは続行する（一部の失敗は cron スキャンが後から回収する）
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
