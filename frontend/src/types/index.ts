export type FlashOrderStatus = 'UNPAID' | 'PAID' | 'CANCELLED'

export type LotteryOrderStatus = 'WAITING' | 'UNPAID' | 'LOST' | 'PAID' | 'CANCELLED'

export type LotteryStatus = 'UPCOMING' | 'ACTIVE' | 'DRAWING' | 'ENDED'

export type FlashStatus = 'UPCOMING' | 'ACTIVE' | 'SOLD_OUT' | 'ENDED'

// ===== FlashItem / LotteryItem =====

export interface FlashItem {
  id: string
  name: string
  description: string
  imageUrl: string
  price: number // in JPY
  stock: number
  totalStock: number
  status: FlashStatus
  startsAt: string // ISO datetime
  endsAt: string
  category: string
  viewCount: number // ページの閲覧数（人気度の指標）
  // S3静的ストレージ標準詳細属性 (全商品共通固定)
  specifications?: { label: string; value: string }[] // 商品スペック
  rules?: string[] // 注意事項・購入規約リスト
}

export interface LotteryItem {
  id: string
  name: string
  description: string
  imageUrl: string
  price: number // 応募費（JPY、0 = 応募無料）
  chosenPrice: number // 当選時に実際に支払う金額（JPY）
  winnerCount: number
  applyCount: number
  status: LotteryStatus
  startsAt: string // ISO datetime — 応募開始日時（これより前は UPCOMING）
  applyDeadline: string // ISO datetime — 応募締切日時
  drawAt: string // ISO datetime — 抽選実施日時
  category: string
  viewCount: number // ページの閲覧数（人気度の指標）
  // S3静的ストレージ標準詳細属性 (全商品共通固定)
  specifications?: { label: string; value: string }[] // 商品スペック
  rules?: string[] // 注意事項・応募規約リスト
}

// ===== FlashOrderItem / LotteryOrderItem =====

export interface FlashOrderItem {
  id: string
  saleId: string
  saleName: string
  imageS3Key?: string // 商品画像のS3キー
  imageUrl?: string // 商品画像の表示用URL（toImageUrl で生成）
  price: number
  status: FlashOrderStatus
  createdAt: string
  paidAt?: string
  expiresAt?: string // 支払期限（UNPAIDのみ）
}

export interface LotteryOrderItem {
  id: string
  lotteryId: string
  lotteryName: string
  imageS3Key?: string // 商品画像のS3キー
  imageUrl?: string // 商品画像の表示用URL（toImageUrl で生成）
  appliedAt: string
  status: LotteryOrderStatus
  payDeadline?: string
  price?: number // 応募費（0 = 応募無料）
  chosenPrice?: number // 当選時に実際に支払う金額
}

// ===== Auth =====

export interface User {
  id: string
  email: string
  displayName: string
  role: 'user' | 'admin'
}

// ===== API response wrappers =====

export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

// ===== Admin 商品作成 =====

export interface AdminFlashPayload {
  name: string
  category: string
  price: number
  stock: number
  description?: string
  startsAt?: string
  endsAt?: string
  imageS3Key?: string // 画像のS3キー
  // 商品仕様・注意事項
  specifications?: { label: string; value: string }[]
  rules?: string[]
}

export interface AdminLotteryPayload {
  name: string
  category: string
  price: number // 応募費
  chosenPrice: number // 当選時の支払額
  winnerCount: number // 当選枠数
  description?: string
  startsAt?: string
  applyDeadline?: string
  drawAt?: string
  imageS3Key?: string // 画像のS3キー
  // 商品仕様・注意事項
  specifications?: { label: string; value: string }[]
  rules?: string[]
}

// ===== Mock payment =====

export type PaymentMethod = 'credit_card' | 'convenience' | 'bank_transfer'

export interface MockPaymentPayload {
  orderId: string
  orderType: 'flash' | 'lottery'
  amount: number
  method: PaymentMethod
}

export interface MockPaymentResult {
  success: boolean
  transactionId: string
  paidAt: string
}

// ===== 人気Top10 =====

export interface HomeTop10 {
  flashList: FlashItem[] // 人気Top10
  lotteryList: LotteryItem[] // 人気Top10
}
