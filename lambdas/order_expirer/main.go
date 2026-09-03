// OrderExpirer — 支払期限切れの未払い注文を取り消す Lambda 関数。
//
// 2種類のトリガーを受け取り、イベントの mode で処理を振り分ける
// （Lambda は1関数1エントリのため、1つのハンドラで両方を扱う）:
//
//  1. mode="cancel" — EventBridge Scheduler の at() による「個別取消」
//     注文作成時に expires_at 時刻のワンタイム Schedule を登録し、
//     期限が来たらこの Lambda をその1件だけを対象に呼び出す。遅延なく即座に在庫が戻る。
//
//  2. mode="scan" — EventBridge の cron による「一括スキャン（安全網）」
//     Schedule の登録漏れ / Lambda の失敗 / 再試行上限超過などで取りこぼした
//     期限切れ注文を、定期的なテーブルスキャンで検出して処理する。
//
// なぜ2層構成か:
//
//	遅延実行（at() など）は「登録」と「配信」が別の仕組みであり、
//	登録失敗・配信失敗・処理失敗のいずれかで取りこぼしが起こりうる。
//	注文の取りこぼしは「在庫が戻らず売り切れ表示のまま残る」販売機会の損失に直結するため、
//	必ずスキャンを安全網として重ねる。逆にスキャンだけでも実用上は動くが、
//	在庫の復元がスキャン間隔の分だけ遅れる（限定商品では機会損失になる）。
//
// 冪等性:
//
//	すべての更新SQLに status='UNPAID' と期限切れ判定の2条件を入れているため、
//	二重起動（再試行・スケジュール重複）しても既に PAID / CANCELLED の行は巻き込まない。
//	取り消しは UPDATE ... RETURNING で行い、対象行が返ったときだけ在庫を戻すため、
//	在庫が二重に増えることもない。
//
// 環境変数:
//
//	DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD / DB_SSLMODE
//	REDIS_HOST / REDIS_PORT（未設定なら在庫のRedis復元をスキップ＝DBのみ）
//
// パスワードは環境変数から直接取得する（VPC内のLambdaからはSecrets Managerへ到達できないため）。
package main

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"
)

// scanBatchSize は mode="scan" の1回あたりで処理する最大件数。
// API側の order_expirer と同じ値に揃えている（SQLも同じ部分インデックスを利用する）。
const scanBatchSize = 100

// 取消SQL。どれも「status='UNPAID'」と「期限切れ」の2条件を必ず含む。
// この2つが揃って初めて冪等になる（二重起動・再試行・スケジュール重複に強い）。
// RETURNING で取り消せた行のIDを返すため、判定と後続処理（在庫の復元）が1クエリで完結する。
const (
	// at() 用: 指定された1件だけを個別に取り消す
	flashCancelSQLText = `
		UPDATE flash_orders SET status = 'CANCELLED', updated_at = now()
		WHERE id = $1 AND status = 'UNPAID' AND expires_at < now()
		RETURNING flash_id`

	lotteryCancelSQLText = `
		UPDATE lottery_orders SET status = 'CANCELLED', updated_at = now()
		WHERE id = $1 AND status = 'UNPAID' AND pay_deadline < now()
		RETURNING NULL::uuid AS flash_id`

	// cron用: 期限切れをまとめて取り消す（安全網）。LIMITで1回あたりの負荷を一定に保つ。
	//
	// 重要: 外側の UPDATE にも必ず status='UNPAID' を付けること。
	// サブクエリが id を選んだあとにユーザーが支払って PAID になる競合があり、
	// 外側に状態条件がないと「支払済みの注文を CANCELLED に戻す」事故になる
	// （在庫まで戻ってしまい、帳簿の不整合が発生する）。
	// FOR UPDATE SKIP LOCKED は、at() による個別取消と cron スキャンが
	// 同じ行を同時にロックして待たされるのを避けるためのもの。
	// スキップされた行は次のスキャンで処理される。
	flashScanSQLText = `
		UPDATE flash_orders SET status = 'CANCELLED', updated_at = now()
		WHERE id IN (
			SELECT id FROM flash_orders
			WHERE status = 'UNPAID' AND expires_at < now()
			LIMIT $1
			FOR UPDATE SKIP LOCKED
		)
		AND status = 'UNPAID'
		RETURNING flash_id`

	lotteryScanSQLText = `
		UPDATE lottery_orders SET status = 'CANCELLED', updated_at = now()
		WHERE id IN (
			SELECT id FROM lottery_orders
			WHERE status = 'UNPAID' AND pay_deadline < now()
			LIMIT $1
			FOR UPDATE SKIP LOCKED
		)
		AND status = 'UNPAID'
		RETURNING NULL::uuid AS flash_id`
)

