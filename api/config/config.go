package config

import (
	"log"
	"os"
	"strings"

	"github.com/spf13/viper"
)

// Config はアプリケーションの全ての設定を保持する構造体です。
type Config struct {
	App      AppConfig      `mapstructure:"app"`
	Database DatabaseConfig `mapstructure:"database"`
	Redis    RedisConfig    `mapstructure:"redis"`
	AWS      AWSConfig      `mapstructure:"aws"`
	Cognito  CognitoConfig  `mapstructure:"cognito"`
}

type CognitoConfig struct {
	Region      string `mapstructure:"region"`
	UserPoolID  string `mapstructure:"user_pool_id"`
	AppClientID string `mapstructure:"app_client_id"`
}

// AppConfig はアプリケーション自体の設定です。
type AppConfig struct {
	Env  string `mapstructure:"env"`  // 実行環境 (local, dev, stg, prod)
	Port string `mapstructure:"port"` // サーバーがリッスンするポート
}

// DatabaseConfig はPostgreSQLデータベースの接続設定です。
// ローカル環境のデフォルト値とAWS RDS環境の設定を切り替えられるようにします。
type DatabaseConfig struct {
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	User     string `mapstructure:"user"`
	Password string `mapstructure:"password"`
	DBName   string `mapstructure:"dbname"`
	SSLMode  string `mapstructure:"sslmode"`
}

// RedisConfig はRedisキャシュの接続設定です。
// ローカル環境とAWS ElastiCache環境に対応します。
type RedisConfig struct {
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	Password string `mapstructure:"password"`
	DB       int    `mapstructure:"db"`
}

// AWSConfig はAWSリソース（S3, SQS等）にアクセスするための設定です。
// Terraformフェーズで実際の値が注入される想定のプレースホルダーとして機能します。
type AWSConfig struct {
	Region          string `mapstructure:"region"`
	AccessKeyID     string `mapstructure:"access_key_id"`
	SecretAccessKey string `mapstructure:"secret_access_key"`
	S3BucketName    string `mapstructure:"s3_bucket_name"`
}

// LoadConfig は環境変数または設定ファイルから設定を読み込みます。
func LoadConfig() (*Config, error) {
	env := os.Getenv("APP_ENV")
	if env == "" {
		env = "dev" // デフォルトは dev
	}

	// 環境に応じた設定ファイルを読み込む (config-local.yaml, config-prod.yaml など)
	viper.SetConfigName("config-" + env)
	viper.SetConfigType("yaml")
	viper.AddConfigPath(".") // カレントディレクトリから探す

	// AWS環境変数の読み込み設定
	viper.AutomaticEnv()
	viper.SetEnvPrefix("FLASHBUY")
	// ネストした設定キー（database.password など）を環境変数で上書きできるようにする
	// 例: FLASHBUY_DATABASE_PASSWORD=xxx で database.password を設定
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	// 設定ファイルが存在する場合は読み込む
	if err := viper.ReadInConfig(); err != nil {
		log.Printf("設定ファイル(config-%s.yaml)が見つかりません。環境変数のみを使用します。", env)
	}

	// 構造体にマッピング
	var config Config
	if err := viper.Unmarshal(&config); err != nil {
		log.Printf("設定のアンマシャル中にエラーが発生しました: %v", err)
		return nil, err
	}

	return &config, nil
}
