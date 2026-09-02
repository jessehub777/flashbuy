package controllers

import (
	cryptorand "crypto/rand"
	"fmt"
	"math/rand/v2"
	"time"

	"flashbuy/api/middleware"
	"flashbuy/api/pkg/database"
	"flashbuy/api/pkg/logger"
	"flashbuy/api/pkg/response"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// mockPaymentRequest はモック決済のリクエストボディです
// OrderType で対象テーブルを明示する（"flash" または "lottery"）
type mockPaymentRequest struct {
	OrderID   string `json:"orderId" binding:"required"`
	OrderType string `json:"orderType" binding:"required"`
	Amount    int    `json:"amount"` // モックのため金額は検証しない
	Method    string `json:"method" binding:"required"`
}

// mockPaymentResponse はモック決済のレスポンスです
type mockPaymentResponse struct {
	Success       bool   `json:"success"`
	TransactionID string `json:"transactionId"`
	PaidAt        string `json:"paidAt"`
}

// PaymentController は決済関連のエンドポイントを処理します
type PaymentController struct{}

// NewPaymentController は新しいPaymentControllerインスタンスを返します
func NewPaymentController() *PaymentController {
	return &PaymentController{}
}

// MockPay はモック決済を実行します
// POST /api/v1/payment/mock（AuthRequired 必須）
// 60%の確率で成功し、成功時は対象テーブルを UNPAID → PAID に更新します
// 対象テーブルは orderType（"flash" / "lottery"）で一意に決まる
func (h *PaymentController) MockPay(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		response.Error(c, response.CodeUnauthorized)
		return
	}

	var req mockPaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		logger.Error("決済リクエストのパラメータが不正です", zap.Error(err))
		response.Error(c, response.CodeInvalidParam)
		return
	}

	// orderType に応じた更新SQL（lottery は当選後に支払期限が不要になるため pay_deadline をクリア）
	// 支払期限も条件に入れることで、期限切れ処理（order_expirer）が走る前でも
	// 期限を過ぎた注文を支払えないようにする
	var updateSQL string
	switch req.OrderType {
	case "flash":
		updateSQL = `UPDATE flash_orders SET status = 'PAID', paid_at = $1, updated_at = now()
		             WHERE id = $2 AND user_id = $3 AND status = 'UNPAID' AND expires_at >= now()`
	case "lottery":
		updateSQL = `UPDATE lottery_orders SET status = 'PAID', paid_at = $1, pay_deadline = NULL, updated_at = now()
		             WHERE id = $2 AND user_id = $3 AND status = 'UNPAID' AND pay_deadline >= now()`
	default:
		logger.Warn("不正なorderTypeです", zap.String("orderType", req.OrderType))
		response.Error(c, response.CodeInvalidParam)
		return
	}

	// 40%の確率で決済失敗（モックのためランダム）
	if rand.IntN(100) < 40 {
		logger.Info("モック決済が失敗しました",
			zap.String("orderType", req.OrderType), zap.String("orderId", req.OrderID), zap.String("userId", userID))
		response.Success(c, mockPaymentResponse{Success: false})
		return
	}

	// 60%成功：注文/応募を UNPAID → PAID に更新
	paidAt := time.Now()
	res, err := database.DB.Exec(updateSQL, paidAt, req.OrderID, userID)
	if err != nil {
		logger.Error("支払い更新に失敗しました",
			zap.String("orderType", req.OrderType), zap.String("orderId", req.OrderID), zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}

	affected, _ := res.RowsAffected()
	if affected == 0 {
		// 期限切れで弾かれた場合は、ランダムな決済失敗と区別できる専用コードを返す
		if isOrderExpired(req.OrderType, req.OrderID, userID) {
			logger.Warn("支払期限切れの注文への支払いを拒否しました",
				zap.String("orderType", req.OrderType), zap.String("orderId", req.OrderID), zap.String("userId", userID))
			response.Error(c, response.CodeOrderExpired)
			return
		}
		// 対象の注文がない（存在しない / 支払い済み / 他人の注文）
		logger.Warn("支払い対象の注文が見つかりません",
			zap.String("orderType", req.OrderType), zap.String("orderId", req.OrderID), zap.String("userId", userID))
		response.Error(c, response.CodeInvalidParam)
		return
	}

	logger.Info("モック決済が成功しました",
		zap.String("orderType", req.OrderType), zap.String("orderId", req.OrderID), zap.String("userId", userID))

	response.Success(c, mockPaymentResponse{
		Success:       true,
		TransactionID: generateTransactionID(),
		PaidAt:        paidAt.Format(time.RFC3339),
	})
}

// isOrderExpired は対象の注文が支払期限切れかどうかを調べます。
// 更新が0件だった理由を「期限切れ」と「その他の理由（存在しない等）」で
// 区別するために使います。期限切れ処理済み（CANCELLED）の注文も期限切れとして扱います。
func isOrderExpired(orderType, orderID, userID string) bool {
	var query string
	switch orderType {
	case "flash":
		query = `SELECT 1 FROM flash_orders
		         WHERE id = $1 AND user_id = $2 AND status IN ('UNPAID', 'CANCELLED') AND expires_at < now()`
	case "lottery":
		query = `SELECT 1 FROM lottery_orders
		         WHERE id = $1 AND user_id = $2 AND status IN ('UNPAID', 'CANCELLED') AND pay_deadline < now()`
	default:
		return false
	}

	var exists int
	if err := database.DB.Get(&exists, query, orderID, userID); err != nil {
		// 見つからない場合（sql.ErrNoRows）は期限切れではない
		return false
	}
	return true
}

// generateTransactionID はトランザクションIDを生成します（例: TXN-3f8a9c2d）
// crypto/rand でランダムな8桁16進数を作り、衝突を避ける
func generateTransactionID() string {
	b := make([]byte, 4)
	if _, err := cryptorand.Read(b); err != nil {
		// crypto/rand の失敗はほぼ起こらないが、フォールバックとして時刻のみで生成
		return fmt.Sprintf("TXN-%d", time.Now().UnixNano())
	}
	return fmt.Sprintf("TXN-%x", b)
}
