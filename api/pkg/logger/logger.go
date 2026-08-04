package logger

import (
	"os"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var Log *zap.Logger

// InitLogger はZapロガーを初期化します。
// 実行環境（env）に応じて、ログ出力のフォーマットやレベルを切り替えます。
func InitLogger(env string) error {
	var config zap.Config

	if env == "prod" || env == "stg" {
		// 本番・ステージング環境: JSONフォーマットでINFOレベル以上のログを出力
		config = zap.NewProductionConfig()
		config.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder // タイムスタンプをISO8601形式にする
	} else {
		// ローカル・開発環境: コンソール向けに見やすいフォーマットでDEBUGレベル以上のログを出力
		config = zap.NewDevelopmentConfig()
		config.EncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder // ログレベルをカラーで表示
	}

	// 標準出力にログを出力するように設定
	config.OutputPaths = []string{"stdout"}
	config.ErrorOutputPaths = []string{"stderr"}

	// ロガーのビルド
	logger, err := config.Build()
	if err != nil {
		return err
	}

	// グローバル変数に設定
	Log = logger

	// ログが出力されない場合を考慮し、アプリケーション終了時にバッファをフラッシュするための設定
	zap.ReplaceGlobals(logger)

	return nil
}

// Sync はバッファに溜まっているログをフラッシュします。
// アプリケーション終了時 (defer) に呼び出してください。
func Sync() {
	if Log != nil {
		// syncのエラーは無視する（標準出力のクローズ時に発生することがあるため）
		_ = Log.Sync()
	}
}

// Info は情報レベルのログを出力します。
func Info(msg string, fields ...zap.Field) {
	if Log != nil {
		Log.Info(msg, fields...)
	} else {
		// ロガーが初期化されていない場合のフォールバック
		zap.L().Info(msg, fields...)
	}
}

// Error はエラーレベルのログを出力します。
func Error(msg string, fields ...zap.Field) {
	if Log != nil {
		Log.Error(msg, fields...)
	} else {
		zap.L().Error(msg, fields...)
	}
}

// Fatal は致命的なエラーのログを出力し、os.Exit(1) でプログラムを終了させます。
func Fatal(msg string, fields ...zap.Field) {
	if Log != nil {
		Log.Fatal(msg, fields...)
	} else {
		zap.L().Fatal(msg, fields...)
	}
	os.Exit(1)
}
