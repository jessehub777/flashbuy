// Mock API service — simulates backend responses for portfolio demo
// In production, replace with real axios calls to the Go API

import dayjs from 'dayjs';
import type {
  FlashSaleItem,
  LotteryItem,
  FlashSaleOrderItem,
  LotteryApplicationItem,
  MockPaymentPayload,
  MockPaymentResult,
} from '../types';

// Simulate network delay
const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

// ===== Mock Data =====

const now = dayjs();

export const mockFlashSaleList: FlashSaleItem[] = [
  {
    id: 'fs-001',
    serialNo: 'No. 00214',
    name: '限定スニーカー — Runner Low',
    description:
      '数量限定のコラボスニーカー。軽量ソールと通気性の高いメッシュアッパーで、毎日の快適さを追求。カラーウェイはブラック×ホワイトの定番配色。',
    imageUrl: '/images/sneaker.jpg',
    price: 12800,
    stock: 32,
    totalStock: 120,
    status: 'ACTIVE',
    startsAt: now.subtract(1, 'hour').toISOString(),
    endsAt: now.add(2, 'day').add(14, 'hour').toISOString(),
    category: 'ファッション',
  },
  {
    id: 'fs-002',
    serialNo: 'No. 00215',
    name: 'ワイヤレスイヤホン Pro',
    description:
      'アクティブノイズキャンセリング搭載。最大36時間再生。IPX5防水対応。Bluetoothマルチポイント接続で2台同時接続可能。',
    imageUrl: '/images/earphone.jpg',
    price: 8900,
    stock: 8,
    totalStock: 200,
    status: 'ACTIVE',
    startsAt: now.subtract(2, 'hour').toISOString(),
    endsAt: now.add(1, 'day').toISOString(),
    category: 'ガジェット',
  },
  {
    id: 'fs-003',
    serialNo: 'No. 00216',
    name: '保温タンブラー 500ml',
    description:
      '真空断熱二重構造。保温12時間・保冷24時間。漏れ防止フタ付き。食洗機対応のステンレス製ボトル。',
    imageUrl: '/images/tumbler.jpg',
    price: 2400,
    stock: 61,
    totalStock: 80,
    status: 'ACTIVE',
    startsAt: now.subtract(30, 'minute').toISOString(),
    endsAt: now.add(3, 'day').toISOString(),
    category: 'キッチン',
  },
  {
    id: 'fs-004',
    serialNo: 'No. 00217',
    name: 'メカニカルキーボード TKL',
    description:
      'テンキーレス配列。Cherry MX赤軸採用。RGBバックライト。USBとBluetoothのデュアル接続対応。',
    imageUrl: '/images/keyboard.jpg',
    price: 15800,
    stock: 5,
    totalStock: 50,
    status: 'ACTIVE',
    startsAt: now.subtract(10, 'minute').toISOString(),
    endsAt: now.add(12, 'hour').toISOString(),
    category: 'ガジェット',
  },
];

export const mockLotteryList: LotteryItem[] = [
  {
    id: 'lt-001',
    serialNo: 'LOT. 00089',
    name: 'パーソナルトレーニング 体験3回',
    description:
      '都内一流ジムのパーソナルトレーナーによる体験セッション3回分。食事指導アドバイス付き。',
    imageUrl: '/images/training.jpg',
    price: 0,
    winnerCount: 3,
    applicantCount: 214,
    status: 'OPEN',
    applyDeadline: now.add(2, 'day').add(14, 'hour').toISOString(),
    drawAt: now.add(2, 'day').add(15, 'hour').toISOString(),
    category: 'フィットネス',
  },
  {
    id: 'lt-002',
    serialNo: 'LOT. 00090',
    name: '限定モデル腕時計',
    description:
      '国内300個限定のコラボウォッチ。サファイアクリスタルガラス、スイス製自動巻きムーブメント採用。',
    imageUrl: '/images/watch.jpg',
    price: 0,
    winnerCount: 1,
    applicantCount: 632,
    status: 'OPEN',
    applyDeadline: now.add(5, 'hour').toISOString(),
    drawAt: now.add(6, 'hour').toISOString(),
    category: 'ファッション',
  },
  {
    id: 'lt-003',
    serialNo: 'LOT. 00091',
    name: 'ヨガ体験レッスン 5枚チケット',
    description:
      '人気ヨガスタジオの体験レッスンチケット5枚セット。初心者から上級者まで対応のクラスを選べます。',
    imageUrl: '/images/yoga.jpg',
    price: 0,
    winnerCount: 10,
    applicantCount: 88,
    status: 'OPEN',
    applyDeadline: now.add(1, 'day').add(3, 'hour').toISOString(),
    drawAt: now.add(1, 'day').add(4, 'hour').toISOString(),
    category: 'フィットネス',
  },
];

