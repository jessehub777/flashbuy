package task

import (
	"time"

	"flashbuy/api/pkg/cache"
	"flashbuy/api/pkg/database"
	"flashbuy/api/pkg/logger"

	"go.uber.org/zap"
)

// expiredOrder は期限切れチェック対象の注文です
type expiredOrder struct {
	ID      string `db:"id"`
	FlashID string `db:"flash_id"`
}

// expiredLotteryOrder は期限切れチェック対象の抽選注文です
type expiredLotteryOrder struct {
	ID string `db:"id"`
}

// StartOrderExpirer は期限切れ未払い注文の定期処理を開始します。
// 支払い期限（expires_at）を過ぎた UNPAID 注文を CANCELLED にし、ロック済みの在庫を戻します。
// バックグラウンドで動き続けるため、main関数で goroutine として呼び出す
func StartOrderExpirer(interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	logger.Info("注文の期限切れ監視を開始します", zap.Duration("interval", interval))

	for range ticker.C {
		expireOrders()
		expireLotteryOrders()
	}
}

// expireOrders は期限切れ注文を1回分処理します
func expireOrders() {
	var orders []expiredOrder
	// 支払い期限切れの未払い注文を取得
	err := database.DB.Select(&orders, `
		SELECT id, flash_id FROM flash_orders
		WHERE status = 'UNPAID' AND expires_at < now()`)
	if err != nil {
		logger.Error("期限切れ注文の取得に失敗しました", zap.Error(err))
		return
	}

	for _, o := range orders {
		processExpiredOrder(o)
	}
}

// expireLotteryOrders は支払期限切れの未払い抽選注文を1回分処理します
// 抽選は枠数制（在庫ではない）のため、キャンセル時に在庫の戻し処理は不要
func expireLotteryOrders() {
	var orders []expiredLotteryOrder
	// 支払期限切れの未払い抽選注文を取得
	err := database.DB.Select(&orders, `
		SELECT id FROM lottery_orders
		WHERE status = 'UNPAID' AND pay_deadline < now()`)
	if err != nil {
		logger.Error("期限切れ抽選注文の取得に失敗しました", zap.Error(err))
		return
	}

	for _, o := range orders {
		processExpiredLotteryOrder(o)
	}
}

// processExpiredLotteryOrder は1件の期限切れ抽選注文をキャンセルします
func processExpiredLotteryOrder(o expiredLotteryOrder) {
	res, err := database.DB.Exec(
		"UPDATE lottery_orders SET status = 'CANCELLED', updated_at = now() WHERE id = $1 AND status = 'UNPAID'", o.ID)
	if err != nil {
		logger.Error("期限切れ抽選注文のキャンセルに失敗しました", zap.String("orderId", o.ID), zap.Error(err))
		return
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		// すでに別処理でキャンセル済み
		return
	}

	logger.Info("期限切れ抽選注文をキャンセルしました", zap.String("orderId", o.ID))
}

// processExpiredOrder は1件の期限切れ注文をキャンセルして在庫を戻します
func processExpiredOrder(o expiredOrder) {
	// 注文をキャンセル（WHERE status='UNPAID' で二重処理を防ぐ）
	res, err := database.DB.Exec(
		"UPDATE flash_orders SET status = 'CANCELLED', updated_at = now() WHERE id = $1 AND status = 'UNPAID'", o.ID)
	if err != nil {
		logger.Error("期限切れ注文のキャンセルに失敗しました", zap.String("orderId", o.ID), zap.Error(err))
		return
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		// すでに別処理でキャンセル済み
		return
	}

	// ロック済みの在庫をRedisとDBの両方で戻す
	if err := cache.IncrStock(o.FlashID); err != nil {
		logger.Error("Redis在庫の復元に失敗しました", zap.String("flashId", o.FlashID), zap.Error(err))
	}
	if _, err := database.DB.Exec(
		"UPDATE flash_items SET stock = stock + 1 WHERE id = $1", o.FlashID); err != nil {
		logger.Error("DB在庫の復元に失敗しました", zap.String("flashId", o.FlashID), zap.Error(err))
		return
	}

	logger.Info("期限切れ注文をキャンセルし、在庫を戻しました",
		zap.String("orderId", o.ID), zap.String("flashId", o.FlashID))
}
