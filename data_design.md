# FlashBuy データ構造・バックエンド設計

> 作成者: 王迎新
> 更新: 2026-09-03
> 対象: フロント型 / PostgreSQL テーブル / S3 / キャッシュ / アクセスフロー
> 正本: `api/init_db.sql` が正本。`api/models/*.go` と `api/controllers/*.go` が実装。
> 本書とコードが違う場合はコードを正とする。

---

## 1. フロント型 (`frontend/src/types/index.ts`)

状態（`status`）はバックエンドが返さない。フロントが時間と在庫から計算する。

### 1-1. FlashItem（フラッシュセール商品）

```typescript
export type FlashStatus = 'UPCOMING' | 'ACTIVE' | 'SOLD_OUT' | 'ENDED'

export interface FlashItem {
  id: string
  name: string
  description: string
  imageUrl: string // imageS3Key から toImageUrl() で作る。バックエンドは imageS3Key だけ返す
  price: number // 円 (JPY)
  stock: number // 残在庫（リアルタイム、Redis が正本）
  totalStock: number // 最初の総在庫（変わらない、表示用）
  status: FlashStatus // フロントが計算（computeFlashStatus）
  startsAt: string // ISO datetime
  endsAt: string // ISO datetime
  category: string
  viewCount: number // 閲覧数（リアルタイム、UPDATE ... RETURNING で取る）
  specifications?: { label: string; value: string }[] // detail_json をパースしたもの
  rules?: string[] // detail_json をパースしたもの
}
```

### 1-2. LotteryItem（抽選）

```typescript
export type LotteryStatus = 'UPCOMING' | 'ACTIVE' | 'DRAWING' | 'ENDED'

export interface LotteryItem {
  id: string
  name: string
  description: string
  imageUrl: string // 同上、toImageUrl() で作る
  price: number // 応募費。0 = 無料応募
  chosenPrice: number // 当選時の支払額（DB は chosen_price）
  winnerCount: number // 当選枠数
  applyCount: number // 応募者数（リアルタイム、DB から取る）
  status: LotteryStatus // フロントが計算（computeLotteryStatus）
  startsAt: string // 応募開始日時
  applyDeadline: string // 応募締切日時
  drawAt: string // 抽選日時
  category: string
  viewCount: number
  specifications?: { label: string; value: string }[]
  rules?: string[]
}
```

### 1-3. FlashOrderItem（購入注文、マイページ用）

```typescript
export type FlashOrderStatus = 'UNPAID' | 'PAID' | 'CANCELLED'

export interface FlashOrderItem {
  id: string
  saleId: string // FK → FlashItem.id（DB は flash_id）
  saleName: string // JOIN で取る（表示用）
  imageS3Key?: string
  imageUrl?: string // toImageUrl() で作る
  price: number
  status: FlashOrderStatus
  createdAt: string
  paidAt?: string
  expiresAt?: string // 支払期限（UNPAID のみ。15 分）
}
```

### 1-4. LotteryOrderItem（応募・マイページ用）

```typescript
export type LotteryOrderStatus = 'WAITING' | 'LOST' | 'UNPAID' | 'PAID' | 'CANCELLED'
// WAITING=抽選待ち, LOST=落選, UNPAID=当選（未払い）, PAID=支払済, CANCELLED=取消

export interface LotteryOrderItem {
  id: string
  lotteryId: string // FK → LotteryItem.id
  lotteryName: string // JOIN で取る（表示用）
  imageS3Key?: string
  imageUrl?: string
  appliedAt: string
  applyDeadline: string // 締切表示用（JOIN で取る）
  drawAt: string // 開票待ちの残り時間表示用（JOIN で取る）
  status: LotteryOrderStatus
  payDeadline?: string // 当選時の支払期限（72 時間）
  price?: number // 応募費
  chosenPrice?: number // 当選時の支払額
}
```

### 1-5. User（ユーザー）

```typescript
export interface User {
  id: string // Cognito sub をそのまま使う。パスワード列はない
  email: string
  displayName: string
  role: 'user' | 'admin'
}
```

> 認証は Cognito が持つ。フロントは Cognito に直接行かず、
> `POST /api/v1/auth/register|login`（バックエンド代理）を使う。

### 1-6. HomeTop10（人気 Top 10）

```typescript
export interface HomeTop10 {
  flashList: FlashItem[] // 人気 Top 10
  lotteryList: LotteryItem[] // 人気 Top 10
}
```

### 1-7. 共通レスポンス

```typescript
export interface ApiResponse<T> {
  code: number // 0=成功。500/400/401/403/10001/10002/10003 は pkg/response/codes.go
  message: string
  data: T
}
```

