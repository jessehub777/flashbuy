package models

import (
	"time"
)

// User はユーザー情報を表すモデルです（usersテーブル）
type User struct {
	ID          string    `db:"id" json:"id"`
	CognitoSub  string    `db:"cognito_sub" json:"cognitoSub"`
	Email       string    `db:"email" json:"email"`
	Password    string    `db:"pwd" json:"-"` // APIのレスポンスには含めない
	DisplayName string    `db:"display_name" json:"displayName"`
	Role        string    `db:"role" json:"role"`
	CreatedAt   time.Time `db:"created_at" json:"createdAt"`
	UpdatedAt   time.Time `db:"updated_at" json:"updatedAt"`
}
