package controllers

import (
	"flashbuy/api/models"
	"flashbuy/api/pkg/database"
	"flashbuy/api/pkg/logger"
	"flashbuy/api/pkg/response"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// FlashController はフラッシュセール関連のエンドポイントを処理します
type FlashController struct{}

// NewFlashController は新しいFlashControllerインスタンスを返します
func NewFlashController() *FlashController {
	return &FlashController{}
}

// GetFlashList は一覧画面でフラッシュセール商品を返します
// GET /api/v1/flash/list
func (h *FlashController) GetFlashList(c *gin.Context) {
	var flashList []models.FlashItem

	// フラッシュセール商品リスト を取得 (閲覧数降順)、完全終了は除外
	err := database.DB.Select(&flashList, "SELECT * FROM flash_items WHERE ends_at > now() ORDER BY view_count DESC")
	if err != nil {
		logger.Error("フラッシュセール商品の取得に失敗しました", zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}

	response.Success(c, gin.H{
		"flashList": flashList,
	})
}
