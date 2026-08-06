package controllers

import (
	"flashbuy/api/models"
	"flashbuy/api/pkg/database"
	"flashbuy/api/pkg/logger"
	"flashbuy/api/pkg/response"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// LotteryController は抽選関連のエンドポイントを処理します
type LotteryController struct{}

// NewLotteryController は新しいLotteryControllerインスタンスを返します
func NewLotteryController() *LotteryController {
	return &LotteryController{}
}

// GetLotteryList は一覧画面で抽選商品を返します
// GET /api/v1/lottery/list
func (h *LotteryController) GetLotteryList(c *gin.Context) {
	var lotteryList []models.LotteryItem

	// 抽選商品リスト を取得 (閲覧数降順)、完全終了は除外
	err := database.DB.Select(&lotteryList, "SELECT * FROM public.lottery_items WHERE draw_at > now() ORDER BY view_count DESC")
	if err != nil {
		logger.Error("抽選商品の取得に失敗しました", zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}

	response.Success(c, gin.H{
		"lotteryList": lotteryList,
	})
}

// GetLotteryById Lottery詳細
// GET /api/v1/lottery/:id
func (h *LotteryController) GetLotteryById(c *gin.Context) {
	var lotteryItem models.LotteryItem

	// 抽選商品を取得（idで検索、単行はGetを使う）
	err := database.DB.Get(&lotteryItem, "SELECT * FROM lottery_items WHERE id = $1", c.Param("id"))
	if err != nil {
		logger.Error("抽選商品の取得に失敗しました", zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}
	// 閲覧数を1加算
	_, err = database.DB.Exec("UPDATE lottery_items SET view_count = view_count + 1 WHERE id = $1", c.Param("id"))
	if err != nil {
		logger.Error("閲覧数の加算に失敗しました", zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}

	// 抽選商品を返す
	response.Success(c, gin.H{
		"lotteryItem": lotteryItem,
	})
}
