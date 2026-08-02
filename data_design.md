# FlashBuy データ構造・バックエンド設計分析

> 作成者: 王迎新  
> 更新: 2026-08-01  
> 対象: フロントエンドデータ構造 / Aurora PostgreSQL テーブル設計 / S3 設計 / アクセスフロー

---

## 1. 現在のフロントエンドデータ構造 (`src/types/index.ts`)

### 1-1. FlashItem（フラッシュセール商品）

```typescript
export type FlashStatus = 'UPCOMING' | 'ACTIVE' | 'SOLD_OUT' | 'ENDED'

export interface FlashItem {
  id: string // "fl-20260730-0042"
  name: string
  description: string
  imageUrl: string // S3 Object URL
  price: number // 円 (JPY)
  stock: number // 残在庫
  totalStock: number // 初期在庫
  status: FlashStatus // 判定/動的計算
  startsAt: string // ISO datetime
  endsAt: string // ISO datetime
  category: string // "ライブ・コンサート", "限定スニーカー" など
  viewCount: number // 閲覧数（人気度指標）
  specifications?: { label: string; value: string }[] // S3静的詳細スペック (全商品共通)
  rules?: string[] // S3静的注意事項・購入規約リスト (全商品共通)
}
```

---

### 1-2. LotteryItem（抽選）

```typescript
export type LotteryStatus = 'UPCOMING' | 'ACTIVE' | 'DRAWING' | 'ENDED'

export interface LotteryItem {
  id: string // "lt-20260730-0041"
  name: string
  description: string
  imageUrl: string
  price: number // 当選時の支払額。0=無料応募
  winnerCount: number // 当選枠数
  applyCount: number // 現在の応募者数（リアルタイム）
  status: LotteryStatus // 判定/動的計算
  startsAt: string // ISO datetime — 応募開始日時 (これより前は UPCOMING)
  applyDeadline: string // ISO datetime — 応募締切日時
  drawAt: string // ISO datetime — 抽選実施日時
  category: string
  viewCount: number // 閲覧数（人気度指標）
  specifications?: { label: string; value: string }[] // S3静的詳細スペック (全商品共通)
  rules?: string[] // S3静的注意事項・応募規約リスト (全商品共通)
}
```

---

### 1-3. FlashOrderItem（フラッシュ購入注文）

```typescript
export type FlashOrderStatus = 'UNPAID' | 'PAID' | 'CANCELLED'

export interface FlashOrderItem {
  id: string
  orderNo: string // "FB-20260730-0042"
  saleId: string // FK → FlashItem.id
  saleName: string // 非正規化（表示用）
  price: number
  status: FlashOrderStatus
  createdAt: string
  paidAt?: string
}
```

---

### 1-4. LotteryOrderItem（抽選応募・当落・決済統合モデル）

```typescript
export type LotteryOrderStatus = 'WAITING' | 'UNPAID' | 'LOST' | 'PAID' | 'CANCELLED'

export interface LotteryOrderItem {
  id: string
  lotteryId: string // FK → LotteryItem.id
  lotteryName: string // 非正規化（表示用）
  appliedAt: string
  status: LotteryOrderStatus // WAITING=抽選待ち, UNPAID=当選(未払い), LOST=落選, PAID=当選(支払済), CANCELLED=キャンセル
  payDeadline?: string // 当選時の支払期限
  price?: number // 当選時の支払額
}
```

---

### 1-5. User（ユーザー）

```typescript
export interface User {
  id: string
  email: string
  displayName: string
  role: 'user' | 'admin'
}
```

---

### 1-6. 人気 Top 10

```typescript
export interface HomeTop10 {
  flashList: FlashItem[] // 人気 Top 10
  lotteryList: LotteryItem[] // 人気 Top 10
}
```

---

## 2. Aurora PostgreSQL テーブル設計

> **エンジン**: Aurora PostgreSQL 15 (Serverless v2)  
> **文字コード**: UTF-8  
> **命名規則**: snake_case

### 2-1. `users` テーブル

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cognito_sub   VARCHAR(128) UNIQUE NOT NULL,  -- Cognito User Pool Subject
  email         VARCHAR(255) UNIQUE NOT NULL,
  display_name  VARCHAR(100) NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'user'
                CHECK (role IN ('user', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_cognito_sub ON users(cognito_sub);
```

### 2-2. `flash_items` テーブル

```sql
CREATE TABLE flash_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  description     TEXT NOT NULL,
  image_s3_key    VARCHAR(512),
  detail_s3_key   VARCHAR(512),                   -- S3 JSON詳細ファイルのキー
  price           INTEGER NOT NULL CHECK (price >= 0),
  stock           INTEGER NOT NULL DEFAULT 0,
  total_stock     INTEGER NOT NULL,
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  category        VARCHAR(100) NOT NULL,
  view_count      BIGINT NOT NULL DEFAULT 0,       -- Redis から定期同期
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_stock_range CHECK (stock >= 0 AND stock <= total_stock),
  CONSTRAINT chk_time_range  CHECK (ends_at > starts_at)
);

CREATE INDEX idx_flash_items_view_count  ON flash_items(view_count DESC);
CREATE INDEX idx_flash_items_times       ON flash_items(starts_at, ends_at);
CREATE INDEX idx_flash_items_category    ON flash_items(category);
CREATE INDEX idx_flash_items_stock       ON flash_items(stock) WHERE stock > 0;
```

### 2-3. `lottery_items` テーブル

```sql
CREATE TABLE lottery_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(255) NOT NULL,
  description      TEXT NOT NULL,
  image_s3_key     VARCHAR(512),
  detail_s3_key    VARCHAR(512),                  -- S3 JSON詳細ファイルのキー
  price            INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
  winner_count     INTEGER NOT NULL CHECK (winner_count > 0),
  apply_count      INTEGER NOT NULL DEFAULT 0,    -- Redis INCR / カウント同期
  starts_at        TIMESTAMPTZ NOT NULL,          -- 応募開始日時
  apply_deadline   TIMESTAMPTZ NOT NULL,
  draw_at          TIMESTAMPTZ NOT NULL,
  category         VARCHAR(100) NOT NULL,
  view_count       BIGINT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_lottery_times CHECK (draw_at > apply_deadline AND apply_deadline >= starts_at)
);

