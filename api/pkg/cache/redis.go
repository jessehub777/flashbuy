package cache

import (
	"context"
	"fmt"
	"time"

	"flashbuy/api/config"
	"flashbuy/api/pkg/logger"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

var (
	// RedisClient はグローバルのRedisクライアントです
	RedisClient *redis.Client
	// Ctx はRedisコマンド用のコンテキストです
	Ctx = context.Background()
)

// InitRedis はRedisキャッシュサーバーへの接続を初期化します。
func InitRedis(cfg *config.RedisConfig) error {
	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)

	logger.Info("Redisへの接続を開始します", zap.String("addr", addr))

	client := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: cfg.Password, // パスワードが設定されていない場合は空文字
		DB:       cfg.DB,       // デフォルトのDB番号
		PoolSize: 100,          // コネクションプールのサイズ（並行処理を考慮）
	})

	// 接続確認 (Ping)
	// タイムアウト付きのコンテキストを使って5秒以内に接続できるか確認します
	ctx, cancel := context.WithTimeout(Ctx, 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		logger.Error("Redis接続エラー", zap.Error(err))
		return err
	}

	RedisClient = client
	logger.Info("Redis接続に成功しました")

	return nil
}

// CloseRedis はRedis接続を適切に閉じます。
// アプリケーション終了時に呼び出してください。
func CloseRedis() {
	if RedisClient != nil {
		logger.Info("Redis接続をクローズします")
		_ = RedisClient.Close()
	}
}
