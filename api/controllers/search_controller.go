package controllers

import (
	"flashbuy/api/models"
	"flashbuy/api/pkg/database"
	"flashbuy/api/pkg/logger"
	"flashbuy/api/pkg/response"
	"strings"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// SearchController は検索関連のエンドポイントを処理します
type SearchController struct{}

// NewSearchController は新しいSearchControllerインスタンスを返します
func NewSearchController() *SearchController {
	return &SearchController{}
}

// Search はフラッシュセールと抽選商品をキーワードで検索します
// GET /api/v1/search?query=xxx&timeRange=6m|1y|3y
func (h *SearchController) Search(c *gin.Context) {
	query := strings.TrimSpace(c.Query("query"))
	if query == "" {
		response.Error(c, response.CodeInvalidParam)
		return
	}

	// 対象期間（デフォルトは6ヶ月以内）
	timeRange := c.DefaultQuery("timeRange", "6m")
	interval := "6 months"
	switch timeRange {
	case "1y":
		interval = "12 months"
	case "3y":
		interval = "36 months"
	}

	var flashList []models.FlashItem
	err := database.DB.Select(&flashList, `
		SELECT * FROM flash_items
		WHERE starts_at > now() - $2::interval
		  AND (name ILIKE '%' || $1 || '%'
		       OR description ILIKE '%' || $1 || '%'
		       OR category ILIKE '%' || $1 || '%')
		ORDER BY view_count DESC`, query, interval)
	if err != nil {
		logger.Error("フラッシュセール商品の検索に失敗しました", zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}

	var lotteryList []models.LotteryItem
	err = database.DB.Select(&lotteryList, `
		SELECT * FROM lottery_items
		WHERE starts_at > now() - $2::interval
		  AND (name ILIKE '%' || $1 || '%'
		       OR description ILIKE '%' || $1 || '%'
		       OR category ILIKE '%' || $1 || '%')
		ORDER BY view_count DESC`, query, interval)
	if err != nil {
		logger.Error("抽選商品の検索に失敗しました", zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}

	// 0件のときも [] を返す（nil のままだと JSON が null になり、フロント側のエラーになるため）
	if flashList == nil {
		flashList = []models.FlashItem{}
	}
	if lotteryList == nil {
		lotteryList = []models.LotteryItem{}
	}

	response.Success(c, gin.H{
		"flashList":   flashList,
		"lotteryList": lotteryList,
	})
}