CREATE INDEX idx_lottery_items_view_count   ON lottery_items(view_count DESC);
CREATE INDEX idx_lottery_items_times        ON lottery_items(starts_at, apply_deadline, draw_at);
CREATE INDEX idx_lottery_items_category     ON lottery_items(category);
```

### 2-4. `flash_orders` テーブル（注文）

```sql
CREATE TABLE flash_orders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no     VARCHAR(30) UNIQUE NOT NULL,       -- "FB-20260730-0042"
  user_id      UUID NOT NULL REFERENCES users(id),
  sale_id      UUID NOT NULL REFERENCES flash_items(id),
  price        INTEGER NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'UNPAID'
                CHECK (status IN ('UNPAID','PAID','CANCELLED')),
  paid_at      TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ NOT NULL,              -- 支払期限（UNPAID→CANCELLED 用）
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_flash_orders_user_id  ON flash_orders(user_id, created_at DESC);
CREATE INDEX idx_flash_orders_sale_id  ON flash_orders(sale_id);
CREATE INDEX idx_flash_orders_expires  ON flash_orders(expires_at) WHERE status = 'UNPAID';
```

### 2-5. `lottery_orders` テーブル（抽選応募）

```sql
CREATE TABLE lottery_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  lottery_id    UUID NOT NULL REFERENCES lottery_items(id),
  applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status        VARCHAR(20) NOT NULL DEFAULT 'WAITING'
                CHECK (status IN ('WAITING','UNPAID','LOST','PAID','CANCELLED')),
  pay_deadline  TIMESTAMPTZ,                       -- 当選者の支払期限
  paid_at       TIMESTAMPTZ,                       -- 決済完了日時
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 同一ユーザーの二重応募防止
  UNIQUE (user_id, lottery_id)
);

CREATE INDEX idx_lottery_orders_user     ON lottery_orders(user_id, applied_at DESC);
CREATE INDEX idx_lottery_orders_lottery  ON lottery_orders(lottery_id);
CREATE INDEX idx_lottery_orders_deadline ON lottery_orders(pay_deadline)
  WHERE status = 'UNPAID';
```

---

## 3. S3 バケット設計 & ペイロード分離

### 3-1. バケット構成

| バケット名               | 用途                                       | アクセス                |
| :----------------------- | :----------------------------------------- | :---------------------- |
| `flashbuy-media-{env}`   | 商品画像・管理者アップロード               | 非公開 + CloudFront CDN |
| `flashbuy-detail-{env}`  | 詳細仕様 JSON (`specifications` & `rules`) | 非公開 + CloudFront CDN |
| `flashbuy-logs-{env}`    | ALB / CloudFront アクセスログ              | 非公開                  |
| `flashbuy-archive-{env}` | 冷データ長期保存 (Glacier / Deep Archive)  | 非公開                  |

---

### 3-2. `flashbuy-detail-{env}` — シングル SKU ペイロード JSON 例

`flash/fl-20260730-0042.json`:

```json
{
  "id": "fl-20260730-0042",
  "specifications": [
    { "label": "開催会場", "value": "東京ドーム（東京都文京区後楽1-3-61）" },
    { "label": "主催・企画", "value": "銀河少年団 2026 実行委員会" },
    { "label": "発券方法", "value": "電子チケット（FlashBuy スマチケ アプリ入場）" },
    { "label": "お問い合わせ", "value": "DISK GARAGE (TEL: 050-1111-1111)" }
  ],
  "rules": [
    "お1人様 1回につき 1枚までご購入いただけます。",
    "転売目的の購入は固く禁止されており、入場時に本人確認を実施します。",
    "未就学児童の入場は不可となります（小学生以上チケット必要）"
  ],
  "updatedAt": "2026-08-01T10:00:00Z"
}
```

---

## 4. データアクセスフロー

```
Browser ──[GET /api/v1/home/top10]──> CloudFront (TTL: 30s)
                                                │ (Miss)
                                                ▼
                                         Go API / Lambda
                                                │
                                                ├─→ Redis ZSET (flashList / lotteryList Top 10)
                                                └─→ Aurora (Fallback)
```

---
