package controllers

import (
	"time"

	"flashbuy/api/models"
	"flashbuy/api/pkg/cache"
	"flashbuy/api/pkg/database"
	"flashbuy/api/pkg/logger"
	"flashbuy/api/pkg/response"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// FlashController はフラッシュセール関連のエンドポイントを処理します
type FlashController struct{}

// NewFlashController は新しいFlashControllerインスタンスを返します
func NewFlashController() *FlashController {
	return &FlashController{}
}

// GetFlashList は一覧画面でフラッシュセール商品を返します
// GET /api/v1/flash/list
func (h *FlashController) GetFlashList(c *gin.Context) {
	// キャッシュ優先で取得（TTL 30秒）。ミス時はDBから取得してキャッシュに書き戻す
	flashList, err := cache.Remember(cache.KeyFlashList, cache.TTLList, func() ([]models.FlashItem, error) {
		var list []models.FlashItem
		// フラッシュセール商品リスト を取得 (閲覧数降順)、完全終了は除外
		err := database.DB.Select(&list, "SELECT * FROM flash_items WHERE ends_at > now() ORDER BY view_count DESC")
		return list, err
	})
	if err != nil {
		logger.Error("フラッシュセール商品の取得に失敗しました", zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}

	response.Success(c, gin.H{
		"flashList": flashList,
	})
}

// FlashItemCache はフラッシュ詳細のキャッシュ用DTOです。
// viewCountとstockはリアルタイムに変わるためキャッシュせず、レスポンス時にDBから取得して合成します
type FlashItemCache struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	ImageS3Key  *string   `json:"imageS3Key,omitempty"`
	DetailS3Key *string   `json:"detailS3Key,omitempty"`
	Price       int       `json:"price"`
	TotalStock  int       `json:"totalStock"`
	StartsAt    time.Time `json:"startsAt"`
	EndsAt      time.Time `json:"endsAt"`
	Category    string    `json:"category"`
	CreatedAt   time.Time `json:"createdAt"`
}

// FlashDetailResponse はフラッシュ詳細のレスポンスDTOです。
// キャッシュ（安定フィールド）にリアルタイムのstock / viewCountを合成して返します
type FlashDetailResponse struct {
	FlashItemCache
	Stock     int   `json:"stock"`
	ViewCount int64 `json:"viewCount"`
}

// GetFlashById FLASH詳細
// GET /api/v1/flash/getFlashById/:id
func (h *FlashController) GetFlashById(c *gin.Context) {
	id := c.Param("id")

	// 安定フィールドをキャッシュから取得。TTLは「販売終了時刻まで」に設定する
	// （商品詳細は販売期間中変わらないため長めのキャッシュが有効）
	// 注意: adminが商品を編集した場合は cache.Del(cache.KeyFlashDetail+id) で無効化すること
	cached, err := cache.RememberUntil(cache.KeyFlashDetail+id, func() (FlashItemCache, error) {
		var item models.FlashItem
		// フラッシュセール商品を取得（idで検索、単行はGetを使う）
		err := database.DB.Get(&item, "SELECT * FROM flash_items WHERE id = $1", id)
		if err != nil {
			return FlashItemCache{}, err
		}
		return FlashItemCache{
			ID:          item.ID,
			Name:        item.Name,
			Description: item.Description,
			ImageS3Key:  item.ImageS3Key,
			DetailS3Key: item.DetailS3Key,
			Price:       item.Price,
			TotalStock:  item.TotalStock,
			StartsAt:    item.StartsAt,
			EndsAt:      item.EndsAt,
			Category:    item.Category,
			CreatedAt:   item.CreatedAt,
		}, nil
	}, func(item FlashItemCache) time.Duration {
		// 販売終了時刻までをTTLにする（終了済みならキャッシュしない）
		return time.Until(item.EndsAt)
	})
	if err != nil {
		logger.Error("フラッシュセール商品の取得に失敗しました", zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}

	// 閲覧数を1加算しつつ、最新のviewCountとstockを同時に取得する（1クエリ）
	var viewCount int64
	var stock int
	err = database.DB.QueryRow(
		"UPDATE flash_items SET view_count = view_count + 1 WHERE id = $1 RETURNING view_count, stock", id,
	).Scan(&viewCount, &stock)
	if err != nil {
		logger.Error("閲覧数の加算に失敗しました", zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}

	// キャッシュ（安定フィールド）+ リアルタイム値（stock / viewCount）を合成して返す
	response.Success(c, gin.H{
		"flashItem": FlashDetailResponse{
			FlashItemCache: cached,
			Stock:          stock,
			ViewCount:      viewCount,
		},
	})
}
