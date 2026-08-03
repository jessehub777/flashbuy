package controllers

import (
	"net/http"

	"github.com/gin-gonic/gin"
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
	// 将来的にRedisやDBからデータを取得する処理を実装
	// 現在は構造のみのスタブ実装です
	c.JSON(http.StatusOK, gin.H{
		"message": "success",
		"data": gin.H{
			"flashList":   []interface{}{},
			"lotteryList": []interface{}{},
		},
	})
}
