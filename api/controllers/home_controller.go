package controllers

import (
	"flashbuy/api/models"
	"flashbuy/api/pkg/database"
	"flashbuy/api/pkg/logger"
	"flashbuy/api/pkg/response"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// HomeController はホーム画面関連のエンドポイントを処理します
type HomeController struct{}

// NewHomeController は新しいHomeControllerインスタンスを返します
func NewHomeController() *HomeController {
	return &HomeController{}
}

// GetTop10 は人気のフラッシュセールと抽選商品のトップ10を返します
// GET /api/v1/home/top10
func (h *HomeController) GetTop10(c *gin.Context) {
	var flashList []models.FlashItem
	var lotteryList []models.LotteryItem

	// 1. フラッシュセール商品 Top 10 を取得 (閲覧数降順)
	err := database.DB.Select(&flashList, "SELECT * FROM flash_items WHERE ends_at > now() ORDER BY view_count DESC LIMIT 10")
	if err != nil {
		logger.Error("フラッシュセール商品の取得に失敗しました", zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}

	// 2. 抽選商品 Top 10 を取得 (閲覧数降順)
	err = database.DB.Select(&lotteryList, "SELECT * FROM lottery_items WHERE draw_at > now() ORDER BY view_count DESC LIMIT 10")
	if err != nil {
		logger.Error("抽選商品の取得に失敗しました", zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}

	response.Success(c, gin.H{
		"flashList":   flashList,
		"lotteryList": lotteryList,
	})
}
