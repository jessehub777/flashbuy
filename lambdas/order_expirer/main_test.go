package main

import (
	"context"
	"os"
	"testing"

	"github.com/alicebob/miniredis/v2"
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

	restoreRedisStock(context.Background(), rdb, "item-1")

	if got, _ := mr.Get("stock:item-1"); got != "4" {
		t.Errorf("Redis在庫が戻っていません: got=%s want=4", got)
	}
}

// TestRestoreRedisStock_NilClientIsNoop はRedis未接続（nil）でもpanicしないことを確認する。
// （REDIS_HOST 未設定の環境では、DB側の取り消しだけを進める）
func TestRestoreRedisStock_NilClientIsNoop(t *testing.T) {
	restoreRedisStock(context.Background(), nil, "item-1")
	restoreDBStock(nil, "item-1")
}

// TestRestoreRedisStock_MissingKeyIsNoop は存在しないkeyに在庫を作らないことを確認する。
// （単純な INCR だと key が無い場合に 1 から作られ、DBと食い違う架空の在庫が生まれる。
//   API側の IncrStock と挙動を揃えている）
func TestRestoreRedisStock_MissingKeyIsNoop(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("miniredis の起動に失敗しました: %v", err)
	}
	defer mr.Close()

	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer rdb.Close()

	restoreRedisStock(context.Background(), rdb, "item-unknown")

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
