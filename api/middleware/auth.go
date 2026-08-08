package middleware

import (
	"strings"

	"flashbuy/api/pkg/auth"
	"flashbuy/api/pkg/response"

	"github.com/gin-gonic/gin"
)

// AuthRequired は認証が必要なエンドポイントに適用するミドルウェアです
func AuthRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Authorization ヘッダーからトークンを取得
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			response.Error(c, response.CodeUnauthorized)
			c.Abort()
			return
		}

		// "Bearer <token>" からトークン部分を抽出
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			response.Error(c, response.CodeUnauthorized)
			c.Abort()
			return
		}

		// トークンを検証
		claims, err := auth.VerifyToken(parts[1])
		if err != nil {
			response.Error(c, response.CodeUnauthorized)
			c.Abort()
			return
		}

		// ユーザー情報をコンテキストにセット
		c.Set("userId", claims.Sub)
		c.Set("userEmail", claims.Email)
		c.Next()
	}
}

// GetUserID はコンテキストからユーザーID（Cognito sub）を取得します
func GetUserID(c *gin.Context) string {
	sub, _ := c.Get("userId")
	if s, ok := sub.(string); ok {
		return s
	}
	return ""
}

// GetUserEmail はコンテキストからユーザーのメールアドレスを取得します
func GetUserEmail(c *gin.Context) string {
	email, _ := c.Get("userEmail")
	if e, ok := email.(string); ok {
		return e
	}
	return ""
}
