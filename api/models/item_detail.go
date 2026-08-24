package models

import (
	"encoding/json"
	"fmt"
)

// Specification は商品仕様の1項目（「項目: 値」のペア）です
type Specification struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

// ItemDetail は商品の詳細情報です。
// 現在はDBの detail_json カラムにJSONとして保存する。
// 将来はS3にJSONファイルとして保存し、detail_s3_key で参照する予定
type ItemDetail struct {
	Specifications []Specification `json:"specifications,omitempty"`
	Rules          []string        `json:"rules,omitempty"`
}

// ParseItemDetail は detail_json の文字列を構造体に変換します。
// nil または空文字の場合は空の構造体を返します（エラーにはしない）
func ParseItemDetail(raw *string) (*ItemDetail, error) {
	detail := &ItemDetail{}
	if raw == nil || *raw == "" {
		return detail, nil
	}
	if err := json.Unmarshal([]byte(*raw), detail); err != nil {
		return nil, fmt.Errorf("detail_jsonのパースに失敗しました: %w", err)
	}
	return detail, nil
}
