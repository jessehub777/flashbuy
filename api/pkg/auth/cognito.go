package auth

import (
	"context"
	"fmt"

	"flashbuy/api/config"
	"flashbuy/api/pkg/logger"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	cip "github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"
	types "github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider/types"
	"go.uber.org/zap"
)

type CognitoClient struct {
	client      *cip.Client
	userPoolID  string
	appClientID string
}

func NewCognitoClient(cfg *config.CognitoConfig) (*CognitoClient, error) {
	// AWS SDK の設定を読み込む（リージョン指定）
	awsCfg, err := awsconfig.LoadDefaultConfig(context.TODO(),
		awsconfig.WithRegion(cfg.Region),
	)
	if err != nil {
		return nil, fmt.Errorf("AWS設定の読み込みに失敗: %w", err)
	}

	client := cip.NewFromConfig(awsCfg)

	logger.Info("Cognitoクライアントを初期化しました",
		zap.String("region", cfg.Region),
		zap.String("userPoolId", cfg.UserPoolID),
	)

	return &CognitoClient{
		client:      client,
		userPoolID:  cfg.UserPoolID,
		appClientID: cfg.AppClientID,
	}, nil
}

// SignUp は新しいユーザーをCognitoに登録します
func (c *CognitoClient) SignUp(ctx context.Context, email, password string) (string, error) {
	input := &cip.SignUpInput{
		ClientId: &c.appClientID,
		Username: &email,
		Password: &password,
		UserAttributes: []types.AttributeType{
			{
				Name:  strPtr("email"),
				Value: &email,
			},
		},
	}

	result, err := c.client.SignUp(ctx, input)
	if err != nil {
		return "", fmt.Errorf("Cognito SignUpに失敗: %w", err)
	}

	return *result.UserSub, nil
}

// ConfirmUser はユーザーを管理者として確認します（メール認証をスキップ）
func (c *CognitoClient) ConfirmUser(ctx context.Context, email string) error {
	input := &cip.AdminConfirmSignUpInput{
		UserPoolId: &c.userPoolID,
		Username:   &email,
	}

	_, err := c.client.AdminConfirmSignUp(ctx, input)
	if err != nil {
		return fmt.Errorf("Cognito ConfirmSignUpに失敗: %w", err)
	}

	return nil
}

// Login はユーザーを認証してIDトークンとリフレッシュトークンを返します
func (c *CognitoClient) Login(ctx context.Context, email, password string) (idToken string, refreshToken string, err error) {
	input := &cip.InitiateAuthInput{
		ClientId: &c.appClientID,
		AuthFlow: types.AuthFlowTypeUserPasswordAuth,
		AuthParameters: map[string]string{
			"USERNAME": email,
			"PASSWORD": password,
		},
	}

	result, err := c.client.InitiateAuth(ctx, input)
	if err != nil {
		return "", "", fmt.Errorf("Cognito認証に失敗: %w", err)
	}

	if result.AuthenticationResult == nil || result.AuthenticationResult.IdToken == nil {
		return "", "", fmt.Errorf("Cognitoからトークンが返されませんでした")
	}

	// リフレッシュトークンが返されない場合は空文字（その場合は自動更新は行えない）
	var refresh string
	if result.AuthenticationResult.RefreshToken != nil {
		refresh = *result.AuthenticationResult.RefreshToken
	}

	return *result.AuthenticationResult.IdToken, refresh, nil
}

// RefreshToken はリフレッシュトークンを使って新しいIDトークンを取得します
// IDトークンの有効期限切れ時に、ユーザー再ログインなしで自動更新するために使う
func (c *CognitoClient) RefreshToken(ctx context.Context, refreshToken string) (string, error) {
	input := &cip.InitiateAuthInput{
		ClientId: &c.appClientID,
		AuthFlow: types.AuthFlowTypeRefreshTokenAuth,
		AuthParameters: map[string]string{
			"REFRESH_TOKEN": refreshToken,
		},
	}

	result, err := c.client.InitiateAuth(ctx, input)
	if err != nil {
		return "", fmt.Errorf("Cognitoトークンの更新に失敗: %w", err)
	}

	if result.AuthenticationResult == nil || result.AuthenticationResult.IdToken == nil {
		return "", fmt.Errorf("Cognitoから新しいIDトークンが返されませんでした")
	}

	return *result.AuthenticationResult.IdToken, nil
}

func strPtr(s string) *string {
	return &s
}
