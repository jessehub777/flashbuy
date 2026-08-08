package controllers

import (
	"flashbuy/api/models"
	"flashbuy/api/pkg/auth"
	"flashbuy/api/pkg/database"
	"flashbuy/api/pkg/logger"
	"flashbuy/api/pkg/response"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// AuthController は認証関連のエンドポイントを処理します
type AuthController struct {
	cognito *auth.CognitoClient
}

// NewAuthController は新しいAuthControllerインスタンスを返します
func NewAuthController(cognito *auth.CognitoClient) *AuthController {
	return &AuthController{cognito: cognito}
}

// registerRequest は登録リクエストのボディ構造体です
type registerRequest struct {
	Email       string `json:"email" binding:"required,email"`
	Password    string `json:"password" binding:"required,min=8"`
	DisplayName string `json:"displayName" binding:"required"`
}

// loginRequest はログインリクエストのボディ構造体です
type loginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// Register はユーザーを新規登録します
// POST /api/v1/auth/register
func (h *AuthController) Register(c *gin.Context) {
	var req registerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		logger.Error("リクエストパラメータが不正です", zap.Error(err))
		response.Error(c, response.CodeInvalidParam)
		return
	}

	// Cognitoにユーザーを登録
	cognitoSub, err := h.cognito.SignUp(c.Request.Context(), req.Email, req.Password)
	if err != nil {
		logger.Error("Cognito登録に失敗しました", zap.Error(err), zap.String("email", req.Email))
		response.Error(c, response.CodeSystemError)
		return
	}

	// メール確認をスキップ（PoC: 管理者として即座に確認）
	if err := h.cognito.ConfirmUser(c.Request.Context(), req.Email); err != nil {
		logger.Error("Cognitoユーザー確認に失敗しました", zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}

	// DBにユーザーを保存（idはCognito subをそのまま使用）
	_, err = database.DB.Exec(
		`INSERT INTO users (id, email, display_name, role) VALUES ($1, $2, $3, 'user')`,
		cognitoSub, req.Email, req.DisplayName,
	)
	if err != nil {
		logger.Error("ユーザーのDB保存に失敗しました", zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}

	logger.Info("ユーザー登録が完了しました", zap.String("email", req.Email))
	response.Success(c, gin.H{
		"message": "登録が完了しました",
	})
}

// Login はユーザーを認証してJWTトークンを返します
// POST /api/v1/auth/login
func (h *AuthController) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		logger.Error("リクエストパラメータが不正です", zap.Error(err))
		response.Error(c, response.CodeInvalidParam)
		return
	}

	// Cognitoで認証してIDトークンを取得
	idToken, err := h.cognito.Login(c.Request.Context(), req.Email, req.Password)
	if err != nil {
		logger.Error("ログインに失敗しました", zap.Error(err), zap.String("email", req.Email))
		response.Error(c, response.CodeUnauthorized)
		return
	}

	// IDトークンからsub（ユーザーID）を取得
	claims, err := auth.VerifyToken(idToken)
	if err != nil {
		logger.Error("IDトークンの検証に失敗しました", zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}

	// DBからユーザーを取得（id = Cognito sub で検索）
	var user models.User
	err = database.DB.Get(&user, "SELECT * FROM users WHERE id = $1", claims.Sub)
	if err != nil {
		// DBにユーザーが存在しない場合、新規作成（JITプロビジョニング）
		logger.Info("JITプロビジョニング: DBにユーザーを作成します", zap.String("email", req.Email))
		_, err = database.DB.Exec(
			`INSERT INTO users (id, email, display_name, role) VALUES ($1, $2, $3, 'user')`,
			claims.Sub, req.Email, req.Email,
		)
		if err != nil {
			logger.Error("JITプロビジョニングに失敗しました", zap.Error(err))
			response.Error(c, response.CodeSystemError)
			return
		}
		// 新規作成したユーザーを取得
		err = database.DB.Get(&user, "SELECT * FROM users WHERE id = $1", claims.Sub)
		if err != nil {
			logger.Error("新規ユーザーの取得に失敗しました", zap.Error(err))
			response.Error(c, response.CodeSystemError)
			return
		}
	}

	logger.Info("ログイン成功", zap.String("email", req.Email))
	response.Success(c, gin.H{
		"user":  user,
		"token": idToken,
	})
}

// Logout はログアウト処理を行います（ステートレスJWTのため、サーバー側の処理は不要）
// POST /api/v1/auth/logout
func (h *AuthController) Logout(c *gin.Context) {
	response.Success(c, nil)
}
