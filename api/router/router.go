package router

import (
	"net/http"

	"flashbuy/api/controllers"
	"flashbuy/api/middleware"
	"flashbuy/api/pkg/auth"

	"github.com/gin-gonic/gin"
)

// SetupRouter はGinのルーターを初期化し、すべてのルートを登録します
func SetupRouter(env string, cognitoClient *auth.CognitoClient) *gin.Engine {
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

		// フラッシュセール関連ルート
		flashController := controllers.NewFlashController()
		flashGroup := v1.Group("/flash")
		{
			flashGroup.GET("/list", flashController.GetFlashList)
			flashGroup.GET("/getFlashById/:id", flashController.GetFlashById)
			flashGroup.POST("/buy", middleware.AuthRequired(), flashController.BuyFlash)
		}
		// 抽選関連ルート
		lotteryController := controllers.NewLotteryController()
		lotteryGroup := v1.Group("/lottery")
		{
			lotteryGroup.GET("/list", lotteryController.GetLotteryList)
			lotteryGroup.GET("/getLotteryById/:id", lotteryController.GetLotteryById)
		}

		// 検索関連ルート
		searchController := controllers.NewSearchController()
		searchGroup := v1.Group("/search")
		{
			searchGroup.GET("", searchController.Search)
		}

		// 認証ルート
		authController := controllers.NewAuthController(cognitoClient)
		authGroup := v1.Group("/auth")
		{
			authGroup.POST("/register", authController.Register)
			authGroup.POST("/login", authController.Login)
			authGroup.POST("/refresh", authController.Refresh)
			authGroup.POST("/logout", authController.Logout)
		}

		// マイページルート（認証必須）
		myController := controllers.NewMyController()
		myGroup := v1.Group("/my", middleware.AuthRequired())
		{
			myGroup.GET("/flashOrderList", myController.GetMyFlashOrderList)
			myGroup.GET("/lotteryOrderList", myController.GetMyLotteryOrderList)
		}
	}

	return r
}
