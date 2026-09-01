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

// FlashOrderDTO はマイページ用のフラッシュ注文レスポンスです（商品名・画像をJOINで取得）
type FlashOrderDTO struct {
	ID         string     `db:"id" json:"id"`
	SaleID     string     `db:"sale_id" json:"saleId"`
	SaleName   string     `db:"sale_name" json:"saleName"`
	ImageS3Key *string    `db:"image_s3_key" json:"imageS3Key,omitempty"`
	Price      int        `db:"price" json:"price"`
	Status     string     `db:"status" json:"status"` // 'UNPAID','PAID','CANCELLED'
	CreatedAt  time.Time  `db:"created_at" json:"createdAt"`
	PaidAt     *time.Time `db:"paid_at" json:"paidAt,omitempty"`
	// 支払期限（UNPAIDのみ設定。期限を過ぎると自動キャンセルされる）
	ExpiresAt *time.Time `db:"expires_at" json:"expiresAt,omitempty"`
}

// LotteryOrderDTO はマイページ用の抽選応募レスポンスです（商品名・画像をJOINで取得）
type LotteryOrderDTO struct {
	ID          string     `db:"id" json:"id"`
	LotteryID   string     `db:"lottery_id" json:"lotteryId"`
	LotteryName string     `db:"lottery_name" json:"lotteryName"`
	ImageS3Key  *string    `db:"image_s3_key" json:"imageS3Key,omitempty"`
	AppliedAt   time.Time  `db:"applied_at" json:"appliedAt"`
	Status      string     `db:"status" json:"status"` // 'WAITING','UNPAID','LOST','PAID','CANCELLED'
	PayDeadline *time.Time `db:"pay_deadline" json:"payDeadline,omitempty"`
	Price       int        `db:"price" json:"price"`              // 応募費（0 = 応募無料）
	ChosenPrice int        `db:"chosen_price" json:"chosenPrice"` // 当選時に実際に支払う金額
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
		SELECT fo.id, fo.flash_id AS sale_id, fi.name AS sale_name, fi.image_s3_key,
		       fo.price, fo.status, fo.created_at, fo.paid_at, fo.expires_at
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
		SELECT lo.id, lo.lottery_id, li.name AS lottery_name, li.image_s3_key,
		       lo.applied_at, lo.status, lo.pay_deadline, lo.price, lo.chosen_price
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