- `10001` 在庫切れ、`10002` 重複応募、`10003` 支払期限切れ。
- コントローラは `response.Success / response.Error` だけ使う。

---

## 2. PostgreSQL テーブル設計（`api/init_db.sql` が正本）

> **エンジン**: RDS PostgreSQL 15（provisioned、`db.t4g.micro`）。
> Aurora Serverless v2 は生産進化目標（選型理由は README §5.1）。
> **文字コード**: UTF-8 / **命名**: snake_case / **拡張**: `pgcrypto`（`gen_random_uuid()` 用）。
> Go モデルは `db:"snake_case"` + `json:"camelCase"`。NULL になる列はポインタ（`*string` / `*time.Time`）で受ける。

### 2-1. `users` テーブル

```sql
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,               -- Cognito sub（認証基盤が発行した固定ID）
  email VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
);
```

- パスワード列なし。役割チェックは `RequireRole("admin")` が Redis（`role:{userId}`、TTL 5 分）に持つ。Redis 故障時は DB に戻る。

### 2-2. `flash_items` テーブル

```sql
CREATE TABLE IF NOT EXISTS flash_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  image_s3_key VARCHAR(512),          -- NULL 可。画像のS3キーだけ持つ
  detail_json TEXT,                   -- NULL 可。仕様・注意事項のJSON（§3-2）
  price INTEGER NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0,   -- Redis が正本。DB は落账用
  total_stock INTEGER NOT NULL,       -- 最初の総在庫。作った後は変わらない
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  category VARCHAR(100) NOT NULL,     -- 未指定なら "限定アイテム"
  view_count BIGINT NOT NULL DEFAULT 0, -- 詳細表示のたび UPDATE ... RETURNING で +1
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  CONSTRAINT chk_stock_range CHECK (stock >= 0 AND stock <= total_stock),
  CONSTRAINT chk_time_range CHECK (ends_at > starts_at)
);
-- 商品テーブルにインデックスなし。理由:
--  ・行が少ない（運用が手で作る）。全表走査で速い
--  ・view_count は毎回 UPDATE される。インデックスは書込みを重くするだけ
--  ・検索は ILIKE '%語%' のため btree が効かない
```

- 作成デフォルト（`admin_controller.go`）: 未指定なら即時開始・24 時間後終了。`total_stock = stock`。
- `image_s3_key` / `detail_json` は Go で `*string`（NULL 対策）。

### 2-3. `lottery_items` テーブル

```sql
CREATE TABLE IF NOT EXISTS lottery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  image_s3_key VARCHAR(512),          -- NULL 可
  detail_json TEXT,                   -- NULL 可（§3-2）
  price INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),          -- 応募費
  chosen_price INTEGER NOT NULL DEFAULT 0 CHECK (chosen_price >= 0), -- 当選時の支払額
  winner_count INTEGER NOT NULL CHECK (winner_count > 0),
  apply_count INTEGER NOT NULL DEFAULT 0, -- 応募のたび +1（トランザクション内）
  starts_at TIMESTAMPTZ NOT NULL,     -- 応募開始日時
  apply_deadline TIMESTAMPTZ NOT NULL,
  draw_at TIMESTAMPTZ NOT NULL,
  category VARCHAR(100) NOT NULL,
  view_count BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  CONSTRAINT chk_lottery_times CHECK (
    draw_at > apply_deadline
    AND apply_deadline >= starts_at
  )
);
-- flash_items と同じ理由でインデックスなし
```

- 作成デフォルト: 未指定なら即時開始・7 日後締切・締切翌日が抽選日（`draw_at > apply_deadline` を守る）。`chosenPrice` 未指定なら `price` と同じ。
- 作成後に EventBridge Scheduler に `draw-{lotteryId}`（`at(draw_at)`、UTC、`Z` なし）を登録する。失敗しても商品作成は成功にする（ログだけ）。

### 2-4. `flash_orders` テーブル（注文）

```sql
CREATE TABLE IF NOT EXISTS flash_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id UUID NOT NULL REFERENCES users (id),
  flash_id UUID NOT NULL REFERENCES flash_items(id),
  price INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('UNPAID','PAID','CANCELLED')),
  paid_at TIMESTAMPTZ,                -- NULL 可
  expires_at TIMESTAMPTZ NOT NULL,    -- 注文 + 15 分
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
);

-- マイページ履歴用（user_id で絞って created_at 降順）
CREATE INDEX IF NOT EXISTS idx_flash_orders_user ON flash_orders (user_id, created_at DESC);
-- 期限切れ監視用。UNPAID だけの部分インデックス（小さい・速い）
CREATE INDEX IF NOT EXISTS idx_flash_orders_expire ON flash_orders (expires_at)
WHERE status = 'UNPAID';
-- flash_id にインデックスなし（flash_id で注文を引くクエリがない。商品削除もしない）
```

