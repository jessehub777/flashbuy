// PaymentMockModal — mock payment flow
// Demonstrates understanding of payment state machine: WAITING → PAID / TIMEOUT
// NOT connected to any real payment API (portfolio demo only)
import { useState } from 'react'
import { useOrderStore } from '../stores/orderStore'
import type { PaymentMethod } from '../types'

interface PaymentMockModalProps {
  orderId: string
  orderType: 'flash' | 'lottery'
  amount: number
  onClose: () => void
  onSuccess: () => void
}

const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: string }[] = [
  { id: 'credit_card', label: 'クレジットカード', icon: '💳' },
  { id: 'convenience', label: 'コンビニ払い', icon: '🏪' },
  { id: 'bank_transfer', label: '銀行振込', icon: '🏦' },
]

export default function PaymentMockModal({ orderId, orderType, amount, onClose, onSuccess }: PaymentMockModalProps) {
  const { payOrder, payStatus, resetPayStatus } = useOrderStore()
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('credit_card')

  const handlePay = async () => {
    const ok = await payOrder(orderId, orderType, amount, selectedMethod)
    if (ok) {
      setTimeout(() => {
        resetPayStatus()
        onSuccess()
      }, 1500)
    }
  }

  const handleClose = () => {
    resetPayStatus()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop bg-black/70 animate-fade-in">
      <div className="bg-ink-soft border border-white/[0.12] rounded-[6px] w-full max-w-[460px] mx-4 overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.12]">
          <div>
            <span className="font-oswald font-semibold text-[16px] tracking-[0.5px]">お支払い</span>
            <span className="ml-3 font-mono text-[10px] text-muted tracking-[1px]">
              [MOCK — 実際の課金は発生しません]
            </span>
          </div>
          {payStatus === 'idle' && (
            <button onClick={handleClose} className="text-muted hover:text-paper text-[20px]">
              ×
            </button>
          )}
        </div>

        <div className="p-6">
          {/* Order summary */}
          <div className="bg-ink border border-white/[0.08] rounded-[4px] p-4 mb-5">
            <div className="flex justify-between items-center">
              <div>
                <div className="font-mono text-[10px] text-muted tracking-[1px]">STATUS: UNPAID</div>
              </div>
              <div className="font-oswald font-bold text-[28px] text-flash">¥{amount.toLocaleString()}</div>
            </div>
          </div>

          {/* Payment method selector */}
          {payStatus === 'idle' && (
            <>
              <p className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase mb-3">お支払い方法</p>
              <div className="flex flex-col gap-2 mb-6">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMethod(m.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-[4px] border text-left transition-colors ${
                      selectedMethod === m.id ?
                        'border-flash bg-flash/10 text-paper'
                      : 'border-white/[0.12] text-muted hover:border-white/25'
                    }`}>
                    <span className="text-[18px]">{m.icon}</span>
                    <span className="text-[14px]">{m.label}</span>
                    {selectedMethod === m.id && (
                      <svg className="ml-auto w-4 h-4 text-flash" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>
                ))}
              </div>

              {/* Credit card mock form */}
              {selectedMethod === 'credit_card' && (
                <div className="mb-5 flex flex-col gap-3">
                  <input
                    className="input-dark"
                    placeholder="カード番号 **** **** **** ****"
                    defaultValue="4242 4242 4242 4242"
                    readOnly
                  />
                  <div className="flex gap-3">
                    <input className="input-dark" placeholder="MM/YY" defaultValue="12/28" readOnly />
                    <input className="input-dark" placeholder="CVV" defaultValue="123" readOnly />
                  </div>
                  <p className="font-mono text-[9.5px] text-muted tracking-[0.5px]">
                    ※ デモ用ダミーデータ。実際のカード情報は入力しないでください。
                  </p>
                </div>
              )}

              <button className="btn-base bg-flash" onClick={handlePay}>
                ¥{amount.toLocaleString()} を支払う
              </button>
              <p className="font-mono text-[9.5px] text-muted mt-2 text-center tracking-[0.5px]">
                このデモでは実際の課金は発生しません
              </p>
            </>
          )}

          {/* Processing */}
          {payStatus === 'processing' && (
            <div className="text-center py-8">
              <div className="w-10 h-10 border-2 border-white/[0.12] border-t-flash rounded-full animate-spin mx-auto mb-4" />
              <p className="font-mono text-[12px] text-muted tracking-[1px]">決済処理中...</p>
              <p className="font-mono text-[10px] text-muted mt-1 tracking-[0.5px]">STATUS: WAITING → PROCESSING</p>
            </div>
          )}

          {/* Success */}
          {payStatus === 'success' && (
            <div className="text-center py-6">
              <div className="w-12 h-12 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-paper font-semibold mb-1">お支払い完了！</p>
              <p className="font-mono text-[10px] text-muted tracking-[1px]">STATUS: PAID ✓</p>
            </div>
          )}

          {/* Failed */}
          {payStatus === 'failed' && (
            <div className="text-center py-6">
              <p className="text-flash font-semibold mb-2">決済に失敗しました</p>
              <p className="text-[13px] text-muted mb-4">再度お試しください。</p>
              <button className="btn-base bg-flash" onClick={() => resetPayStatus()}>
                再試行
              </button>
            </div>
          )}

          {/* Expired — 支払期限が過ぎた・注文がキャンセル済みのケース */}
          {payStatus === 'expired' && (
            <div className="text-center py-6">
              <p className="text-flash font-semibold mb-2">支払期限が過ぎています</p>
              <p className="text-[13px] text-muted mb-4">
                この注文は自動キャンセルされました。<br />
                再度購入してください。
              </p>
              <button className="btn-base bg-flash" onClick={() => resetPayStatus()}>
                閉じる
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
