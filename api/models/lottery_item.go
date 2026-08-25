package models

import (
	"time"
)

// LotteryItem は抽選商品を表すモデルです（lottery_itemsテーブル）
type LotteryItem struct {
	ID            string    `db:"id" json:"id"`
	Name          string    `db:"name" json:"name"`
	Description   string    `db:"description" json:"description"`
	ImageS3Key    *string   `db:"image_s3_key" json:"imageS3Key,omitempty"`
	DetailS3Key   *string   `db:"detail_s3_key" json:"detailS3Key,omitempty"`
	DetailJSON    *string   `db:"detail_json" json:"-"`            // 仕様・注意事項のJSON（NULL可、レスポンスでは非公開）
	Price         int       `db:"price" json:"price"`              // 応募時の支払額
	ChosenPrice   int       `db:"chosen_price" json:"chosenPrice"` // 当選時の支払額
	WinnerCount   int       `db:"winner_count" json:"winnerCount"`
	ApplyCount    int       `db:"apply_count" json:"applyCount"`
	StartsAt      time.Time `db:"starts_at" json:"startsAt"` // 応募開始日時
	ApplyDeadline time.Time `db:"apply_deadline" json:"applyDeadline"`
	DrawAt        time.Time `db:"draw_at" json:"drawAt"`
	Category      string    `db:"category" json:"category"`
	ViewCount     int64     `db:"view_count" json:"viewCount"`
	CreatedAt     time.Time `db:"created_at" json:"createdAt"`
}
