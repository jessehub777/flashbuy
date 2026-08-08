// Order store — manages flash buy and lottery application state
import { create } from 'zustand'
import type { FlashOrderItem, LotteryOrderItem, FlashOrderStatus } from '../types'
import { api } from '../services/api'

interface OrderState {
  // Flash orders
  orders: FlashOrderItem[]
  unpaidOrderNo: string | null
  buyStatus: 'idle' | 'queuing' | 'queued' | 'sold_out' | 'error'

  // Lottery applications
  applications: LotteryOrderItem[]
  applyStatus: 'idle' | 'applying' | 'applied' | 'error'
  appliedIds: Set<string>

  // Payment
  payStatus: 'idle' | 'processing' | 'success' | 'failed'

  // Actions
  flashBuy: (saleId: string) => Promise<void>
  applyLottery: (lotteryId: string) => Promise<void>
  payOrder: (orderId: string, amount: number, method: string) => Promise<boolean>
  fetchOrders: () => Promise<void>
  fetchApplications: () => Promise<void>
  resetBuyStatus: () => void
  resetApplyStatus: () => void
  resetPayStatus: () => void
  isApplied: (lotteryId: string) => boolean
}

export const useOrderStore = create<OrderState>((set, get) => ({
  orders: [],
  unpaidOrderNo: null,
  buyStatus: 'idle',
  applications: [],
  applyStatus: 'idle',
  appliedIds: new Set<string>(),
  payStatus: 'idle',

  flashBuy: async (saleId) => {
    set({ buyStatus: 'queuing', unpaidOrderNo: null })
    try {
      const result = await api.flashBuy(saleId)
      if (result.status === 'QUEUED') {
        set({ buyStatus: 'queued', unpaidOrderNo: result.orderNo })
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

  payOrder: async (orderId, amount, method) => {
    set({ payStatus: 'processing' })
    try {
      const result = await api.processMockPayment({
        orderId,
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
    } catch {
      set({ payStatus: 'failed' })
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

  resetBuyStatus: () => set({ buyStatus: 'idle', unpaidOrderNo: null }),
  resetApplyStatus: () => set({ applyStatus: 'idle' }),
  resetPayStatus: () => set({ payStatus: 'idle' }),
  isApplied: (lotteryId) => get().appliedIds.has(lotteryId),
}))
