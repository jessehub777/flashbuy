package controllers

import (
	"encoding/json"
	"time"

	"flashbuy/api/models"
	"flashbuy/api/pkg/cache"
	"flashbuy/api/pkg/database"
	"flashbuy/api/pkg/logger"
	"flashbuy/api/pkg/response"
	"flashbuy/api/pkg/scheduler"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// AdminController は管理者用エンドポイントを処理します
type AdminController struct{}

// NewAdminController は新しいAdminControllerインスタンスを返します
func NewAdminController() *AdminController {
	return &AdminController{}
}

// createFlashRequest はフラッシュセール作成リクエストです
// 時間は未指定なら即時開始・24時間後終了にする
type createFlashRequest struct {
	Name           string                 `json:"name" binding:"required"`
	Description    string                 `json:"description"`
	Category       string                 `json:"category"`
	Price          int                    `json:"price" binding:"min=0"`
	Stock          int                    `json:"stock" binding:"min=0"`
	StartsAt       *time.Time             `json:"startsAt"`
	EndsAt         *time.Time             `json:"endsAt"`
	ImageS3Key     string                 `json:"imageS3Key"`
	Specifications []models.Specification `json:"specifications"`
	Rules          []string               `json:"rules"`
}

// CreateFlash はフラッシュセール商品を作成します
// POST /api/v1/admin/flash（AuthRequired + RequireRole("admin") 必須）
func (h *AdminController) CreateFlash(c *gin.Context) {
	var req createFlashRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		logger.Error("フラッシュセール作成のパラメータが不正です", zap.Error(err))
		response.Error(c, response.CodeInvalidParam)
		return
	}

	// カテゴリ未指定は「限定アイテム」にする（フロントのフォームデフォルトと一致）
	if req.Category == "" {
		req.Category = "限定アイテム"
	}

	// 販売期間: 未指定なら即時開始・24時間後終了
	now := time.Now()
	item := models.FlashItem{
		Name:        req.Name,
		Description: req.Description,
		Price:       req.Price,
		// total_stock は「最初に用意した総在庫」で、作成時点では売れていないため stock と同じ値を入れる。
		// 以降は order_expirer などが stock のみを減らし/戻し、total_stock は不変（発売元の総数表示用）
		Stock:      req.Stock,
		TotalStock: req.Stock,
		StartsAt:   now,
		EndsAt:     now.Add(24 * time.Hour),
		Category:   req.Category,
	}
	if req.StartsAt != nil {
		item.StartsAt = *req.StartsAt
	}
	if req.EndsAt != nil {
		item.EndsAt = *req.EndsAt
	}

	// 終了時刻は開始時刻より後であること（DBのCHECK制約で500になる前に、パラメータエラーとして返す）
	if !item.EndsAt.After(item.StartsAt) {
		logger.Warn("終了時刻が開始時刻以前です", zap.String("name", req.Name))
		response.Error(c, response.CodeInvalidParam)
		return
	}

	// ImageS3Key は空文字の場合はNULLにする（ポインタ経由）
	if req.ImageS3Key != "" {
		item.ImageS3Key = &req.ImageS3Key
	}

	// 商品仕様・注意事項をJSONにして保存する
	item.DetailJSON = marshalItemDetail(req.Specifications, req.Rules)

	err := database.DB.Get(&item, `
		INSERT INTO flash_items (name, description, price, stock, total_stock, starts_at, ends_at, category, image_s3_key, detail_json)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id, view_count, created_at`,
		item.Name, item.Description, item.Price, item.Stock, item.TotalStock,
		item.StartsAt, item.EndsAt, item.Category, item.ImageS3Key, item.DetailJSON,
	)
	if err != nil {
		logger.Error("フラッシュセールの作成に失敗しました", zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}

	// 一覧・ホームのキャッシュを無効化する
	if err := cache.Del(cache.KeyFlashList, cache.KeyHomeTop10); err != nil {
		logger.Warn("フラッシュセール一覧キャッシュの削除に失敗しました", zap.Error(err))
	}

	logger.Info("フラッシュセールを作成しました", zap.String("flashId", item.ID))
	response.Success(c, gin.H{
		"flashItem": item,
	})
}

// createLotteryRequest は抽選作成リクエストです
// 時間は未指定なら即時開始・7日後締切・8日後抽選にする
type createLotteryRequest struct {
	Name           string                 `json:"name" binding:"required"`
	Description    string                 `json:"description"`
	Category       string                 `json:"category"`
	Price          int                    `json:"price" binding:"min=0"`                // 応募費
	ChosenPrice    int                    `json:"chosenPrice" binding:"min=0"`          // 当選時の支払額
	WinnerCount    int                    `json:"winnerCount" binding:"required,min=1"` // 当選枠数
	StartsAt       *time.Time             `json:"startsAt"`                             // 応募開始
	ApplyDeadline  *time.Time             `json:"applyDeadline"`                        // 応募締切
	DrawAt         *time.Time             `json:"drawAt"`                               // 抽選日
	ImageS3Key     string                 `json:"imageS3Key"`                           // 商品画像のS3キー
	Specifications []models.Specification `json:"specifications"`
	Rules          []string               `json:"rules"`
}

// CreateLottery は抽選イベントを作成します
// POST /api/v1/admin/lottery（AuthRequired + RequireRole("admin") 必須）
func (h *AdminController) CreateLottery(c *gin.Context) {
	var req createLotteryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		logger.Error("抽選作成のパラメータが不正です", zap.Error(err))
		response.Error(c, response.CodeInvalidParam)
		return
	}

	if req.Category == "" {
		req.Category = "限定アイテム"
	}
	// 当選時支払額が未指定なら応募価格と同じにする
	if req.ChosenPrice == 0 {
		req.ChosenPrice = req.Price
	}

	// 応募期間: 未指定なら即時開始・7日後締切。
	// 抽選日は未指定なら締切の翌日にする（締切後に集計時間が必要なため）
	now := time.Now()
	item := models.LotteryItem{
		Name:          req.Name,
		Description:   req.Description,
		Price:         req.Price,
		ChosenPrice:   req.ChosenPrice,
		WinnerCount:   req.WinnerCount,
		StartsAt:      now,
		ApplyDeadline: now.Add(7 * 24 * time.Hour),
		DrawAt:        now.Add(8 * 24 * time.Hour),
		Category:      req.Category,
	}
	if req.StartsAt != nil {
		item.StartsAt = *req.StartsAt
	}
	if req.ApplyDeadline != nil {
		item.ApplyDeadline = *req.ApplyDeadline
	}
	// 抽選日 = 締切の翌日（draw_at > apply_deadline 制約を満たす）
	item.DrawAt = item.ApplyDeadline.Add(24 * time.Hour)
	if req.DrawAt != nil {
		// 明示指定された抽選日が締切以前なら弾く（DBのCHECK制約に頼らず、パラメータエラーとして返す）
		if !req.DrawAt.After(item.ApplyDeadline) {
			logger.Warn("抽選日が締切以前です", zap.String("name", req.Name))
			response.Error(c, response.CodeInvalidParam)
			return
		}
		item.DrawAt = *req.DrawAt
	}

	// ImageS3Key は空文字の場合はNULLにする（ポインタ経由）
	if req.ImageS3Key != "" {
		item.ImageS3Key = &req.ImageS3Key
	}

	// 商品仕様・注意事項をJSONにして保存する
	item.DetailJSON = marshalItemDetail(req.Specifications, req.Rules)

	err := database.DB.Get(&item, `
		INSERT INTO lottery_items (name, description, price, chosen_price, winner_count, starts_at, apply_deadline, draw_at, category, image_s3_key, detail_json)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING id, apply_count, view_count, created_at`,
		item.Name, item.Description, item.Price, item.ChosenPrice, item.WinnerCount,
		item.StartsAt, item.ApplyDeadline, item.DrawAt, item.Category,
		item.ImageS3Key, item.DetailJSON,
	)
	if err != nil {
		logger.Error("抽選の作成に失敗しました", zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}

	// 一覧・ホームのキャッシュを無効化する
	if err := cache.Del(cache.KeyLotteryList, cache.KeyHomeTop10); err != nil {
		logger.Warn("抽選一覧キャッシュの削除に失敗しました", zap.Error(err))
	}

	// draw_at 時刻のワンタイム開票ScheduleをEventBridgeに登録する
	// （設定が空のローカル環境ではスキップされる。登録失敗しても商品作成は成功扱いとし、ログのみ残す）
	if err := scheduler.RegisterDrawSchedule(item.ID, item.DrawAt); err != nil {
		logger.Warn("開票スケジュールの登録に失敗しました",
			zap.String("lotteryId", item.ID), zap.Error(err))
	}

	logger.Info("抽選を作成しました", zap.String("lotteryId", item.ID))
	response.Success(c, gin.H{
		"lotteryItem": item,
	})
}

// marshalItemDetail は商品仕様・注意事項をJSON文字列に変換します。
// どちらも空の場合はnilを返す（DBにはNULLで保存される）
func marshalItemDetail(specifications []models.Specification, rules []string) *string {
	if len(specifications) == 0 && len(rules) == 0 {
		return nil
	}
	b, err := json.Marshal(models.ItemDetail{
		Specifications: specifications,
		Rules:          rules,
	})
	if err != nil {
		logger.Warn("商品詳細のJSON変換に失敗しました", zap.Error(err))
		return nil
	}
	s := string(b)
	return &s
}

// ListFlash は管理画面用に全フラッシュセール（終了済み含む）を返します
// GET /api/v1/admin/flash/list（AuthRequired + RequireRole("admin") 必須）
func (h *AdminController) ListFlash(c *gin.Context) {
	var list []models.FlashItem
	// 管理画面では終了済みも含めて全件表示する（新しい順）
	err := database.DB.Select(&list, "SELECT * FROM flash_items ORDER BY created_at DESC")
	if err != nil {
		logger.Error("フラッシュセール一覧の取得に失敗しました", zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}
	if list == nil {
		list = []models.FlashItem{}
	}
	response.Success(c, gin.H{
		"flashList": list,
	})
}

// ListLottery は管理画面用に全抽選（終了済み含む）を返します
// GET /api/v1/admin/lottery/list（AuthRequired + RequireRole("admin") 必須）
func (h *AdminController) ListLottery(c *gin.Context) {
	var list []models.LotteryItem
	// 管理画面では終了済みも含めて全件表示する（新しい順）
	err := database.DB.Select(&list, "SELECT * FROM lottery_items ORDER BY created_at DESC")
	if err != nil {
		logger.Error("抽選一覧の取得に失敗しました", zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}
	if list == nil {
		list = []models.LotteryItem{}
	}
	response.Success(c, gin.H{
		"lotteryList": list,
	})
}
