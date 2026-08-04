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
  price: number // in JPY, 0 = 応募無料
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
  orderNo: string
  saleId: string
  saleName: string
  price: number
  status: FlashOrderStatus
  createdAt: string
  paidAt?: string
}

export interface LotteryOrderItem {
  id: string
  lotteryId: string
  lotteryName: string
  appliedAt: string
  status: LotteryOrderStatus
  payDeadline?: string
  price?: number
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
  data: T
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

// ===== Mock payment =====

export type PaymentMethod = 'credit_card' | 'convenience' | 'bank_transfer'

export interface MockPaymentPayload {
  orderId: string
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
