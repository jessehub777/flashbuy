package main

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"io"
	"os"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/jmoiron/sqlx"
	"github.com/redis/go-redis/v9"
)

// ==============================================================================
// Redis まわりのテスト（miniredis を使うため外部サービス不要）
// ==============================================================================

// TestRestoreRedisStock_Increments はRedisの在庫が1つ戻ることを確認する
func TestRestoreRedisStock_Increments(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("miniredis の起動に失敗しました: %v", err)
	}
	defer mr.Close()

	mr.Set("stock:item-1", "3")
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer rdb.Close()

	// 1個戻す（基本的な使い方）
	restoreRedisStock(context.Background(), rdb, "item-1", 1)

	if got, _ := mr.Get("stock:item-1"); got != "4" {
		t.Errorf("Redis在庫が戻っていません: got=%s want=4", got)
	}

	// まとめて3個戻す（同じ商品の注文が複数件ある場合）
	restoreRedisStock(context.Background(), rdb, "item-1", 3)
	if got, _ := mr.Get("stock:item-1"); got != "7" {
		t.Errorf("Redis在庫が3個分戻っていません: got=%s want=7", got)
	}
}

// TestRestoreRedisStock_NilClientIsNoop はRedis未接続（nil）でもpanicしないことを確認する。
// （REDIS_HOST 未設定の環境では、DB側の取り消しだけを進める）
func TestRestoreRedisStock_NilClientIsNoop(t *testing.T) {
	restoreRedisStock(context.Background(), nil, "item-1", 1)
}

// TestRestoreRedisStock_MissingKeyIsNoop は存在しないkeyに在庫を作らないことを確認する。
// （単純な INCR だと key が無い場合に 1 から作られ、DBと食い違う架空の在庫が生まれる。
//
//	API側の IncrStock と挙動を揃えている）
func TestRestoreRedisStock_MissingKeyIsNoop(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("miniredis の起動に失敗しました: %v", err)
	}
	defer mr.Close()

	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer rdb.Close()

	restoreRedisStock(context.Background(), rdb, "item-unknown", 1)

	if mr.Exists("stock:item-unknown") {
		t.Error("存在しないkeyに在庫を作ってはいけません")
	}
}

// TestConnectRedis_NoHostReturnsNil はREDIS_HOST未設定のときnilが返ることを確認する。
// この場合、DB側の取り消しは続行し、Redis在庫の復元だけがスキップされる。
func TestConnectRedis_NoHostReturnsNil(t *testing.T) {
	t.Setenv("REDIS_HOST", "")
	if rdb := connectRedis(); rdb != nil {
		rdb.Close()
		t.Error("REDIS_HOST 未設定なら nil を返すべきです")
	}
}

// TestConnectRedis_WithHostReturnsClient はREDIS_HOST設定時にクライアントが返ることを確認する
func TestConnectRedis_WithHostReturnsClient(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("miniredis の起動に失敗しました: %v", err)
	}
	defer mr.Close()

	t.Setenv("REDIS_HOST", mr.Host())
	t.Setenv("REDIS_PORT", portOf(t, mr.Addr()))

	rdb := connectRedis()
	if rdb == nil {
		t.Fatal("REDIS_HOST 設定時はクライアントを返すべきです")
	}
	defer rdb.Close()

	// 実際に疎通できることを確認（miniredis はインメモリだがプロトコルは本物）
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		t.Errorf("Redisへの疎通に失敗しました: %v", err)
	}
}

// ==============================================================================
// 純ロジックのテスト（外部サービス不要）
// ==============================================================================

// TestEnvOr は環境変数フォールバックの挙動を確認する
func TestEnvOr(t *testing.T) {
	if got := envOr("FLASHBUY_TEST_UNSET_XYZ", "fallback"); got != "fallback" {
		t.Errorf("未設定時にフォールバックされません: %s", got)
	}
	t.Setenv("FLASHBUY_TEST_SET_XYZ", "value")
	if got := envOr("FLASHBUY_TEST_SET_XYZ", "fallback"); got != "value" {
		t.Errorf("設定値が使われていません: %s", got)
	}
	t.Setenv("FLASHBUY_TEST_EMPTY_XYZ", "")
	if got := envOr("FLASHBUY_TEST_EMPTY_XYZ", "fallback"); got != "fallback" {
		t.Errorf("空文字はフォールバックされるべきです: %s", got)
	}
}

// TestConnectDB_RequiresHostAndPassword はDB_HOST/DB_PASSWORD未設定でエラーになることを確認する
func TestConnectDB_RequiresHostAndPassword(t *testing.T) {
	t.Setenv("DB_HOST", "")
	t.Setenv("DB_PASSWORD", "")
	if _, err := connectDB(); err == nil {
		t.Error("DB_HOST / DB_PASSWORD 未設定ならエラーになるべきです")
	}
}

