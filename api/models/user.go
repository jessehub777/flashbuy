package models

import (
	"time"
)

// User はユーザー情報を表すモデルです（usersテーブル）
// id は Cognito sub（認証基盤が発行した固定ID）をそのまま使用します
type User struct {
	ID          string    `db:"id" json:"id"`
	Email       string    `db:"email" json:"email"`
	DisplayName string    `db:"display_name" json:"displayName"`
	Role        string    `db:"role" json:"role"`
	CreatedAt   time.Time `db:"created_at" json:"-"`
	UpdatedAt   time.Time `db:"updated_at" json:"-"`
}