export const mockFlashSaleOrderList: FlashSaleOrderItem[] = [
  {
    id: 'ord-001',
    orderNo: 'FB-20260730-001',
    saleId: 'fs-001',
    saleName: '限定スニーカー — Runner Low',
    price: 12800,
    status: 'PAID',
    createdAt: now.subtract(2, 'day').toISOString(),
    paidAt: now.subtract(2, 'day').add(5, 'minute').toISOString(),
  },
  {
    id: 'ord-002',
    orderNo: 'FB-20260729-042',
    saleId: 'fs-002',
    saleName: 'ワイヤレスイヤホン Pro',
    price: 8900,
    status: 'PENDING',
    createdAt: now.subtract(10, 'minute').toISOString(),
  },
];

export const mockLotteryApplicationList: LotteryApplicationItem[] = [
  {
    id: 'app-001',
    lotteryId: 'lt-001',
    lotteryName: 'パーソナルトレーニング 体験3回',
    appliedAt: now.subtract(1, 'day').toISOString(),
    result: 'PENDING',
  },
  {
    id: 'app-002',
    lotteryId: 'lt-002',
    lotteryName: '限定モデル腕時計',
    appliedAt: now.subtract(3, 'day').toISOString(),
    result: 'WON',
    payDeadline: now.add(2, 'day').toISOString(),
    payStatus: 'UNPAID',
  },
];

// ===== API Functions =====

export const api = {
  // Flash Sales
  async getFlashSaleList(): Promise<FlashSaleItem[]> {
    await delay(400);
    return mockFlashSaleList.filter((s) => s.status === 'ACTIVE');
  },

  async getFlashSaleById(id: string): Promise<FlashSaleItem | null> {
    await delay(300);
    return mockFlashSaleList.find((s) => s.id === id) ?? null;
  },

  // Lottery
  async getLotteryList(): Promise<LotteryItem[]> {
    await delay(400);
    return mockLotteryList.filter((l) => l.status === 'OPEN');
  },

  async getLotteryById(id: string): Promise<LotteryItem | null> {
    await delay(300);
    return mockLotteryList.find((l) => l.id === id) ?? null;
  },

  // Flash Buy — mock purchase flow
  // Simulates: token-bucket check → Redis Lua stock deduction → SQS queue
  async flashBuy(saleId: string): Promise<{ orderNo: string; status: 'QUEUED' | 'SOLD_OUT' }> {
    await delay(600);
    const sale = mockFlashSaleList.find((s) => s.id === saleId);
    if (!sale || sale.stock <= 0) {
      return { orderNo: '', status: 'SOLD_OUT' };
    }
    // Simulate stock decrement
    sale.stock = Math.max(0, sale.stock - 1);
    const orderNo = `FB-${dayjs().format('YYYYMMDD')}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    return { orderNo, status: 'QUEUED' };
  },

  // Lottery apply
  async applyLottery(lotteryId: string): Promise<{ applicationId: string }> {
    await delay(500);
    const item = mockLotteryList.find((l) => l.id === lotteryId);
    if (item) item.applicantCount += 1;
    return { applicationId: `APP-${Date.now()}` };
  },

  // Orders & Applications
  async getMyFlashSaleOrderList(): Promise<FlashSaleOrderItem[]> {
    await delay(400);
    return mockFlashSaleOrderList;
  },

  async getMyLotteryApplicationList(): Promise<LotteryApplicationItem[]> {
    await delay(400);
    return mockLotteryApplicationList;
  },

  // Mock payment — simulates: PENDING → PAID / TIMEOUT state machine
  async processMockPayment(payload: MockPaymentPayload): Promise<MockPaymentResult> {
    await delay(1500); // Simulate payment processing
    const success = Math.random() > 0.1; // 90% success rate
    if (success) {
      // Update mock order status
      const order = mockFlashSaleOrderList.find((o) => o.id === payload.orderId);
      if (order) {
        order.status = 'PAID';
        order.paidAt = dayjs().toISOString();
      }
    }
    return {
      success,
      transactionId: `TXN-${Date.now()}`,
      paidAt: dayjs().toISOString(),
    };
  },

  // Auth (mock)
  async login(email: string, _password: string) {
    await delay(800);
    return {
      user: {
        id: 'u-001',
        email,
        displayName: email.split('@')[0],
        role: email.includes('admin') ? 'admin' : 'user',
      },
      token: 'mock-jwt-token-' + Date.now(),
    };
  },

  async logout() {
    await delay(200);
  },
};
