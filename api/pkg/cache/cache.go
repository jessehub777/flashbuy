package cache

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"flashbuy/api/pkg/logger"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

// キャッシュキー定数
const (
	KeyFlashList   = "flash:list"
	KeyLotteryList = "lottery:list"
	KeyHomeTop10   = "home:top10"
	// KeyFlashDetail / KeyLotteryDetail は商品詳細キャッシュのプレフィックス。
	// 実際のキーは `flash:item:{id}` のようにidを連結して使う
	KeyFlashDetail   = "flash:item:"
	KeyLotteryDetail = "lottery:item:"
)

// TTL定数 — キャッシュの生存時間をここで一元管理する
const (
	// TTLList は一覧・Top10キャッシュのTTLです。
	// 閲覧数や在庫がリアルタイムに変わるため短めに設定する
	TTLList = 30 * time.Second
)

// cacheOpTimeout はRedis操作のタイムアウトです。
// Redisが応答しない場合にリクエストをブロックさせないための安全弁です
const cacheOpTimeout = 2 * time.Second

// GetJSON はRedisからJSONキャッシュを読み出してdestにデコードします
// キャッシュに存在しない場合は (false, nil) を返します
func GetJSON(key string, dest any) (bool, error) {
	ctx, cancel := context.WithTimeout(Ctx, cacheOpTimeout)
	defer cancel()

	val, err := RedisClient.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return false, nil // キャッシュミス（キーが存在しない）
	}
	if err != nil {
		logger.Error("キャッシュの取得に失敗しました", zap.String("key", key), zap.Error(err))
		return false, err
	}
	if err := json.Unmarshal(val, dest); err != nil {
		logger.Error("キャッシュJSONの解析に失敗しました", zap.String("key", key), zap.Error(err))
		return false, err
	}
	return true, nil
}

// SetJSON はJSONキャッシュをTTL付きでRedisに書き込みます
func SetJSON(key string, value any, ttl time.Duration) error {
	ctx, cancel := context.WithTimeout(Ctx, cacheOpTimeout)
	defer cancel()

	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	if err := RedisClient.Set(ctx, key, data, ttl).Err(); err != nil {
		logger.Error("キャッシュの書き込みに失敗しました", zap.String("key", key), zap.Error(err))
		return err
	}
	return nil
}

// Del は指定されたキャッシュキーを削除します（キャッシュを無効化）
// データ更新時に呼び出すこと。
// 例:
//   - adminが商品を新規作成/編集した場合 → cache.Del(cache.KeyFlashList, cache.KeyHomeTop10)
//   - 秒殺で在庫が変動した場合 → cache.Del(cache.KeyFlashList, cache.KeyHomeTop10)
//   - 抽選で結果が変動した場合 → cache.Del(cache.KeyLotteryList)
func Del(keys ...string) error {
	if len(keys) == 0 {
		return nil
	}
	ctx, cancel := context.WithTimeout(Ctx, cacheOpTimeout)
	defer cancel()

	if err := RedisClient.Del(ctx, keys...).Err(); err != nil {
		logger.Error("キャッシュの削除に失敗しました", zap.String("keys", strings.Join(keys, ", ")), zap.Error(err))
		return err
	}
	return nil
}

// Remember はキャッシュ優先でデータを取得します
// キャッシュミス時はloaderでDBから取得し、キャッシュに書き戻して返します
// Cache Asideパターンの汎用実装（TTLはkey単位で短めに設定する）
func Remember[T any](key string, ttl time.Duration, loader func() (T, error)) (T, error) {
	// 1. キャッシュを確認
	var cached T
	if hit, err := GetJSON(key, &cached); err != nil {
		// Redis障害時はログを残してDBにフォールバックする
		logger.Info("キャッシュ障害、DBにフォールバックします", zap.String("key", key), zap.Error(err))
	} else if hit {
		return cached, nil
	}

	// 2. ミス時（またはRedis障害時）はDBから取得
	data, err := loader()
	if err != nil {
		return data, err
	}

	// 3. キャッシュに書き戻す（失敗してもエラーにしない）
	_ = SetJSON(key, data, ttl)

	return data, nil
}

// RememberUntil はRememberの変種で、キャッシュのTTLをloaderの結果から動的に決める場合に使う
// ttlCalcが0以下の時間を返した場合はキャッシュに書き込まない
// 例: 商品詳細は「販売終了時刻まで」をTTLにする
func RememberUntil[T any](key string, loader func() (T, error), ttlCalc func(T) time.Duration) (T, error) {
	// 1. キャッシュを確認
	var cached T
	if hit, err := GetJSON(key, &cached); err != nil {
		// Redis障害時はログを残してDBにフォールバックする
		logger.Info("キャッシュ障害、DBにフォールバックします", zap.String("key", key), zap.Error(err))
	} else if hit {
		return cached, nil
	}

	// 2. ミス時（またはRedis障害時）はDBから取得
	data, err := loader()
	if err != nil {
		return data, err
	}

	// 3. TTLを動的に計算してキャッシュに書き戻す（TTL<=0なら書き込まない）
	ttl := ttlCalc(data)
	if ttl > 0 {
		_ = SetJSON(key, data, ttl)
	}

	return data, nil
}
