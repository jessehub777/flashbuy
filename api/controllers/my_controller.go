package controllers

import (
	"time"

	"flashbuy/api/pkg/database"
	"flashbuy/api/pkg/logger"
	"flashbuy/api/pkg/response"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// MyController はマイページ（自分の注文・応募履歴）のエンドポイントを処理します
type MyController struct{}

// NewMyController は新しいMyControllerインスタンスを返します
func NewMyController() *MyController {
	return &MyController{}
}

// FlashOrderDTO はマイページ用のフラッシュ注文レスポンスです（商品名をJOINで取得）
type FlashOrderDTO struct {
	ID        string     `db:"id" json:"id"`
	SaleID    string     `db:"sale_id" json:"saleId"`
	SaleName  string     `db:"sale_name" json:"saleName"`
	Price     int        `db:"price" json:"price"`
	Status    string     `db:"status" json:"status"` // 'UNPAID','PAID','CANCELLED'
	CreatedAt time.Time  `db:"created_at" json:"createdAt"`
	PaidAt    *time.Time `db:"paid_at" json:"paidAt,omitempty"`
}

// LotteryOrderDTO はマイページ用の抽選応募レスポンスです（商品名をJOINで取得）
type LotteryOrderDTO struct {
	ID          string     `db:"id" json:"id"`
	LotteryID   string     `db:"lottery_id" json:"lotteryId"`
	LotteryName string     `db:"lottery_name" json:"lotteryName"`
	AppliedAt   time.Time  `db:"applied_at" json:"appliedAt"`
	Status      string     `db:"status" json:"status"` // 'WAITING','UNPAID','LOST','PAID','CANCELLED'
	PayDeadline *time.Time `db:"pay_deadline" json:"payDeadline,omitempty"`
	Price       int        `db:"price" json:"price"`
}

// GetMyFlashOrderList はログイン中のユーザーのフラッシュ注文一覧を返します
// GET /api/v1/my/flashOrderList（AuthRequired 必須）
func (h *MyController) GetMyFlashOrderList(c *gin.Context) {
	userID := c.GetString("userId")
	if userID == "" {
		response.Error(c, response.CodeUnauthorized)
		return
	}

	var flashOrderList []FlashOrderDTO
	err := database.DB.Select(&flashOrderList, `
		SELECT fo.id, fo.flash_id AS sale_id, fi.name AS sale_name,
		       fo.price, fo.status, fo.created_at, fo.paid_at
		FROM flash_orders fo
		JOIN flash_items fi ON fi.id = fo.flash_id
		WHERE fo.user_id = $1
		ORDER BY fo.created_at DESC`, userID)
	if err != nil {
		logger.Error("フラッシュ注文の取得に失敗しました", zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}
	// データが0件の場合も空配列を返す（nullではなく[]）
	if flashOrderList == nil {
		flashOrderList = []FlashOrderDTO{}
	}

	response.Success(c, gin.H{
		"flashOrderList": flashOrderList,
	})
}

// GetMyLotteryOrderList はログイン中のユーザーの抽選応募一覧を返します
// GET /api/v1/my/lotteryOrderList（AuthRequired 必須）
func (h *MyController) GetMyLotteryOrderList(c *gin.Context) {
	userID := c.GetString("userId")
	if userID == "" {
		response.Error(c, response.CodeUnauthorized)
		return
	}

	var lotteryOrderList []LotteryOrderDTO
	err := database.DB.Select(&lotteryOrderList, `
		SELECT lo.id, lo.lottery_id, li.name AS lottery_name,
		       lo.applied_at, lo.status, lo.pay_deadline, lo.price
		FROM lottery_orders lo
		JOIN lottery_items li ON li.id = lo.lottery_id
		WHERE lo.user_id = $1
		ORDER BY lo.applied_at DESC`, userID)
	if err != nil {
		logger.Error("抽選応募の取得に失敗しました", zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}
	// データが0件の場合も空配列を返す（nullではなく[]）
	if lotteryOrderList == nil {
		lotteryOrderList = []LotteryOrderDTO{}
	}

	response.Success(c, gin.H{
		"lotteryOrderList": lotteryOrderList,
	})
}
