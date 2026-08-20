package controllers

import (
	"database/sql"
	"errors"
	"time"

	"flashbuy/api/middleware"
	"flashbuy/api/pkg/database"
	"flashbuy/api/pkg/logger"
	"flashbuy/api/pkg/response"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// applyLotteryRequest は応募リクエストのボディ構造体です
type applyLotteryRequest struct {
	LotteryID string `json:"lotteryId" binding:"required"`
}

// ApplyLottery は抽選に応募します
// POST /api/v1/lottery/apply（AuthRequired 必須）
// フロー:
//  1. 抽選商品の存在と応募期間を確認
//  2. 応募を作成（WAITING）と apply_count+1 を同一トランザクションで行う
//  3. 重複応募は UNIQUE(user_id, lottery_id) 制約で弾く（CodeRepeatApply）
//
// 返却: {applyId: 応募ID}
func (h *LotteryController) ApplyLottery(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		response.Error(c, response.CodeUnauthorized)
		return
	}

	var req applyLotteryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		logger.Error("応募リクエストのパラメータが不正です", zap.Error(err))
		response.Error(c, response.CodeInvalidParam)
		return
	}

	// 1. 抽選商品を取得（存在確認 + 価格取得 + 応募期間チェック）
	var price, chosenPrice int
	var startsAt, applyDeadline time.Time
	err := database.DB.QueryRow(
		`SELECT price, chosen_price, starts_at, apply_deadline
		 FROM lottery_items WHERE id = $1`, req.LotteryID,
	).Scan(&price, &chosenPrice, &startsAt, &applyDeadline)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			logger.Warn("抽選商品が見つかりません", zap.String("lotteryId", req.LotteryID))
			response.Error(c, response.CodeInvalidParam)
			return
		}
		logger.Error("抽選商品の取得に失敗しました", zap.String("lotteryId", req.LotteryID), zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}

	// 応募期間外（開始前 or 締切後）は応募不可
	now := time.Now()
	if now.Before(startsAt) || now.After(applyDeadline) {
		logger.Warn("応募期間外です", zap.String("lotteryId", req.LotteryID))
		response.Error(c, response.CodeInvalidParam)
		return
	}

	// 2. 応募作成と apply_count 加算を同一トランザクションで行う
	tx, err := database.DB.Beginx()
	if err != nil {
		logger.Error("トランザクションの開始に失敗しました", zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}

	// 応募を作成（WAITING）
	// ON CONFLICT DO NOTHING で UNIQUE(user_id, lottery_id) の重複を原子的に弾く
	var applyId string
	err = tx.QueryRow(
		`INSERT INTO lottery_orders (user_id, lottery_id, price, chosen_price, status)
		 VALUES ($1, $2, $3, $4, 'WAITING')
		 ON CONFLICT (user_id, lottery_id) DO NOTHING
		 RETURNING id`,
		userID, req.LotteryID, price, chosenPrice,
	).Scan(&applyId)
	if errors.Is(err, sql.ErrNoRows) {
		tx.Rollback()
		logger.Warn("重複応募です", zap.String("userId", userID), zap.String("lotteryId", req.LotteryID))
		response.Error(c, response.CodeRepeatApply)
		return
	}
	if err != nil {
		tx.Rollback()
		logger.Error("応募の作成に失敗しました", zap.String("lotteryId", req.LotteryID), zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}

	// 応募者数を1増やす
	if _, err := tx.Exec(
		"UPDATE lottery_items SET apply_count = apply_count + 1 WHERE id = $1", req.LotteryID,
	); err != nil {
		tx.Rollback()
		logger.Error("応募者数の更新に失敗しました", zap.String("lotteryId", req.LotteryID), zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}

	if err := tx.Commit(); err != nil {
		logger.Error("トランザクションのコミットに失敗しました", zap.Error(err))
		response.Error(c, response.CodeSystemError)
		return
	}

	logger.Info("抽選応募が完了しました",
		zap.String("userId", userID), zap.String("lotteryId", req.LotteryID))

	response.Success(c, gin.H{
		"applyId": applyId,
	})
}
