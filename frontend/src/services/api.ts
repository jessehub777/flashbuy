// API サービス — Go バックエンドへのアクセスをまとめる
import dayjs from 'dayjs'
import type {
  FlashItem,
  LotteryItem,
  FlashOrderItem,
  LotteryOrderItem,
  FlashStatus,
  LotteryStatus,
  MockPaymentPayload,
  MockPaymentResult,
  HomeTop10,
  User,
} from '../types'
import { request, requestPost, toImageUrl } from './request'

// ===== 動的ステータス計算 =====

// フラッシュセールの状態を「時刻」と「在庫」から計算する
// 優先順位: UPCOMING → ENDED → SOLD_OUT → ACTIVE
export function computeFlashStatus(item: FlashItem): FlashStatus {
  const n = dayjs()
  if (n.isBefore(dayjs(item.startsAt))) return 'UPCOMING'
  if (n.isAfter(dayjs(item.endsAt))) return 'ENDED'
  if (item.stock <= 0) return 'SOLD_OUT'
  return 'ACTIVE'
}

// 抽選の状態を「締切日」と「抽選日」から計算する
export function computeLotteryStatus(item: LotteryItem): LotteryStatus {
  const n = dayjs()
  // 応募開始前は UPCOMING
  if (n.isBefore(dayjs(item.startsAt))) return 'UPCOMING'
  // 抽選日以降は ENDED (DRAWNは廃止しENDEDに一元化)
  if (n.isAfter(dayjs(item.drawAt))) return 'ENDED'
  if (n.isAfter(dayjs(item.applyDeadline))) return 'DRAWING'
  return 'ACTIVE'
}

// ===== API 関数 =====

export const api = {
  // ホーム画面専用 — 閲覧数（viewCount）が多い人気 Top 10 を取得する API
  async getHomeTop10(): Promise<HomeTop10> {
    const res = await request<{ flashList: any[]; lotteryList: any[] }>('/api/v1/home/top10')
    return {
      flashList: res.flashList.map((s) => ({ ...toImageUrl(s), status: computeFlashStatus(s) })),
      lotteryList: res.lotteryList.map((l) => ({ ...toImageUrl(l), status: computeLotteryStatus(l) })),
    }
  },

  // フラッシュセール一覧（販売中・告知・売切を返す。完全終了は除外）
  async getFlashList(): Promise<FlashItem[]> {
    const res = await request<{ flashList: any[] }>('/api/v1/flash/list')
    return res.flashList.map((s) => ({ ...toImageUrl(s), status: computeFlashStatus(s) }))
  },

  // IDでフラッシュセールを取得する（閲覧数を1増やす）
  async getFlashById(id: string): Promise<FlashItem> {
    const res = await request<{ flashItem: any }>(`/api/v1/flash/getFlashById/${id}`)
    res.flashItem.viewCount += 1 // ページが見られたので閲覧数をプラスする
    return { ...toImageUrl(res.flashItem), status: computeFlashStatus(res.flashItem) }
  },

  // 抽選一覧（予告・受付中・抽選集計中を返す。終了・当落済みは除外）
  async getLotteryList(): Promise<LotteryItem[]> {
    const res = await request<{ lotteryList: any[] }>('/api/v1/lottery/list')
    return res.lotteryList.map((l) => ({ ...toImageUrl(l), status: computeLotteryStatus(l) }))
  },

  // IDで抽選情報を取得する（閲覧数を1増やす）
  async getLotteryById(id: string): Promise<LotteryItem> {
    const res = await request<{ lotteryItem: any }>(`/api/v1/lottery/getLotteryById/${id}`)
    res.lotteryItem.viewCount += 1 // ページが見られたので閲覧数をプラスする
    return { ...toImageUrl(res.lotteryItem), status: computeLotteryStatus(res.lotteryItem) }
  },

  // 検索 — 名前・説明・カテゴリでキーワードを探す
  async search(
    query: string,
    timeRange: '6m' | '1y' | '3y' = '6m',
  ): Promise<{ flashList: FlashItem[]; lotteryList: LotteryItem[] }> {
    const res = await request<{ flashList: any[]; lotteryList: any[] }>('/api/v1/search', {
      query,
      timeRange,
    })
    return {
      flashList: res.flashList.map((s) => ({ ...toImageUrl(s), status: computeFlashStatus(s) })),
      lotteryList: res.lotteryList.map((l) => ({ ...toImageUrl(l), status: computeLotteryStatus(l) })),
    }
  },

  // フラッシュ購入 — 在庫確認→注文投入
  async flashBuy(saleId: string): Promise<{ orderNo: string; status: 'QUEUED' | 'SOLD_OUT' }> {
    return requestPost('/api/v1/flash/buy', { saleId })
  },

  // 抽選応募
  async applyLottery(lotteryId: string): Promise<{ applicationId: string }> {
    return requestPost('/api/v1/lottery/apply', { lotteryId })
  },

  // マイページ — 注文・応募履歴を取得する
  async getMyFlashOrderList(): Promise<FlashOrderItem[]> {
    const res = await request<{ flashOrderList: FlashOrderItem[] }>('/api/v1/my/flashOrders')
    return res.flashOrderList
  },

  async getMyLotteryApplicationList(): Promise<LotteryOrderItem[]> {
    const res = await request<{ lotteryOrderList: LotteryOrderItem[] }>('/api/v1/my/lotteryApplications')
    return res.lotteryOrderList
  },

  // 支払いMock — バックエンドが 60%成功 / 40%失敗 を返す
  async processMockPayment(payload: MockPaymentPayload): Promise<MockPaymentResult> {
    return requestPost('/api/v1/payment/mock', payload)
  },

  // 管理画面用 — 新規フラッシュセール作成 API
  async createFlash(sale: Partial<FlashItem>): Promise<FlashItem> {
    const res = await requestPost<{ flashItem: FlashItem }>('/api/v1/admin/flash', sale)
    return res.flashItem
  },

  // 管理画面用 — 新規抽選作成 API
  async createLottery(lottery: Partial<LotteryItem>): Promise<LotteryItem> {
    const res = await requestPost<{ lotteryItem: LotteryItem }>('/api/v1/admin/lottery', lottery)
    return res.lotteryItem
  },

  // ログイン
  async login(email: string, password: string) {
    return requestPost<{ user: User; token: string }>('/api/v1/auth/login', { email, password })
  },

  // ログアウト
  async logout() {
    return requestPost('/api/v1/auth/logout')
  },

  // 新規登録
  async register(email: string, password: string, displayName: string) {
    return requestPost<{ message: string }>('/api/v1/auth/register', { email, password, displayName })
  },
}