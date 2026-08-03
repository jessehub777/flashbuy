package router

import (
	"net/http"

	"flashbuy/api/controllers"

	"github.com/gin-gonic/gin"
)

// SetupRouter はGinのルーターを初期化し、すべてのルートを登録します
func SetupRouter(env string) *gin.Engine {
	// 実行環境が本番環境であればGinのモードをReleaseに設定
	if env == "prod" {
		gin.SetMode(gin.ReleaseMode)
	} else {
		gin.SetMode(gin.DebugMode)
	}

	r := gin.Default()

	// ヘルスチェック用エンドポイント
	r.GET("/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"message": "pong",
			"env":     env,
		})
	})

	// v1 API グループ
	v1 := r.Group("/api/v1")
	{
		// コントローラーの初期化
		homeController := controllers.NewHomeController()

		// ホーム画面関連ルート
		homeGroup := v1.Group("/home")
		{
			homeGroup.GET("/top10", homeController.GetTop10)
		}

		// 今後、flashGroup, lotteryGroup などを追加していく
	}

	return r
}
