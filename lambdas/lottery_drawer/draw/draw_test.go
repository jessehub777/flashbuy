package draw

import (
	"testing"
)

// 応募者数と当選枠数に対して、当選者・落選者の件数が正しいことを検証する
func TestPickWinners_Counts(t *testing.T) {
	tests := []struct {
		name        string
		applicants  int
		winnerCount int
		wantWinners int
		wantLosers  int
	}{
		{"10人中3人当選", 10, 3, 3, 7},
		{"100人中1人当選", 100, 1, 1, 99},
		{"当選枠=応募者数", 5, 5, 5, 0},
		{"当選枠>応募者数（全員当選）", 3, 10, 3, 0},
		{"当選枠0", 5, 0, 0, 5},
		{"当選枠が負（防御）", 5, -1, 0, 5},
		{"応募者なし", 0, 3, 0, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ids := makeIDs(tt.applicants)
			winners, losers := PickWinners(ids, tt.winnerCount)

			if len(winners) != tt.wantWinners {
				t.Errorf("当選者数 = %d, want %d", len(winners), tt.wantWinners)
			}
			if len(losers) != tt.wantLosers {
				t.Errorf("落選者数 = %d, want %d", len(losers), tt.wantLosers)
			}
		})
	}
}

// 当選者と落選者を合わせると、元の応募者と過不足なく一致することを検証する
func TestPickWinners_NoDuplicationNoLoss(t *testing.T) {
	ids := makeIDs(50)
	winners, losers := PickWinners(ids, 20)

	seen := make(map[string]bool)
	for _, id := range append(winners, losers...) {
		if seen[id] {
			t.Errorf("応募者が重複しています: %s", id)
		}
		seen[id] = true
	}
	for _, id := range ids {
		if !seen[id] {
			t.Errorf("応募者が結果から漏れています: %s", id)
		}
	}
}

// 引数のリストが変更されないことを検証する（シャッフルはコピーに対して行う）
func TestPickWinners_DoesNotMutateInput(t *testing.T) {
	ids := []string{"a", "b", "c", "d", "e"}
	original := []string{"a", "b", "c", "d", "e"}

	PickWinners(ids, 2)

	for i := range ids {
		if ids[i] != original[i] {
			t.Fatalf("引数のリストが変更されました: ids[%d] = %s, want %s", i, ids[i], original[i])
		}
	}
}

// 抽選のランダム性を検証する: 1000人中1人の抽選を200回行い、
// 当選者が1種類に偏らない（=シャッフルが機能している）ことを確認する
func TestPickWinners_Randomness(t *testing.T) {
	ids := makeIDs(1000)
	seen := make(map[string]int)

	for i := 0; i < 200; i++ {
		winners, _ := PickWinners(ids, 1)
		if len(winners) != 1 {
			t.Fatalf("当選者数 = %d, want 1", len(winners))
		}
		seen[winners[0]]++
	}

	// 200回の抽選で同じ応募者が200回当選する確率は (1/1000)^199 ≒ 0
	if len(seen) < 100 {
		t.Errorf("当選者の分布が偏っています（ユニーク当選者 %d 人 / 200回）", len(seen))
	}
}

func makeIDs(n int) []string {
	ids := make([]string, n)
	for i := range ids {
		ids[i] = "applicant-" + string(rune('a'+i%26)) + itoa(i)
	}
	return ids
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}
