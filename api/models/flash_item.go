package models

import (
	"time"
)

// FlashItem はフラッシュセール商品を表すモデルです（flash_itemsテーブル）
type FlashItem struct {
	ID          string    `db:"id" json:"id"`
	Name        string    `db:"name" json:"name"`
	Description string    `db:"description" json:"description"`
	ImageS3Key  *string   `db:"image_s3_key" json:"imageS3Key,omitempty"`
	DetailJSON  *string   `db:"detail_json" json:"-"` // 仕様・注意事項のJSON（NULL可、レスポンスでは非公開）
	Price       int       `db:"price" json:"price"`
	Stock       int       `db:"stock" json:"stock"`
	TotalStock  int       `db:"total_stock" json:"totalStock"`
	StartsAt    time.Time `db:"starts_at" json:"startsAt"`
	EndsAt      time.Time `db:"ends_at" json:"endsAt"`
	Category    string    `db:"category" json:"category"`
	ViewCount   int64     `db:"view_count" json:"viewCount"`
	CreatedAt   time.Time `db:"created_at" json:"createdAt"`
}
