package controllers

import (
	"flashbuy/api/models"
	"flashbuy/api/pkg/cache"
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

// top10Data はホームのTop10レスポンスデータです
type top10Data struct {
	FlashList   []models.FlashItem   `json:"flashList"`
	LotteryList []models.LotteryItem `json:"lotteryList"`
}

// GetTop10 は人気のフラッシュセールと抽選商品のトップ10を返します
// GET /api/v1/home/top10
func (h *HomeController) GetTop10(c *gin.Context) {
	// キャッシュ優先で取得（TTL 30秒）。ミス時はDBから取得してキャッシュに書き戻す
	data, err := cache.Remember(cache.KeyHomeTop10, cache.TTLList, func() (top10Data, error) {
		var flashList []models.FlashItem
		// フラッシュセール商品 Top 10 を取得 (閲覧数降順)
		if err := database.DB.Select(&flashList, "SELECT * FROM flash_items WHERE ends_at > now() ORDER BY view_count DESC LIMIT 10"); err != nil {
			return top10Data{}, err
		}

		var lotteryList []models.LotteryItem
		// 抽選商品 Top 10 を取得 (閲覧数降順)
		if err := database.DB.Select(&lotteryList, "SELECT * FROM lottery_items WHERE draw_at > now() ORDER BY view_count DESC LIMIT 10"); err != nil {
			return top10Data{}, err
		}

		return top10Data{FlashList: flashList, LotteryList: lotteryList}, nil
	})
	if err != nil {
		logger.Error("ホームTop10の取得に失敗しました", zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}

	response.Success(c, gin.H{
		"flashList":   data.FlashList,
		"lotteryList": data.LotteryList,
	})
}
