// Type definitions for FlashBuy frontend

export type SaleType = 'flash' | 'lottery';

export type OrderStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'TIMEOUT';

export type LotteryStatus = 'OPEN' | 'DRAWING' | 'DRAWN' | 'CLOSED';

export type FlashSaleStatus = 'UPCOMING' | 'ACTIVE' | 'ENDED' | 'SOLD_OUT';

// ===== Product / Sale models =====

export interface FlashSaleItem {
  id: string;
  serialNo: string;         // e.g. "No. 00214"
  name: string;
  description: string;
  imageUrl: string;
  price: number;            // in JPY
  stock: number;
  totalStock: number;
  status: FlashSaleStatus;
  startsAt: string;         // ISO datetime
  endsAt: string;
  category: string;
}

export interface LotteryItem {
  id: string;
  serialNo: string;         // e.g. "LOT. 00089"
  name: string;
  description: string;
  imageUrl: string;
  price: number;            // in JPY, 0 = 応募無料
  winnerCount: number;
  applicantCount: number;
  status: LotteryStatus;
  applyDeadline: string;    // ISO datetime
  drawAt: string;
  category: string;
}

// ===== Order & Application models =====

export interface FlashSaleOrderItem {
  id: string;
  orderNo: string;
  saleId: string;
  saleName: string;
  price: number;
  status: OrderStatus;
  createdAt: string;
  paidAt?: string;
}

export interface LotteryApplicationItem {
  id: string;
  lotteryId: string;
  lotteryName: string;
  appliedAt: string;
  result: 'PENDING' | 'WON' | 'LOST';
  payDeadline?: string;
  payStatus?: 'UNPAID' | 'PAID' | 'EXPIRED';
}

// ===== Auth =====

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: 'user' | 'admin';
}

// ===== API response wrappers =====

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ===== Mock payment =====

export type PaymentMethod = 'credit_card' | 'convenience' | 'bank_transfer';

export interface MockPaymentPayload {
  orderId: string;
  amount: number;
  method: PaymentMethod;
}

export interface MockPaymentResult {
  success: boolean;
  transactionId: string;
  paidAt: string;
}