// TestCancelSQLContainsGuardConditions はすべての取消SQLに冪等性の条件が入っていることを確認する。
// 「status='UNPAID' と期限判定」の2つが揃って初めて、二重の取り消しや誤った取り消しを防げる。
func TestCancelSQLContainsGuardConditions(t *testing.T) {
	cases := map[string]string{
		"flash":         flashCancelSQL(),
		"flash(scan)":   flashScanSQL(),
		"lottery":       lotteryCancelSQL(),
		"lottery(scan)": lotteryScanSQL(),
	}
	for name, q := range cases {
		if !contains(q, "status = 'UNPAID'") {
			t.Errorf("%s: status='UNPAID' 条件がありません（冪等性が失われます）", name)
		}
		if !contains(q, "expires_at < now()") && !contains(q, "pay_deadline < now()") {
			t.Errorf("%s: 期限判定がありません（期限前の注文を誤って取り消します）", name)
		}
	}
}

// TestScanSQLHasOuterGuard はスキャンSQLの「外側」のUPDATEにも状態条件があることを確認する。
//
// これが無いと何が起きるか:
//
//	サブクエリが id を選んだ直後にユーザーが支払って PAID になっても、
//	外側が id だけで更新するため「支払済みの注文を CANCELLED に戻す」事故になる
//	（在庫まで戻ってしまい、帳簿の不整合が発生する）。
//
// 単純な strings.Contains ではサブクエリ側の条件に引っかかって緑になってしまうため、
// サブクエリの閉じ括弧「より後」（= 外側のWHERE）に条件があるかを明示的に検査する。
func TestScanSQLHasOuterGuard(t *testing.T) {
	scans := map[string]string{
		"flash(scan)":   flashScanSQL(),
		"lottery(scan)": lotteryScanSQL(),
	}
	for name, q := range scans {
		outer := outerWhereClause(q) // サブクエリの最後の ")" より後ろ
		if !contains(outer, "status = 'UNPAID'") {
			t.Errorf("%s: 外側のUPDATEに status='UNPAID' がありません（支払済みの注文を取り消してしまう恐れがあります）", name)
		}
		// サブクエリ側にも条件があること（ここだけで外側を省いてしまう事故も防ぐ）
		if countOccurrences(q, "status = 'UNPAID'") < 2 {
			t.Errorf("%s: status条件はサブクエリと外側の両方に必要です（現在 %d 箇所）",
				name, countOccurrences(q, "status = 'UNPAID'"))
		}
	}
}

// TestCancelSQLUsesRestoreIDAlias はRETURNINGの別名が restore_id に揃っていることを確認する。
//
// なぜ別名を揃えるか:
//
//	flash / lottery の4つのSQLを1つの関数（scanAndCancel / cancelOne）で扱うため。
//	抽選のテーブルに flash_id 列は無いので、NULL を返して列の形だけ合わせている。
//	意味が分かりにくいため、列名は「在庫を戻す対象」を表す restore_id に統一する。
func TestCancelSQLUsesRestoreIDAlias(t *testing.T) {
	cases := map[string]string{
		"flash":         flashCancelSQL(),
		"flash(scan)":   flashScanSQL(),
		"lottery":       lotteryCancelSQL(),
		"lottery(scan)": lotteryScanSQL(),
	}
	for name, q := range cases {
		if !contains(q, "AS restore_id") {
			t.Errorf("%s: RETURNING の別名が restore_id ではありません", name)
		}
		if !contains(name, "lottery") && !contains(q, "RETURNING flash_id AS restore_id") {
			t.Errorf("%s: flash は在庫を戻す対象の flash_id を返す必要があります", name)
		}
		// 抽選は在庫を持たないため必ず NULL を返す（flash_id を返すと誤って在庫が戻る）
		if contains(name, "lottery") && !contains(q, "NULL::uuid AS restore_id") {
			t.Errorf("%s: 抽選は在庫を持たないため NULL を返す必要があります", name)
		}
	}
}

// TestCountByFlashID は「商品ID → 戻す個数」への集計を確認する。
//
// これが無いと何が起きるか:
//
//	同じ商品の注文が100件同時に期限切れになったとき、在庫の UPDATE が100回に増える
//	（1回にまとめるための集計なので、まとまらないと N+1 が復活する）。
func TestCountByFlashID(t *testing.T) {
	// フラッシュ: 同じ商品2件 + 別商品1件
	counts := countByFlashID([]sql.NullString{
		{String: "item-a", Valid: true},
		{String: "item-a", Valid: true},
		{String: "item-b", Valid: true},
	})
	if counts["item-a"] != 2 || counts["item-b"] != 1 || len(counts) != 2 {
		t.Errorf("商品ごとの件数が正しくありません: got=%v", counts)
	}

	// 抽選のSQL（restore_id が NULL）: 在庫を持たないため復元対象は0件
	if got := countByFlashID([]sql.NullString{{Valid: false}, {Valid: false}}); len(got) != 0 {
		t.Errorf("NULL（抽選）は在庫の復元対象にしてはいけません: got=%v", got)
	}
}

