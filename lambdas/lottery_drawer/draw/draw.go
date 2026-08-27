// Package draw は抽選の中核ロジック（当選者のランダム選出）を提供します。
// デプロイ形態（Lambda等）に依存しない純粋な関数のみで構成します。
package draw

import (
	"crypto/rand"
	"math/big"
)

// randInt は crypto/rand を使って [0, n) の範囲の乱数を返します。
// math/rand ではなく crypto/rand を使うことで、予測不可能な抽選を保証します。
func randInt(n int) int {
	if n <= 0 {
		return 0
	}
	v, err := rand.Int(rand.Reader, big.NewInt(int64(n)))
	if err != nil {
		// crypto/rand の失敗はほぼ起こらない（OSの乱数源枯渇時のみ）
		panic("crypto/rand failed: " + err.Error())
	}
	return int(v.Int64())
}

// PickWinners は応募者IDリストから当選者と落選者を選出します。
//
// アルゴリズム: Fisher-Yatesシャッフル（crypto/rand の乱数で完全シャッフル後、先頭 winnerCount 件を当選とする）
// - winnerCount が応募者数以上の場合は全員当選（落選者なし）
// - winnerCount が 0 以下の場合は全員落選（防御：呼び出し側のDB CHECK では winner_count > 0 を保証済み）
// - 引数のリストは変更しません
func PickWinners(applicantIDs []string, winnerCount int) ([]string, []string) {
	// 引数を変更しないためコピーを作る
	ids := make([]string, len(applicantIDs))
	copy(ids, applicantIDs)

	// 負数の防御（スライス範囲外パニック防止）
	if winnerCount < 0 {
		winnerCount = 0
	}

	if winnerCount >= len(ids) {
		return ids, []string{}
	}

	// Fisher-Yates: 末尾から順に、未確定範囲 [0, i] からランダムに選んで交換
	for i := len(ids) - 1; i > 0; i-- {
		j := randInt(i + 1)
		ids[i], ids[j] = ids[j], ids[i]
	}

	return ids[:winnerCount], ids[winnerCount:]
}
