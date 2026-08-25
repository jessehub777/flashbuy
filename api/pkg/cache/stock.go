package cache

import (
	"context"
	"errors"
	"time"

	"flashbuy/api/pkg/logger"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

// KeyStock は在庫のRedisキーのプレフィックスです。
// 実際のキーは `stock:{id}` の形で使う
// 在庫は「キャッシュ」ではなく「権威データ」のため、
// 商品詳細キャッシュとは独立して管理する（TTLは付けない/長めにする）
const KeyStock = "stock:"

// 在庫操作のエラー定義
var (
	// ErrOutOfStock は在庫切れを表します
	ErrOutOfStock = errors.New("在庫切れ")
	// ErrNotPreheated は在庫がまだプレヒートされていないことを表します
	ErrNotPreheated = errors.New("在庫が初期化されていません")
)

// GetStock は在庫をRedisから取得します。
// キーが存在しない場合は (0, false, nil) を返す（未プレヒート）
func GetStock(id string) (int, bool, error) {
	ctx, cancel := context.WithTimeout(Ctx, cacheOpTimeout)
	defer cancel()

	val, err := RedisClient.Get(ctx, KeyStock+id).Int()
	if err == redis.Nil {
		return 0, false, nil // 未プレヒート（キーが存在しない）
	}
	if err != nil {
		logger.Error("在庫の取得に失敗しました", zap.String("key", KeyStock+id), zap.Error(err))
		return 0, false, err
	}
	return val, true, nil
}

// InitStock は在庫をRedisにプレヒートします。
// SETNX（keyが存在しない場合のみ書き込み）を使うため、
// 同時に複数のリクエストがプレヒートしても最初の1つだけが書き込み、
// 進行中の在庫減算結果を上書きしない（超売り防止）
// ttl<=0 の場合は期限なしで保存する
func InitStock(id string, stock int, ttl time.Duration) error {
	ctx, cancel := context.WithTimeout(Ctx, cacheOpTimeout)
	defer cancel()

	// SETNX: キーが存在しない場合のみ設定する
	if _, err := RedisClient.SetNX(ctx, KeyStock+id, stock, ttl).Result(); err != nil {
		logger.Error("在庫のプレヒートに失敗しました", zap.String("key", KeyStock+id), zap.Int("stock", stock), zap.Error(err))
		return err
	}
	return nil
}

// DecrStock は在庫を1つロック（減算）します。
// 原子性が必要なため、Goの「GET→判定→DECR」ではなくLuaスクリプトで行う
// 戻り値: 減算後の在庫 / ErrOutOfStock / ErrNotPreheated
func DecrStock(id string) (int, error) {
	const script = `
		local stock = redis.call('GET', KEYS[1])
		if not stock then
			return -2 -- 未プレヒート
		end
		if tonumber(stock) <= 0 then
			return -1 -- 在庫切れ
		end
		return redis.call('DECR', KEYS[1])
	`
	ctx, cancel := context.WithTimeout(Ctx, cacheOpTimeout)
	defer cancel()

	newStock, err := RedisClient.Eval(ctx, script, []string{KeyStock + id}).Int()
	if err != nil {
		logger.Error("在庫の減算に失敗しました", zap.String("key", KeyStock+id), zap.Error(err))
		return 0, err
	}
	switch newStock {
	case -2:
		return 0, ErrNotPreheated
	case -1:
		return 0, ErrOutOfStock
	}
	return newStock, nil
}

// IncrStock は在庫を1つ戻します（注文キャンセル・支払い期限切れ時に使う）。
// キーが存在しない場合は何もしない（DB側で管理しているのでRedisを触らない）
func IncrStock(id string) error {
	const script = `
		local stock = redis.call('GET', KEYS[1])
		if not stock then
			return -1 -- 未プレヒート（何もしない）
		end
		return redis.call('INCR', KEYS[1])
	`
	ctx, cancel := context.WithTimeout(Ctx, cacheOpTimeout)
	defer cancel()

	if _, err := RedisClient.Eval(ctx, script, []string{KeyStock + id}).Int(); err != nil {
		logger.Error("在庫の復元に失敗しました", zap.String("key", KeyStock+id), zap.Error(err))
		return err
	}
	return nil
}

// DelStock は在庫キーを削除します（商品削除時など）
func DelStock(id string) error {
	return Del(KeyStock + id)
}