// テストからも参照できるようアクセサを用意する
func flashCancelSQL() string   { return flashCancelSQLText }
func lotteryCancelSQL() string { return lotteryCancelSQLText }
func flashScanSQL() string     { return flashScanSQLText }
func lotteryScanSQL() string   { return lotteryScanSQLText }

// Event は EventBridge からの入力。mode で処理を分岐する。
type Event struct {
	Mode      string `json:"mode"`      // "cancel" | "scan"（空なら "scan" として扱う）
	OrderType string `json:"orderType"` // cancel時のみ: "flash" | "lottery"
	OrderID   string `json:"orderId"`   // cancel時のみ
}

func handler(ctx context.Context, event Event) error {
	db, err := connectDB()
	if err != nil {
		return fmt.Errorf("DB接続に失敗しました: %w", err)
	}
	defer db.Close()

	rdb := connectRedis()
	if rdb != nil {
		defer rdb.Close()
	}

	switch event.Mode {
	case "cancel":
		return handleCancel(ctx, db, rdb, event)
	case "scan", "":
		return handleScan(ctx, db, rdb)
	default:
		return fmt.Errorf("未知のmodeです: %s", event.Mode)
	}
}

// cancelResult は1件の取り消し結果
type cancelResult struct {
	Canceled bool // 実際に取り消した（true）／対象なし or 処理済み（false）
}

// handleCancel は at() で指定された1件の注文だけを個別に取り消す
func handleCancel(ctx context.Context, db *sqlx.DB, rdb *redis.Client, event Event) error {
	if event.OrderID == "" {
		return fmt.Errorf("mode=cancel では orderId が必須です")
	}

	switch event.OrderType {
	case "flash":
		res, err := cancelOne(ctx, db, rdb, flashCancelSQL(), event.OrderID, true)
		if err != nil {
			return err
		}
		slog.Info("個別の取消が完了しました",
			"orderType", "flash", "orderId", event.OrderID, "canceled", res.Canceled)
		return nil

	case "lottery":
		res, err := cancelOne(ctx, db, rdb, lotteryCancelSQL(), event.OrderID, false)
		if err != nil {
			return err
		}
		slog.Info("個別の取消が完了しました",
			"orderType", "lottery", "orderId", event.OrderID, "canceled", res.Canceled)
		return nil

	default:
		return fmt.Errorf("不正なorderTypeです: %s", event.OrderType)
	}
}

// cancelOne は1件だけを取り消す共通処理。
// UPDATE ... RETURNING で「取り消せた行の flash_id」を1クエリで取得するため、
// 取消判定と在庫戻し対象の特定が同時に済み、競合による二重の在庫戻しが起きない。
// 対象行がない場合（存在しない / 期限前 / 支払済 / 取消済）は sql.ErrNoRows が返る。
// restoreStock=true のときだけRedis/DBの在庫を戻す（抽選は枠数制で在庫を持たないため false）。
func cancelOne(ctx context.Context, db *sqlx.DB, rdb *redis.Client, updateSQL string, orderID string, restoreStock bool) (cancelResult, error) {
	var flashID *string // 抽選用の NULL::uuid が入るためポインタで受ける
	if err := db.Get(&flashID, updateSQL, orderID); err != nil {
		// 条件に合致する行がない（存在しない / 期限前 / 支払済 / 取消済）＝正常
		if err == sql.ErrNoRows {
			slog.Info("取消対象なし（期限前・支払済・取消済のいずれか）", "orderId", orderID)
			return cancelResult{Canceled: false}, nil
		}
		return cancelResult{}, fmt.Errorf("注文の取消に失敗しました: %w", err)
	}

	if !restoreStock || flashID == nil {
		return cancelResult{Canceled: true}, nil
	}
	restoreStockBoth(ctx, db, rdb, *flashID)
	return cancelResult{Canceled: true}, nil
}