- 下单フロー（`flash_buy.go`）: Redis Lua で在庫ロック → 価格取得 → トランザクション（`INSERT UNPAID` + `stock - 1`）→ `at(expires_at)`（`expire-{orderId}`）を登録。
- `expires_at` と Schedule 時刻は同じ変数を使う（ずれると期限前判定で取消が飛ぶ）。

### 2-5. `lottery_orders` テーブル（応募）

```sql
CREATE TABLE IF NOT EXISTS lottery_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id UUID NOT NULL REFERENCES users (id),
  lottery_id UUID NOT NULL REFERENCES lottery_items(id),
  price INTEGER NOT NULL,             -- 応募費のコピー
  chosen_price INTEGER NOT NULL,      -- 当選時支払額のコピー
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  status VARCHAR(20) NOT NULL DEFAULT 'WAITING' CHECK (
    status IN ('WAITING', 'UNPAID', 'LOST', 'PAID', 'CANCELLED')
  ),
  pay_deadline TIMESTAMPTZ,           -- 当選 + 72 時間。NULL 可
  paid_at TIMESTAMPTZ,                -- NULL 可
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  UNIQUE (user_id, lottery_id)        -- 二重応募防止。user_id 先頭のため履歴検索にも使う
);

-- 開票処理用（WHERE lottery_id = $1 AND status = 'WAITING' の全件走査 + FK）
-- UNIQUE(user_id, lottery_id) は lottery_id が2番目のため単独で必要
CREATE INDEX IF NOT EXISTS idx_lottery_orders_lottery ON lottery_orders (lottery_id);
-- 期限切れ監視用。UNPAID だけの部分インデックス
CREATE INDEX IF NOT EXISTS idx_lottery_orders_expire ON lottery_orders (pay_deadline)
WHERE status = 'UNPAID';
```

- 応募フロー（`lottery_apply.go`）: 期間チェック → トランザクション（`INSERT ... ON CONFLICT DO NOTHING` + `apply_count + 1`）。重複は `10002`。
- 開票（Lambda）: `WHERE lottery_id=$1 AND status='WAITING'` を全部 `LOST` にして、当選分だけ `UNPAID`（+ `pay_deadline` 72 時間）に戻す。超長い `IN` を作らない。
- 支払い（`payment_controller.go`）: 60% 成功 / 40% 失敗のモック。成功時は `UNPAID → PAID`（期限条件付き）。期限切れは `10003`。

---

## 3. S3 設計（画像だけ。詳細は DB）

### 3-1. バケット構成（`terraform/storage/main.tf`）

| バケット名 | 用途 | アクセス |
| :-- | :-- | :-- |
| `flashbuy-images-{env}` | 商品画像だけ | 公開読み取り（GetObject のみ）+ CORS |

- 理由: 詳細は数 KB の JSON で、詳細画面のたび必ず読む。DB 列（`detail_json`）なら 1 SQL で返せる。S3 に置くと DB/S3 二重書込みになる。
- CORS の `allowed_origins` に実際の access 域名を入れる（IP で開く時は `*` に緩める。生産は CloudFront に締める）。

### 3-2. `detail_json`（`models/item_detail.go`）

```json
{
  "specifications": [
    { "label": "開催会場", "value": "東京ドーム（東京都文京区後楽1-3-61）" }
  ],
  "rules": [
    "お1人様 1回につき 1枚までご購入いただけます。"
  ]
}
```

- DB の `detail_json TEXT` にこの形で保存する。空なら `NULL`。
- `ParseItemDetail(nil/"")` は空で返す（エラーにしない）。パース失敗はログだけ残し、商品自体は返す。

### 3-3. 画像アップロードフロー（`upload_controller.go` + `pkg/s3/s3.go`）

```
管理画面 → GET /api/v1/upload/presign?folder=products&contentType=image/png（admin 必須）
  → { presignedUrl, key, publicUrl }（10 分有効）
  → ブラウザが presignedUrl に fetch で直接 PUT（axios は禁止。Content-Type が変わり署名が合わない）
  → key を imageS3Key として商品作成に使う
  → 表示時は toImageUrl() で公開 URL にする
```

- `folder` 白名簿: `products` / `lottery` だけ。`Content-Type` 白名簿: `image/jpeg` / `image/png` / `image/webp` だけ。
- キー形式: `{folder}/{yyyy}/{mm}/{ランダム32文字}.{ext}`。拡張子は Content-Type から決める（fileName を信用しない）。ランダムで上書きを防ぐ。

---

## 4. キャッシュ・在庫・アクセスフロー

### 4-1. Redis キーと TTL（`pkg/cache/cache.go` / `stock.go`）

