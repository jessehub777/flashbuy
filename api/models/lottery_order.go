package models

import (
	"time"
)

// LotteryOrder は抽選の応募・注文状態を表すモデルです（lottery_ordersテーブル）
type LotteryOrder struct {
	ID          string     `db:"id" json:"id"`
	UserID      string     `db:"user_id" json:"userId"`
	LotteryID   string     `db:"lottery_id" json:"lotteryId"`
	AppliedAt   time.Time  `db:"applied_at" json:"appliedAt"`
	Status      string     `db:"status" json:"status"` // 'WAITING','UNPAID','LOST','PAID','CANCELLED'
	Price       int        `db:"price" json:"price"`
	ChosenPrice int        `db:"chosen_price" json:"chosenPrice"`
	PayDeadline *time.Time `db:"pay_deadline" json:"payDeadline,omitempty"`
	PaidAt      *time.Time `db:"paid_at" json:"paidAt,omitempty"`
	CreatedAt   time.Time  `db:"created_at" json:"createdAt"`
	UpdatedAt   time.Time  `db:"updated_at" json:"updatedAt"`
}
