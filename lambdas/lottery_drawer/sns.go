package main

import (
	"context"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sns"
)

// snsClient は SNS 発行の薄いラッパー（テスト容易性のため interface 化）
type snsClient interface {
	publish(ctx context.Context, topicArn, message string) (string, error)
}

type awsSNSClient struct {
	client *sns.Client
}

// newSNSClient はデフォルトの AWS 認証情報から SNS クライアントを作る
func newSNSClient(ctx context.Context) (snsClient, error) {
	cfg, err := awsconfig.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, err
	}
	return &awsSNSClient{client: sns.NewFromConfig(cfg)}, nil
}

func (c *awsSNSClient) publish(ctx context.Context, topicArn, message string) (string, error) {
	out, err := c.client.Publish(ctx, &sns.PublishInput{
		TopicArn: &topicArn,
		Message:  &message,
	})
	if err != nil {
		return "", err
	}
	if out.MessageId != nil {
		return *out.MessageId, nil
	}
	return "", nil
}
