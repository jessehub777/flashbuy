// Package s3 は S3 への署名付きURL（Presigned URL）発行を提供します。
// 画像はブラウザから S3 へ直接 PUT するため、API サーバーを経由しません。
package s3

import (
	"context"
	"fmt"
	"time"

	"flashbuy/api/config"
	"flashbuy/api/pkg/logger"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"go.uber.org/zap"
)

var (
	client     *s3.PresignClient
	bucketName string
	region     string
)

// InitS3 は S3 クライアントを初期化します。
// バケット名が未設定の場合はスキップし、PresignPutObject はエラーを返します。
func InitS3(c *config.AWSConfig) {
	if c == nil || c.S3BucketName == "" {
		logger.Info("S3バケット名が未設定のため、画像アップロード機能は無効です")
		return
	}

	awsCfg, err := awsconfig.LoadDefaultConfig(context.TODO(),
		awsconfig.WithRegion(c.Region))
	if err != nil {
		logger.Warn("S3クライアントの初期化に失敗しました", zap.Error(err))
		return
	}

	client = s3.NewPresignClient(s3.NewFromConfig(awsCfg))
	bucketName = c.S3BucketName
	region = c.Region
}

// PresignResult は署名付きURLの発行結果です
type PresignResult struct {
	URL       string // PUT 用の署名付きURL
	Key       string // S3 オブジェクトキー（DBに保存する値）
	PublicURL string // 公開読み取りURL（プレビュー表示用）
}

// PresignPutObject は S3 への PUT 用署名付きURLを発行します。
// ブラウザは返されたURLに直接 PUT するため、ファイルはAPIサーバーを経由しません。
func PresignPutObject(ctx context.Context, key, contentType string, expires time.Duration) (*PresignResult, error) {
	if client == nil || bucketName == "" {
		return nil, fmt.Errorf("S3が初期化されていません（バケット名の設定を確認してください）")
	}

	req, err := client.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(bucketName),
		Key:         aws.String(key),
		ContentType: aws.String(contentType),
	}, s3.WithPresignExpires(expires))
	if err != nil {
		return nil, err
	}

	return &PresignResult{
		URL:       req.URL,
		Key:       key,
		PublicURL: fmt.Sprintf("https://%s.s3.%s.amazonaws.com/%s", bucketName, region, key),
	}, nil
}