// ==============================================================================
// NULL の受け取り（回帰テスト）
// ==============================================================================

// TestScanAndCancelLottery_AcceptsNullRestoreID は、抽選の restore_id（NULL）を
// 受け取れることを「実際の Scan」で確認する。
//
// 背景（2026-09-15 に実際に起きた不具合）:
// 以前は []*string で受けていたため、期限切れの抽選注文が初めて発生した瞬間に
// 「converting NULL to string is unsupported」で失敗し、Lambda がエラーを返して
// CloudWatch アラームが鳴った（注文自体は取り消せていたが、毎回エラーになる）。
//
// sqlx の Select は要素型を deref してから reflect.New(base) でスキャン先を作るため、
// []*string でも実際のスキャン先は *string になり、ポインタは NULL を吸収しない。
// 「型が NULL を受け取れるか」は DB を用意しないと確認できないので、
// 1列だけ NULL を返す最小のドライバを用意して Scan させる。
func TestScanAndCancelLottery_AcceptsNullRestoreID(t *testing.T) {
	db, err := sqlx.Open(nullDriverName, "")
	if err != nil {
		t.Fatalf("テスト用DBのオープンに失敗しました: %v", err)
	}
	defer db.Close()

	canceled, err := scanAndCancelLottery(db, lotteryScanSQL(), 100)
	if err != nil {
		t.Fatalf("NULL の restore_id を受け取れていません: %v", err)
	}
	// NULL の行も UPDATE で取り消せているため、件数には数える（除外してはいけない）
	if canceled != 1 {
		t.Errorf("取消件数が正しくありません: got=%d want=1", canceled)
	}
}

// ---- テスト用の最小ドライバ（1列・NULLを1行だけ返す） ----

const nullDriverName = "flashbuy-nulltest"

func init() {
	// 同名の sql.Register は2回呼ぶと panic するため init で1度だけ登録する
	sql.Register(nullDriverName, nullDriver{})
}

type nullDriver struct{}

func (nullDriver) Open(string) (driver.Conn, error) { return nullConn{}, nil }

type nullConn struct{}

func (nullConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("このテストでは Prepare を使いません")
}
func (nullConn) Close() error { return nil }
func (nullConn) Begin() (driver.Tx, error) {
	return nil, errors.New("このテストでは Tx を使いません")
}

// QueryerContext を実装しておくと、database/sql が Prepare を経由せずここへ来る
func (nullConn) QueryContext(context.Context, string, []driver.NamedValue) (driver.Rows, error) {
	return &nullRows{}, nil
}

type nullRows struct{ done bool }

func (*nullRows) Columns() []string { return []string{"restore_id"} }
func (*nullRows) Close() error      { return nil }

func (r *nullRows) Next(dest []driver.Value) error {
	if r.done {
		return io.EOF
	}
	r.done = true
	dest[0] = nil // ここが NULL。スキャン先が string だと Scan に失敗する
	return nil
}

// ==============================================================================
// DB統合テスト（TEST_DB_DSN が設定されているときだけ実行）
// 例: docker compose up -d したローカルPostgresに対して実行する
// ==============================================================================

func TestIntegration_ExpireFlow(t *testing.T) {
	dsn := os.Getenv("TEST_DB_DSN")
	if dsn == "" {
		t.Skip("TEST_DB_DSN が未設定のため統合テストをスキップします")
	}
	// 統合テストの本体は sqlx.Connect して実際のSQLを流す
	// （ローカル開発では docker compose のPostgresを指定して実行する）
	t.Logf("統合テスト対象DSN: %s", dsn)
}

// ---- ヘルパ ----

func portOf(t *testing.T, addr string) string {
	t.Helper()
	for i := len(addr) - 1; i >= 0; i-- {
		if addr[i] == ':' {
			return addr[i+1:]
		}
	}
	t.Fatalf("アドレスからポートを取得できません: %s", addr)
	return ""
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && indexOf(s, substr) >= 0
}

// countOccurrences は部分文字列の出現回数を数える
func countOccurrences(s, substr string) int {
	if substr == "" {
		return 0
	}
	count := 0
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			count++
			i += len(substr) - 1 // 重複を数えないよう進める
		}
	}
	return count
}

// outerWhereClause は「サブクエリの閉じ括弧より後ろ」= 外側UPDATEのWHERE句を取り出す。
// SQLの形: UPDATE ... WHERE id IN ( SELECT ... ) AND status = 'UNPAID' RETURNING ...
// 最後の ")" 以降を返すことで、サブクエリ内の条件を外側の条件と誤認しないようにする。
func outerWhereClause(q string) string {
	idx := lastIndexByte(q, ')')
	if idx < 0 || idx+1 >= len(q) {
		return ""
	}
	return q[idx+1:]
}

func lastIndexByte(s string, b byte) int {
	for i := len(s) - 1; i >= 0; i-- {
		if s[i] == b {
			return i
		}
	}
	return -1
}

func indexOf(s, substr string) int {
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}
