// Order store — manages flash buy and lottery application state
import { create } from 'zustand'
import type { FlashOrderItem, LotteryOrderItem, FlashOrderStatus } from '../types'
import { api } from '../services/api'
import { ApiError } from '../services/request'

interface OrderState {
  // Flash orders
  orders: FlashOrderItem[]
  buyStatus: 'idle' | 'queuing' | 'queued' | 'sold_out' | 'error'
  // 購入直後の支払いに使う注文ID（購入成功時にセットされる）
  currentOrderId: string | null

  // Lottery applications
  applications: LotteryOrderItem[]
  applyStatus: 'idle' | 'applying' | 'applied' | 'error'
  appliedIds: Set<string>

  // Payment
  payStatus: 'idle' | 'processing' | 'success' | 'failed' | 'expired'

  // Actions
  flashBuy: (saleId: string) => Promise<void>
  applyLottery: (lotteryId: string) => Promise<void>
  payOrder: (orderId: string, orderType: 'flash' | 'lottery', amount: number, method: string) => Promise<boolean>
  fetchOrders: () => Promise<void>
  fetchApplications: () => Promise<void>
  resetBuyStatus: () => void
  resetApplyStatus: () => void
  resetPayStatus: () => void
  isApplied: (lotteryId: string) => boolean
}

export const useOrderStore = create<OrderState>((set, get) => ({
  orders: [],
  buyStatus: 'idle',
  currentOrderId: null,
  applications: [],
  applyStatus: 'idle',
  appliedIds: new Set<string>(),
  payStatus: 'idle',

  flashBuy: async (saleId) => {
    set({ buyStatus: 'queuing', currentOrderId: null })
    try {
      const result = await api.flashBuy(saleId)
      if (result.status === 'QUEUED') {
        // 支払い画面で使う注文IDを保存する
        set({ buyStatus: 'queued', currentOrderId: result.orderId })
      } else {
        set({ buyStatus: 'sold_out' })
      }
    } catch {
      set({ buyStatus: 'error' })
    }
  },

  applyLottery: async (lotteryId) => {
    set({ applyStatus: 'applying' })
    try {
      await api.applyLottery(lotteryId)
      set((s) => ({
        applyStatus: 'applied',
        appliedIds: new Set([...s.appliedIds, lotteryId]),
      }))
    } catch {
      set({ applyStatus: 'error' })
    }
  },

  payOrder: async (orderId, orderType, amount, method) => {
    set({ payStatus: 'processing' })
    try {
      const result = await api.processMockPayment({
        orderId,
        orderType,
        amount,
        method: method as 'credit_card',
      })
      if (result.success) {
        set((s) => ({
          payStatus: 'success',
          orders: s.orders.map((o) =>
            o.id === orderId ? { ...o, status: 'PAID' as FlashOrderStatus, paidAt: result.paidAt } : o,
          ),
          applications: s.applications.map((a) => (a.id === orderId ? { ...a, status: 'PAID' } : a)),
        }))
        return true
      } else {
        set({ payStatus: 'failed' })
        return false
      }
    } catch (e) {
      // 期限切れ（10003）またはパラメータエラー（400）は、注文が期限切れ・
      // キャンセル済みの可能性が高い。ランダムな決済失敗とは区別して表示する
      if (e instanceof ApiError && (e.code === 10003 || e.code === 400)) {
        set({ payStatus: 'expired' })
      } else {
        set({ payStatus: 'failed' })
      }
      return false
    }
  },

  fetchOrders: async () => {
    const orders = await api.getMyFlashOrderList()
    set({ orders })
  },

  fetchApplications: async () => {
    const applications = await api.getMyLotteryApplicationList()
    set({ applications })
  },

  resetBuyStatus: () => set({ buyStatus: 'idle', currentOrderId: null }),
  resetApplyStatus: () => set({ applyStatus: 'idle' }),
  resetPayStatus: () => set({ payStatus: 'idle' }),
  isApplied: (lotteryId) => get().appliedIds.has(lotteryId),
}))