// handleScan は期限切れ注文をテーブルスキャンでまとめて取り消す（安全網）
func handleScan(ctx context.Context, db *sqlx.DB, rdb *redis.Client) error {
	// フラッシュセール（在庫の復元あり）
	flashIDs, err := scanAndCancel(db, flashScanSQL(), scanBatchSize)
	if err != nil {
		return fmt.Errorf("フラッシュ注文のスキャンに失敗しました: %w", err)
	}

	// 抽選（在庫の復元なし）
	lotteryIDs, err := scanAndCancel(db, lotteryScanSQL(), scanBatchSize)
	if err != nil {
		return fmt.Errorf("抽選注文のスキャンに失敗しました: %w", err)
	}

	// 取り消せた注文の在庫を戻す（抽選分は flash_id が NULL のためスキップされる）
	for _, id := range flashIDs {
		restoreStockBoth(ctx, db, rdb, id)
	}

	slog.Info("スキャンによる期限切れ処理が完了しました",
		"flashCanceled", len(flashIDs), "lotteryCanceled", len(lotteryIDs))
	return nil
}

// scanAndCancel は期限切れ注文を一括で取り消し、取り消せた行の flash_id を返す。
// UPDATE ... RETURNING なので「取消判定」と「対象ID取得」が原子的に済み、
// 複数のLambdaが同時に走っても同じ行が二重に取り消されることはない
// （UPDATE が行ロックを取り、後続は status='UNPAID' 条件で除外される）。
func scanAndCancel(db *sqlx.DB, updateSQL string, limit int) ([]string, error) {
	var ids []*string // 抽選用の NULL が混ざるためポインタで受ける
	if err := db.Select(&ids, updateSQL, limit); err != nil {
		return nil, err
	}

	flashIDs := make([]string, 0, len(ids))
	for _, id := range ids {
		if id != nil {
			flashIDs = append(flashIDs, *id)
		}
	}
	return flashIDs, nil
}

// restoreStockBoth はRedis（権威）とDB（最終確定）の両方で在庫を1つ戻す。
func restoreStockBoth(ctx context.Context, db *sqlx.DB, rdb *redis.Client, flashID string) {
	restoreRedisStock(ctx, rdb, flashID)
	restoreDBStock(db, flashID)
}

// restoreRedisStock はRedisの在庫を1つ戻す。
// 未接続（rdb=nil）なら何もしない（REDIS_HOST 未設定環境のフォールバック）。
// 失敗してもエラーにはしない。注文の取消自体は確定しているため。
// ただし自動的には再試行されない点に注意: 注文は CANCELLED になり、
// 次回スキャンの条件（status='UNPAID'）に合致しなくなるため、取りこぼしは残る。
func restoreRedisStock(ctx context.Context, rdb *redis.Client, flashID string) {
	if rdb == nil {
		return
	}
	key := "stock:" + flashID
	if err := rdb.Incr(ctx, key).Err(); err != nil {
		slog.Warn("Redis在庫の復元に失敗しました", "flashId", flashID, "error", err)
	}
}

// restoreDBStock はDBの在庫を1つ戻す（Redisと同様、失敗してもログのみ）
func restoreDBStock(db *sqlx.DB, flashID string) {
	if db == nil {
		return
	}
	if _, err := db.Exec(`UPDATE flash_items SET stock = stock + 1 WHERE id = $1`, flashID); err != nil {
		slog.Warn("DB在庫の復元に失敗しました", "flashId", flashID, "error", err)
	}
}

// connectDB は環境変数から RDS への接続を作る（lottery_drawer と同じ方式）
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

	dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s connect_timeout=5",
		host, port, user, password, name, sslmode)

	db, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	return db, nil
}

// connectRedis はElastiCacheへ接続する。
// 未設定の場合は nil を返し、在庫のRedis復元のみスキップする（DB側の取消は続行）。
func connectRedis() *redis.Client {
	host := os.Getenv("REDIS_HOST")
	if host == "" {
		slog.Warn("REDIS_HOST が未設定のため、在庫のRedis復元をスキップします")
		return nil
	}
	port := envOr("REDIS_PORT", "6379")

	// Lambda は1回の実行につき1プロセスで動くため PoolSize は小さくて十分
	rdb := redis.NewClient(&redis.Options{
		Addr:         fmt.Sprintf("%s:%s", host, port),
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
		PoolSize:     2,
	})
	return rdb
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	lambda.Start(handler)
}
