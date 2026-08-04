package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"flashbuy/api/config"
	"flashbuy/api/pkg/cache"
	"flashbuy/api/pkg/database"
	"flashbuy/api/pkg/logger"
	"flashbuy/api/router"

	"go.uber.org/zap"
)

func main() {
	// 1. 設定ファイルの読み込み
	cfg, err := config.LoadConfig()
	if err != nil {
		// ロガーがまだ初期化されていないので標準のpanicを使用
		panic("設定の読み込みに失敗しました: " + err.Error())
	}

	// 2. ロガーの初期化
	if err := logger.InitLogger(cfg.App.Env); err != nil {
		panic("ロガーの初期化に失敗しました: " + err.Error())
	}
	// アプリケーション終了時にログのバッファをフラッシュ
	defer logger.Sync()

	logger.Info("設定とロガーの初期化が完了しました", zap.String("env", cfg.App.Env))

	// 3. データベースへの接続初期化
	if err := database.InitDB(&cfg.Database); err != nil {
		logger.Fatal("データベースの初期化に失敗しました", zap.Error(err))
	}
	defer database.CloseDB()

	// 4. Redisへの接続初期化
	if err := cache.InitRedis(&cfg.Redis); err != nil {
		logger.Fatal("Redisの初期化に失敗しました", zap.Error(err))
	}
	defer cache.CloseRedis()

	// 5. Gin HTTPサーバーの設定とルーティング
	r := router.SetupRouter(cfg.App.Env)

	// サーバーインスタンスの作成
	srv := &http.Server{
		Addr:    ":" + cfg.App.Port,
		Handler: r,
	}

	// 6. サーバーの起動とグレースフルシャットダウンの設定
	// ゴルーチンを使って非同期でサーバーを起動
	go func() {
		logger.Info("HTTPサーバーを起動します", zap.String("port", cfg.App.Port))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("HTTPサーバー起動エラー", zap.Error(err))
		}
	}()

	// OSからの終了シグナル（Ctrl+CやSIGTERM等）を待機
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit // シグナルを受信するまでブロック
	logger.Info("シャットダウンシグナルを受信しました。サーバーを停止します...")

	// 5秒のタイムアウト付きコンテキストを作成
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// 実行中のリクエストの完了を待ってからサーバーをシャットダウン
	if err := srv.Shutdown(ctx); err != nil {
		logger.Fatal("サーバーのシャットダウン中にエラーが発生しました", zap.Error(err))
	}

	logger.Info("サーバーが正常に終了しました")
}