| キー | 中身 | TTL |
| :-- | :-- | :-- |
| `flash:list` | 一覧（`ends_at > now()`、閲覧数降順） | 30 秒 |
| `lottery:list` | 一覧（`draw_at > now()`、閲覧数降順） | 30 秒 |
| `home:top10` | 上の一覧を各 10 件 | 30 秒 |
| `flash:item:{id}` | 詳細の安定部だけ（下の DTO） | `endsAt` まで（`RememberUntil`。終了済みは書かない） |
| `lottery:item:{id}` | 詳細の安定部だけ | `drawAt` まで |
| `stock:{id}` | 在庫（権威データ。キャッシュではない） | なし。`SETNX` で遅延初期化 |

- 入口は `Remember`（Cache Aside）と `RememberUntil`（TTL 動的）。Redis 操作は 2 秒制限。故障時は DB に戻る（ログだけ）。
- 書込み後は `Del` で消す（admin 作成: 一覧 + Top10。詳細編集時: 詳細キー）。

### 4-2. 冷熱分離（ホット値はキャッシュに入れない）

```go
// フラッシュ詳細キャッシュ DTO（安定部だけ）
type FlashItemCache struct {
  ID, Name, Description, ImageS3Key, Price, TotalStock, StartsAt, EndsAt, Category, CreatedAt, Specifications, Rules
}
// レスポンスはリアルタイム値を合成する
type FlashDetailResponse struct {
  FlashItemCache
  Stock     int   `json:"stock"`
  ViewCount int64 `json:"viewCount"`
}

// 抽選も同じ考え（ホット値は applyCount / viewCount）
type LotteryItemCache struct {
  ID, Name, Description, ImageS3Key, Price, ChosenPrice, WinnerCount, StartsAt, ApplyDeadline, DrawAt, Category, CreatedAt, Specifications, Rules
}
type LotteryDetailResponse struct {
  LotteryItemCache
  ApplyCount int   `json:"applyCount"`
  ViewCount  int64 `json:"viewCount"`
}
```

- 詳細表示のたび `UPDATE ... SET view_count = view_count + 1 ... RETURNING` を 1 回走らせる。同時に最新値を取る（キャッシュを壊さない）。
- 在庫は `stock:{id}` から取る。なければ DB から読んで `SETNX` で載せる（進行中の減算を上書きしない）。

### 4-3. 在庫 Lua（`stock.go`）

```lua
-- DecrStock: 在庫がなければ -2、0以下なら -1、そうでなければ DECR
local stock = redis.call('GET', KEYS[1])
if not stock then return -2 end
if tonumber(stock) <= 0 then return -1 end
return redis.call('DECR', KEYS[1])
```

- `GET → 判定 → DECR` を分けると競争になる。Lua 1 本は Redis 単線で原子になる。
- Redis が正本、DB は落账（下单で `-1`、取消で戻す）。取消は `INCR`（キーがなければ何もしない）。

### 4-4. 主なクエリ

| 画面 | クエリ |
| :-- | :-- |
| フラッシュ一覧 | `SELECT * FROM flash_items WHERE ends_at > now() ORDER BY view_count DESC` |
| 抽選一覧 | `SELECT * FROM lottery_items WHERE draw_at > now() ORDER BY view_count DESC` |
| Top10 | 上に `LIMIT 10`（`home:top10`） |
| 管理一覧 | `SELECT * FROM xx_items ORDER BY created_at DESC`（終了済み含む、キャッシュなし） |
| マイページ・注文 | `flash_orders JOIN flash_items ... WHERE user_id=$1 ORDER BY created_at DESC` |
| マイページ・応募 | `lottery_orders JOIN lottery_items ... WHERE user_id=$1 ORDER BY applied_at DESC`（`apply_deadline/draw_at` も JOIN で取る） |
| 検索 | `GET /api/v1/search?query=xx&timeRange=6m\|1y\|3y`。`name/description/category ILIKE '%語%'` + `starts_at > now() - interval`。前方案一致のため索引なし |
| 期限切れ掃引 | `WHERE status='UNPAID' AND expires_at < now() LIMIT 100`（部分索引に当たる）。取消 SQL は必ず `status='UNPAID'` を外側にも付ける（支払い競争で PAID を消さない） |

### 4-5. 認証フロー

```
フロント → POST /api/v1/auth/register|login|logout（バックエンド代理、Cognito SDK）
  → { user, token }（token = Cognito ID Token）
  → 以後は Authorization: Bearer <token>。401 なら自動 logout
バックエンド: JWKS 自動更新 + VerifyToken → AuthRequired が userID/userEmail を入れる
  → RequireRole("admin") が role:{userId}（TTL 5 分）を見る。なければ DB の users.role
```

---
