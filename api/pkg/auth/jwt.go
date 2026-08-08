package auth

import (
	"context"
	"fmt"
	"time"

	"flashbuy/api/pkg/logger"

	"github.com/MicahParks/keyfunc/v2"
	"github.com/golang-jwt/jwt/v5"
	"go.uber.org/zap"
)

// Claims はCognito IDトークンのクレーム構造体です
type Claims struct {
	Sub      string `json:"sub"`
	Email    string `json:"email"`
	TokenUse string `json:"token_use"`
	jwt.RegisteredClaims
}

// jwks はグローバルのJWKSキーセットです
var jwks *keyfunc.JWKS

// issuer はCognito User PoolのIssuer URLです
var issuer string

// InitJWKS はCognitoのJWKS公開鍵をキャッシュします
func InitJWKS(region, userPoolID string) error {
	issuer = fmt.Sprintf("https://cognito-idp.%s.amazonaws.com/%s", region, userPoolID)
	jwksURL := issuer + "/.well-known/jwks.json"

	logger.Info("JWKSを初期化します", zap.String("url", jwksURL))

	var err error
	jwks, err = keyfunc.Get(jwksURL, keyfunc.Options{
		Ctx:               context.Background(),
		RefreshInterval:   time.Hour,
		RefreshRateLimit:  5 * time.Minute,
		RefreshUnknownKID: true,
	})
	if err != nil {
		return fmt.Errorf("JWKSの取得に失敗: %w", err)
	}

	logger.Info("JWKSの初期化に成功しました")
	return nil
}

// VerifyToken はCognito IDトークンを検証してクレームを返します
func VerifyToken(tokenString string) (*Claims, error) {
	if jwks == nil {
		return nil, fmt.Errorf("JWKSが初期化されていません")
	}

	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, jwks.Keyfunc,
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithIssuer(issuer),
	)
	if err != nil {
		return nil, fmt.Errorf("トークンの検証に失敗: %w", err)
	}

	if !token.Valid {
		return nil, fmt.Errorf("無効なトークンです")
	}

	// token_use が "id" であることを確認
	if claims.TokenUse != "id" {
		return nil, fmt.Errorf("トークンタイプが不正です: %s", claims.TokenUse)
	}

	return claims, nil
}

// CloseJWKS はJWKSのバックグラウンドリフレッシュを停止します
func CloseJWKS() {
	if jwks != nil {
		jwks.EndBackground()
	}
}
