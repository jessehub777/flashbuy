package database

import (
	"fmt"
	"time"

	"flashbuy/api/config"
	"flashbuy/api/pkg/logger"

	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

var DB *gorm.DB

// InitDB はPostgreSQLデータベースへの接続を初期化します。
// 設定ファイル（または環境変数）から接続情報を読み込み、GORMを使って接続プールを設定します。
func InitDB(cfg *config.DatabaseConfig) error {
	// DSN (Data Source Name) の構築
	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%d sslmode=%s",
		cfg.Host, cfg.User, cfg.Password, cfg.DBName, cfg.Port, cfg.SSLMode)

	logger.Info("データベースへの接続を開始します", zap.String("host", cfg.Host), zap.Int("port", cfg.Port))

	// GORMの初期化（ログ出力の設定を追加）
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: gormlogger.Default.LogMode(gormlogger.Info),
	})

	if err != nil {
		logger.Error("データベース接続エラー", zap.Error(err))
		return err
	}

	// 内部の*sql.DBを取得してコネクションプールの詳細設定を行う
	sqlDB, err := db.DB()
	if err != nil {
		logger.Error("データベースインスタンス取得エラー", zap.Error(err))
		return err
	}

	// コネクションプールの設定（パフォーマンス最適化）
	sqlDB.SetMaxIdleConns(10)           // アイドル状態の最大コネクション数
	sqlDB.SetMaxOpenConns(100)          // オープン可能な最大コネクション数
	sqlDB.SetConnMaxLifetime(time.Hour) // コネクションの最大生存期間

	// グローバル変数にセット
	DB = db
	logger.Info("データベース接続に成功しました")

	return nil
}

// CloseDB はデータベース接続を適切に閉じます。
// アプリケーション終了時に呼び出してください。
func CloseDB() {
	if DB != nil {
		sqlDB, err := DB.DB()
		if err == nil {
			logger.Info("データベース接続をクローズします")
			_ = sqlDB.Close()
		}
	}
}
