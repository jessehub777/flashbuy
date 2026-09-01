package controllers

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"flashbuy/api/pkg/logger"
	"flashbuy/api/pkg/response"
	"flashbuy/api/pkg/s3"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// UploadController は画像アップロード用の署名付きURL発行を処理します
type UploadController struct{}

func NewUploadController() *UploadController {
	return &UploadController{}
}

// 署名付きURLの有効期限（アップロードは即座に行われるため短めで十分）
const presignExpiry = 10 * time.Minute

// アップロードを許可するフォルダ（それ以外は不正なパス指定を防ぐため拒否）
var allowedFolders = map[string]bool{
	"products": true,
	"lottery":  true,
}

// アップロードを許可する画像のContent-Typeと拡張子
var allowedImageTypes = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
}

// Presign は S3 への直接アップロード用の署名付きURLを発行します
// GET /api/v1/upload/presign?folder=products&fileName=x.png&contentType=image/png
// （AuthRequired + RequireRole("admin") 必須）
//
// レスポンス: { presignedUrl, key, publicUrl }
// クライアントは presignedUrl に PUT し、key を商品の imageS3Key として保存する
func (h *UploadController) Presign(c *gin.Context) {
	folder := c.Query("folder")
	contentType := c.Query("contentType")

	// フォルダの検証（パストラバーサル防止のためホワイトリスト方式）
	if !allowedFolders[folder] {
		logger.Warn("不正なアップロード先フォルダです", zap.String("folder", folder))
		response.Error(c, response.CodeInvalidParam)
		return
	}

	// Content-Type の検証（画像のみ許可）
	ext, ok := allowedImageTypes[contentType]
	if !ok {
		logger.Warn("許可されていないファイル形式です", zap.String("contentType", contentType))
		response.Error(c, response.CodeInvalidParam)
		return
	}

	// 拡張子は Content-Type から決定する（fileName は使わない → 偽装を防止）
	// オブジェクトキー: {folder}/{yyyy}/{mm}/{ランダム}.{ext}
	// ランダム値により既存オブジェクトの上書きを防ぐ
	key := fmt.Sprintf("%s/%s/%s%s", folder, time.Now().Format("2006/01"), randomHex(16), ext)

	result, err := s3.PresignPutObject(c.Request.Context(), key, contentType, presignExpiry)
	if err != nil {
		logger.Error("署名付きURLの発行に失敗しました", zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}

	response.Success(c, gin.H{
		"presignedUrl": result.URL,
		"key":          result.Key,
		"publicUrl":    result.PublicURL,
	})
}

// randomHex は crypto/rand を使ったランダムな16進文字列を返します
func randomHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		// crypto/rand の失敗はほぼ起こらない。フォールバックとして時刻を使う
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return strings.ToLower(hex.EncodeToString(b))
}
