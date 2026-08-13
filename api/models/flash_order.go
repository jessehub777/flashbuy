package models

import (
	"time"
)

// FlashOrder はフラッシュセールの注文を表すモデルです（flash_ordersテーブル）
type FlashOrder struct {
	ID        string     `db:"id" json:"id"`
	UserID    string     `db:"user_id" json:"userId"`
	FlashID   string     `db:"flash_id" json:"flashId"`
	Price     int        `db:"price" json:"price"`
	Status    string     `db:"status" json:"status"` // 'UNPAID','PAID','CANCELLED'
	PaidAt    *time.Time `db:"paid_at" json:"paidAt,omitempty"`
	ExpiresAt time.Time  `db:"expires_at" json:"expiresAt"`
	CreatedAt time.Time  `db:"created_at" json:"createdAt"`
	UpdatedAt time.Time  `db:"updated_at" json:"updatedAt"`
}
