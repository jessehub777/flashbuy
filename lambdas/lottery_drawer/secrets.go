package main

import (
	"context"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/secretsmanager"
)

// getSecretValue は Secrets Manager からシークレット文字列を取得します。
// DB パスワードは環境変数に平文で持たず、実行時にここで取得する。
func getSecretValue(ctx context.Context, secretARN string) (string, error) {
	cfg, err := awsconfig.LoadDefaultConfig(ctx)
	if err != nil {
		return "", err
	}
	client := secretsmanager.NewFromConfig(cfg)

	out, err := client.GetSecretValue(ctx, &secretsmanager.GetSecretValueInput{
		SecretId: &secretARN,
	})
	if err != nil {
		return "", err
	}
	if out.SecretString != nil {
		return *out.SecretString, nil
	}
	return "", nil
}
