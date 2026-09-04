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

// LotteryController は抽選関連のエンドポイントを処理します
type LotteryController struct{}

// NewLotteryController は新しいLotteryControllerインスタンスを返します
func NewLotteryController() *LotteryController {
	return &LotteryController{}
}

// GetLotteryList は一覧画面で抽選商品を返します
// GET /api/v1/lottery/list
func (h *LotteryController) GetLotteryList(c *gin.Context) {
	// キャッシュ優先で取得（TTL 30秒）。ミス時はDBから取得してキャッシュに書き戻す
	lotteryList, err := cache.Remember(cache.KeyLotteryList, cache.TTLList, func() ([]models.LotteryItem, error) {
		var list []models.LotteryItem
		// 抽選商品リスト を取得 (閲覧数降順)、完全終了は除外
		err := database.DB.Select(&list, "SELECT * FROM lottery_items WHERE draw_at > now() ORDER BY view_count DESC")
		return list, err
	})
	if err != nil {
		logger.Error("抽選商品の取得に失敗しました", zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}

	// 0件のときも [] を返す（nil のままだと JSON が null になり、フロント側のエラーになるため）
	if lotteryList == nil {
		lotteryList = []models.LotteryItem{}
	}

	response.Success(c, gin.H{
		"lotteryList": lotteryList,
	})
}

// LotteryItemCache は抽選詳細のキャッシュ用DTOです。
// viewCountとapplyCountはリアルタイムに変わるためキャッシュせず、レスポンス時にDBから取得して合成します
type LotteryItemCache struct {
	ID             string                 `json:"id"`
	Name           string                 `json:"name"`
	Description    string                 `json:"description"`
	ImageS3Key     *string                `json:"imageS3Key,omitempty"`
	Price          int                    `json:"price"`
	ChosenPrice    int                    `json:"chosenPrice"`
	WinnerCount    int                    `json:"winnerCount"`
	StartsAt       time.Time              `json:"startsAt"`
	ApplyDeadline  time.Time              `json:"applyDeadline"`
	DrawAt         time.Time              `json:"drawAt"`
	Category       string                 `json:"category"`
	CreatedAt      time.Time              `json:"createdAt"`
	Specifications []models.Specification `json:"specifications,omitempty"`
	Rules          []string               `json:"rules,omitempty"`
}

// LotteryDetailResponse は抽選詳細のレスポンスDTOです。
// キャッシュ（安定フィールド）にリアルタイムのapplyCount / viewCountを合成して返します
type LotteryDetailResponse struct {
	LotteryItemCache
	ApplyCount int   `json:"applyCount"`
	ViewCount  int64 `json:"viewCount"`
}

// GetLotteryById Lottery詳細
// GET /api/v1/lottery/getLotteryById/:id
func (h *LotteryController) GetLotteryById(c *gin.Context) {
	id := c.Param("id")

	// 安定フィールドをキャッシュから取得。TTLは「抽選日まで」に設定する
	// （抽選情報は抽選日まで変わらないため長めのキャッシュが有効）
	// 注意: adminが抽選を編集した場合は cache.Del(cache.KeyLotteryDetail+id) で無効化すること
	cached, err := cache.RememberUntil(cache.KeyLotteryDetail+id, func() (LotteryItemCache, error) {
		var item models.LotteryItem
		// 抽選商品を取得（idで検索、単行はGetを使う）
		err := database.DB.Get(&item, "SELECT * FROM lottery_items WHERE id = $1", id)
		if err != nil {
			return LotteryItemCache{}, err
		}
		// 商品仕様・注意事項（detail_json）をパースする
		detail, err := models.ParseItemDetail(item.DetailJSON)
		if err != nil {
			logger.Warn("商品詳細のパースに失敗しました", zap.String("lotteryId", id), zap.Error(err))
			detail = &models.ItemDetail{}
		}
		return LotteryItemCache{
			ID:             item.ID,
			Name:           item.Name,
			Description:    item.Description,
			ImageS3Key:     item.ImageS3Key,
			Price:          item.Price,
			ChosenPrice:    item.ChosenPrice,
			WinnerCount:    item.WinnerCount,
			StartsAt:       item.StartsAt,
			ApplyDeadline:  item.ApplyDeadline,
			DrawAt:         item.DrawAt,
			Category:       item.Category,
			CreatedAt:      item.CreatedAt,
			Specifications: detail.Specifications,
			Rules:          detail.Rules,
		}, nil
	}, func(item LotteryItemCache) time.Duration {
		// 抽選日までをTTLにする（抽選済みならキャッシュしない）
		return time.Until(item.DrawAt)
	})
	if err != nil {
		logger.Error("抽選商品の取得に失敗しました", zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}

	// 閲覧数を1加算しつつ、最新のviewCountとapplyCountを同時に取得する（1クエリ）
	// applyCountは「読み取りのみ」で、この処理では増やさない
	var viewCount int64
	var applyCount int
	err = database.DB.QueryRow(
		"UPDATE lottery_items SET view_count = view_count + 1 WHERE id = $1 RETURNING view_count, apply_count", id,
	).Scan(&viewCount, &applyCount)
	if err != nil {
		logger.Error("閲覧数の加算に失敗しました", zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}

	// キャッシュ（安定フィールド）+ リアルタイム値（applyCount / viewCount）を合成して返す
	response.Success(c, gin.H{
		"lotteryItem": LotteryDetailResponse{
			LotteryItemCache: cached,
			ApplyCount:       applyCount,
			ViewCount:        viewCount,
		},
	})
}
