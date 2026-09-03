package controllers

import (
	"errors"
	"time"

	"flashbuy/api/middleware"
	"flashbuy/api/pkg/cache"
	"flashbuy/api/pkg/database"
	"flashbuy/api/pkg/logger"
	"flashbuy/api/pkg/response"
	"flashbuy/api/pkg/scheduler"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// 注文の支払い期限（フラッシュセールで確保した在庫のロック時間）
const paymentExpiry = 15 * time.Minute

// buyFlashRequest は購入リクエストのボディ構造体です
type buyFlashRequest struct {
	SaleID string `json:"saleId" binding:"required"`
}

// BuyFlash はフラッシュセール商品を購入します
// POST /api/v1/flash/buy（AuthRequired 必須）
// フロー:
//  1. 在庫をRedisでロック（Lua原子減算、未プレヒートならDBからロード）
//  2. 注文を作成（UNPAID、expires_at=現在+15分）
//  3. DBの在庫を1減らす
//
// 在庫切れの場合は CodeOutOfStock を返す
func (h *FlashController) BuyFlash(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		response.Error(c, response.CodeUnauthorized)
		return
	}

	var req buyFlashRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		logger.Error("購入リクエストのパラメータが不正です", zap.Error(err))
		response.Error(c, response.CodeInvalidParam)
		return
	}

	// 1. 在庫を1つロックする
	if err := lockStock(req.SaleID); err != nil {
		if errors.Is(err, cache.ErrOutOfStock) {
			response.Error(c, response.CodeOutOfStock)
			return
		}
		logger.Error("在庫のロックに失敗しました", zap.String("saleId", req.SaleID), zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}

	// 2. 商品価格を取得（在庫をロック済みなので、価格が取れない場合はロックを戻す）
	var price int
	if err := database.DB.Get(&price, "SELECT price FROM flash_items WHERE id = $1", req.SaleID); err != nil {
		logger.Error("商品価格の取得に失敗しました", zap.String("saleId", req.SaleID), zap.Error(err))
		_ = cache.IncrStock(req.SaleID) // ロックを戻す
		response.Error(c, response.CodeSystemError)
		return
	}

	// 3. 注文作成とDB在庫の減算を同一トランザクションで行う
	//    （どちらかが失敗したら両方ロールバックし、Redisのロックも戻す）
	tx, err := database.DB.Beginx()
	if err != nil {
		logger.Error("トランザクションの開始に失敗しました", zap.Error(err))
		_ = cache.IncrStock(req.SaleID) // ロックを戻す
		response.Error(c, response.CodeSystemError)
		return
	}

	// 支払期限は「DB書き込み」と「Schedule登録」の両方で使うため、同じ時刻を1回だけ作る。
	// 2箇所で別々に time.Now() を呼ぶとミリ秒ずれが生じ、Scheduleの at() が
	// expires_at より先に発火して「期限前」と判定され取消が飛ばされる恐れがある
	// （Scheduleは実行後自動削除されるため、その場合はcronスキャンでの回収に回る）。
	expiresAt := time.Now().Add(paymentExpiry)

	// 注文を作成（支払い期限 = 15分後）
	// 支払い画面で使うため、作成した注文のIDを返す
	var orderID string
	err = tx.QueryRow(
		`INSERT INTO flash_orders (user_id, flash_id, price, status, expires_at)
		 VALUES ($1, $2, $3, 'UNPAID', $4)
		 RETURNING id`,
		userID, req.SaleID, price, expiresAt,
	).Scan(&orderID)
	if err != nil {
		tx.Rollback()
		logger.Error("注文の作成に失敗しました", zap.String("saleId", req.SaleID), zap.Error(err))
		_ = cache.IncrStock(req.SaleID) // ロックを戻す
		response.Error(c, response.CodeSystemError)
		return
	}

	// DBの在庫を1減らす（在庫ロック済みなので必ず成功するはず）
	_, err = tx.Exec(
		"UPDATE flash_items SET stock = stock - 1 WHERE id = $1 AND stock > 0", req.SaleID,
	)
	if err != nil {
		tx.Rollback()
		logger.Error("DB在庫の更新に失敗しました", zap.String("saleId", req.SaleID), zap.Error(err))
		_ = cache.IncrStock(req.SaleID) // ロックを戻す
		response.Error(c, response.CodeSystemError)
		return
	}

	if err := tx.Commit(); err != nil {
		logger.Error("トランザクションのコミットに失敗しました", zap.Error(err))
		_ = cache.IncrStock(req.SaleID) // ロックを戻す
		response.Error(c, response.CodeSystemError)
		return
	}

	logger.Info("フラッシュ購入が完了しました",
		zap.String("orderId", orderID), zap.String("userId", userID), zap.String("saleId", req.SaleID))

	// 支払期限到来時に OrderExpirer Lambda を個別に起動するScheduleを登録する。
	// 時刻はDB書き込みと同じ expiresAt を使う（ずれると期限前判定で取消が飛ぶため）。
	// 登録に失敗しても注文自体は成立しているため、エラーにはせずログのみ残す
	// （OrderExpirer の cron スキャンが後から回収する）
	if err := scheduler.RegisterExpireSchedule("flash", orderID, expiresAt); err != nil {
		logger.Warn("期限切れScheduleの登録に失敗しました（cronスキャンで回収されます）",
			zap.String("orderId", orderID), zap.Error(err))
	}

	response.Success(c, gin.H{
		"orderId": orderID,
		"status":  "QUEUED",
	})
}

// lockStock は在庫を1つロックします。
// Redis未プレヒートの場合はDBの在庫をロードしてからロックする（惰性プレヒート）
func lockStock(saleID string) error {
	_, err := cache.DecrStock(saleID)
	if err == nil {
		return nil
	}
	// 未プレヒートならDBからロードしてリトライ
	if errors.Is(err, cache.ErrNotPreheated) {
		var stock int
		if err := database.DB.Get(&stock, "SELECT stock FROM flash_items WHERE id = $1", saleID); err != nil {
			return err
		}
		if err := cache.InitStock(saleID, stock, 0); err != nil {
			return err
		}
		_, err = cache.DecrStock(saleID)
		return err
	}
	return err
}
