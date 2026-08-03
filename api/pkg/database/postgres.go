package database

import (
	"fmt"
	"time"

	"flashbuy/api/config"
	"flashbuy/api/pkg/logger"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"go.uber.org/zap"
)

// DB はグローバルのデータベース接続プールです
var DB *sqlx.DB

// InitDB はPostgreSQLデータベースへの接続を初期化します。
// 設定ファイルから接続情報を読み込み、sqlxを使って接続プールを設定します。
func InitDB(cfg *config.DatabaseConfig) error {
	// DSN (Data Source Name) の構築
	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%d sslmode=%s",
		cfg.Host, cfg.User, cfg.Password, cfg.DBName, cfg.Port, cfg.SSLMode)

	logger.Info("データベースへの接続を開始します", zap.String("host", cfg.Host), zap.Int("port", cfg.Port))

	// sqlx.Connect を使って接続とPingを同時に実行
	db, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		logger.Error("データベース接続エラー", zap.Error(err))
		return err
	}

	// コネクションプールの設定（パフォーマンス最適化）
	db.SetMaxIdleConns(10)           // アイドル状態の最大コネクション数
	db.SetMaxOpenConns(100)          // オープン可能な最大コネクション数
	db.SetConnMaxLifetime(time.Hour) // コネクションの最大生存期間

	// グローバル変数にセット
	DB = db
	logger.Info("データベース接続に成功しました")

	return nil
}

// CloseDB はデータベース接続を適切に閉じます。
// アプリケーション終了時に呼び出してください。
func CloseDB() {
	if DB != nil {
		logger.Info("データベース接続をクローズします")
		_ = DB.Close()
	}
}
