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
	ID             string                 `json:"id"`
	Name           string                 `json:"name"`
	Description    string                 `json:"description"`
	ImageS3Key     *string                `json:"imageS3Key,omitempty"`
	Price          int                    `json:"price"`
	TotalStock     int                    `json:"totalStock"`
	StartsAt       time.Time              `json:"startsAt"`
	EndsAt         time.Time              `json:"endsAt"`
	Category       string                 `json:"category"`
	CreatedAt      time.Time              `json:"createdAt"`
	Specifications []models.Specification `json:"specifications,omitempty"`
	Rules          []string               `json:"rules,omitempty"`
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
		// 商品仕様・注意事項（detail_json）をパースする
		detail, err := models.ParseItemDetail(item.DetailJSON)
		if err != nil {
			logger.Warn("商品詳細のパースに失敗しました", zap.String("flashId", id), zap.Error(err))
			detail = &models.ItemDetail{}
		}
		return FlashItemCache{
			ID:             item.ID,
			Name:           item.Name,
			Description:    item.Description,
			ImageS3Key:     item.ImageS3Key,
			Price:          item.Price,
			TotalStock:     item.TotalStock,
			StartsAt:       item.StartsAt,
			EndsAt:         item.EndsAt,
			Category:       item.Category,
			CreatedAt:      item.CreatedAt,
			Specifications: detail.Specifications,
			Rules:          detail.Rules,
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

	// 閲覧数を1加算しつつ、最新のviewCountを取得する
	var viewCount int64
	err = database.DB.QueryRow(
		"UPDATE flash_items SET view_count = view_count + 1 WHERE id = $1 RETURNING view_count", id,
	).Scan(&viewCount)
	if err != nil {
		logger.Error("閲覧数の加算に失敗しました", zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}

	// 在庫はRedisから取得（プレヒート済みならRedis、未プレヒートならDBからロードして返す）
	stock, err := getFlashStock(id)
	if err != nil {
		logger.Error("在庫の取得に失敗しました", zap.Error(err))
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

// getFlashStock はフラッシュ商品の在庫を取得します。
// Redisにプレヒート済みならそれを返し、未プレヒートならDBからロードしてRedisにプレヒートする
func getFlashStock(id string) (int, error) {
	// Redisに在庫があればそれを返す
	if stock, ok, err := cache.GetStock(id); err == nil && ok {
		return stock, nil
	}

	// 未プレヒート: DBから現在の在庫をロードしてRedisに載せる
	var stock int
	if err := database.DB.Get(&stock, "SELECT stock FROM flash_items WHERE id = $1", id); err != nil {
		return 0, err
	}
	if err := cache.InitStock(id, stock, 0); err != nil {
		return 0, err
	}
	return stock, nil
}
