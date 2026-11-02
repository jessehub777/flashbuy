package controllers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"flashbuy/api/pkg/cache"
	"flashbuy/api/pkg/database"
	"flashbuy/api/pkg/response"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/alicebob/miniredis/v2"
	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
	"github.com/redis/go-redis/v9"
)

// 購入 API のテスト。
//
// ここで見たいのは「在庫の引き当て」と「DB トランザクション」の境界。
// Redis は miniredis、DB は sqlmock で置き換え、コンテナを起動せずに
// 分岐と巻き戻しだけを検証する（CI を遅くしないため）。

const (
	testSaleID = "sale-1"
	testUserID = "user-1"
)

type buyTestEnv struct {
	ctx  *gin.Context
	rec  *httptest.ResponseRecorder
	mock sqlmock.Sqlmock
	mr   *miniredis.Miniredis
}

func newBuyTestEnv(t *testing.T) *buyTestEnv {
	t.Helper()
	gin.SetMode(gin.TestMode)

	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/flash/buy",
		bytes.NewBufferString(`{"saleId":"`+testSaleID+`"}`))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("userId", testUserID)

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock の初期化に失敗: %v", err)
	}
	database.DB = sqlx.NewDb(db, "postgres")

	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("miniredis の起動に失敗: %v", err)
	}
	cache.RedisClient = redis.NewClient(&redis.Options{Addr: mr.Addr()})

	t.Cleanup(func() {
		_ = db.Close()
		mr.Close()
	})

	return &buyTestEnv{ctx: c, rec: rec, mock: mock, mr: mr}
}

// 商品マスタの取得を期待する（BuyFlash の最初のクエリ）
func (e *buyTestEnv) expectFlashItem() {
	e.mock.ExpectQuery(`SELECT price, starts_at, ends_at FROM flash_items`).
		WithArgs(testSaleID).
		WillReturnRows(sqlmock.NewRows([]string{"price", "starts_at", "ends_at"}).
			AddRow(1000, time.Now().Add(-time.Hour), time.Now().Add(time.Hour)))
}

// Redis 上の在庫を返す
func (e *buyTestEnv) redisStock(t *testing.T) string {
	t.Helper()
	v, err := e.mr.Get(cache.KeyStock + testSaleID)
	if err != nil {
		t.Fatalf("Redis の在庫を取得できません: %v", err)
	}
	return v
}

// レスポンスボディの code を返す（HTTP は常に 200）
func (e *buyTestEnv) resultCode(t *testing.T) int {
	t.Helper()
	var resp response.Response
	if err := json.Unmarshal(e.rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("レスポンスのパースに失敗: %v (body=%s)", err, e.rec.Body.String())
	}
	return resp.Code
}

// 在庫が 0 のとき、注文を作らずに完売を返すこと。
// DB へのクエリは商品取得の 1 回だけで、トランザクションは開始されない。
func TestBuyFlash_OutOfStock(t *testing.T) {
	env := newBuyTestEnv(t)
	if err := env.mr.Set(cache.KeyStock+testSaleID, "0"); err != nil {
		t.Fatalf("在庫の初期化に失敗: %v", err)
	}
	env.expectFlashItem()

	NewFlashController().BuyFlash(env.ctx)

	if got := env.resultCode(t); got != response.CodeOutOfStock {
		t.Fatalf("code = %d, want %d", got, response.CodeOutOfStock)
	}
	if err := env.mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("想定外の SQL が実行された: %v", err)
	}
	// 引き当てに失敗しているので、在庫は減らない
	if got := env.redisStock(t); got != "0" {
		t.Fatalf("Redis の在庫 = %s, want 0", got)
	}
}

// 同一ユーザー・同一商品の重複購入を、部分ユニークインデックスで弾くこと。
// 注文は作られず、引き当てた在庫は Redis に戻る。
func TestBuyFlash_DuplicateOrder(t *testing.T) {
	env := newBuyTestEnv(t)
	if err := env.mr.Set(cache.KeyStock+testSaleID, "5"); err != nil {
		t.Fatalf("在庫の初期化に失敗: %v", err)
	}
	env.expectFlashItem()

	env.mock.ExpectBegin()
	env.mock.ExpectQuery(`INSERT INTO flash_orders`).
		WillReturnError(&pq.Error{Code: "23505"})
	env.mock.ExpectRollback()

	NewFlashController().BuyFlash(env.ctx)

	if got := env.resultCode(t); got != response.CodeAlreadyBought {
		t.Fatalf("code = %d, want %d", got, response.CodeAlreadyBought)
	}
	if err := env.mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("想定外の SQL が実行された: %v", err)
	}
	// 注文が成立していないので、引き当てた在庫は戻っている
	if got := env.redisStock(t); got != "5" {
		t.Fatalf("Redis の在庫 = %s, want 5（戻っていない）", got)
	}
}

// DB 側の在庫が尽きていた場合、注文ごとロールバックして完売を返すこと。
// Redis と DB がずれていても売り越さないための経路。
func TestBuyFlash_DBStockExhausted(t *testing.T) {
	env := newBuyTestEnv(t)
	if err := env.mr.Set(cache.KeyStock+testSaleID, "5"); err != nil {
		t.Fatalf("在庫の初期化に失敗: %v", err)
	}
	env.expectFlashItem()

	env.mock.ExpectBegin()
	env.mock.ExpectQuery(`INSERT INTO flash_orders`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("order-1"))
	// 条件付き UPDATE が 1 行も更新できなかった = DB の在庫が 0
	env.mock.ExpectExec(`UPDATE flash_items SET stock = stock - 1`).
		WillReturnResult(sqlmock.NewResult(0, 0))
	env.mock.ExpectRollback()

	NewFlashController().BuyFlash(env.ctx)

	if got := env.resultCode(t); got != response.CodeOutOfStock {
		t.Fatalf("code = %d, want %d", got, response.CodeOutOfStock)
	}
	if err := env.mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("想定外の SQL が実行された: %v", err)
	}
	if got := env.redisStock(t); got != "5" {
		t.Fatalf("Redis の在庫 = %s, want 5（戻っていない）", got)
	}
}
