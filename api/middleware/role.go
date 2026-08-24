package middleware

import (
	"time"

	"flashbuy/api/pkg/cache"
	"flashbuy/api/pkg/database"
	"flashbuy/api/pkg/logger"
	"flashbuy/api/pkg/response"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// roleCacheTTL はロールのキャッシュTTLです。
// ロールは極めて低頻度でしか変わらないため、Redisに短時間キャッシュしてDBクエリを減らす
const roleCacheTTL = 5 * time.Minute

// RequireRole は指定したロールのみ許可するミドルウェアです。
// AuthRequired の後に使用すること（userId が必要）。
// ロールはJWTに含まれずDBの users テーブルにある。
// 毎回DBを叩かないよう、Redis（key: role:{userId}）に5分間キャッシュする。
// キャッシュミス時のみDBから取得してキャッシュに書き戻す。
func RequireRole(role string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := GetUserID(c)
		if userID == "" {
			response.Error(c, response.CodeUnauthorized)
			c.Abort()
			return
		}

		userRole, err := getCachedRole(userID)
		if err != nil {
			logger.Error("ユーザーロールの取得に失敗しました", zap.String("userId", userID), zap.Error(err))
			response.Error(c, response.CodeForbidden)
			c.Abort()
			return
		}

		if userRole != role {
			logger.Warn("権限のない操作を拒否しました",
				zap.String("userId", userID), zap.String("requiredRole", role), zap.String("userRole", userRole))
			response.Error(c, response.CodeForbidden)
			c.Abort()
			return
		}

		c.Next()
	}
}

// getCachedRole はユーザーのロールをRedisキャッシュ経由で取得します。
// キャッシュミス時はDBから取得して書き戻す。
// Redis障害時はDBにフォールバックする（キャッシュはあくまで最適化であり、権限チェックを壊さない）
func getCachedRole(userID string) (string, error) {
	key := "role:" + userID

	// 1. キャッシュを確認
	var role string
	if hit, err := cache.GetJSON(key, &role); err == nil && hit {
		return role, nil
	} else if err != nil {
		// Redis障害 → DBにフォールバック（ログは残す）
		logger.Info("ロールキャッシュの障害、DBにフォールバックします", zap.String("userId", userID), zap.Error(err))
	}

	// 2. ミス時（またはRedis障害時）はDBから取得
	var dbRole string
	if err := database.DB.Get(&dbRole, "SELECT role FROM users WHERE id = $1", userID); err != nil {
		return "", err
	}

	// 3. キャッシュに書き戻す（失敗しても権限チェック自体は継続する）
	_ = cache.SetJSON(key, dbRole, roleCacheTTL)

	return dbRole, nil
}
