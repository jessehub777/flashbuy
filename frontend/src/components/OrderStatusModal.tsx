// OrderStatusModal — shows flash buy result and order status
// State machine: QUEUING → QUEUED (orderNo) → (WAITING via Lambda) → PAID after payment
import { useEffect } from 'react'
import { useOrderStore } from '../stores/orderStore'

interface OrderStatusModalProps {
  saleId: string
  saleName: string
  price: number
  onClose: () => void
  onProceedPayment: (orderNo: string) => void
}

export default function OrderStatusModal({ saleName, price, onClose, onProceedPayment }: OrderStatusModalProps) {
  const { buyStatus, unpaidOrderNo, resetBuyStatus } = useOrderStore()

  // Auto-close on sold out after 3 seconds
  useEffect(() => {
    if (buyStatus === 'sold_out') {
      const t = setTimeout(() => {
        resetBuyStatus()
        onClose()
      }, 3000)
      return () => clearTimeout(t)
    }
  }, [buyStatus, onClose, resetBuyStatus])

  const handleClose = () => {
    resetBuyStatus()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop bg-black/70 animate-fade-in">
      <div className="bg-ink-soft border border-white/[0.12] rounded-[6px] w-full max-w-[420px] mx-4 overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.12]">
          <span className="font-oswald font-semibold text-[16px] tracking-[0.5px]">購入ステータス</span>
          <button
            onClick={handleClose}
            className="text-muted hover:text-paper transition-colors text-[20px] leading-none">
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Queuing */}
          {buyStatus === 'queuing' && (
            <div className="text-center py-8">
              <Spinner />
              <p className="font-mono text-[12px] text-muted tracking-[1px] mt-4">在庫を確認中...</p>
              <p className="text-[13px] text-muted mt-2">リクエストをキューに送信しています</p>
            </div>
          )}

          {/* Queued / Order confirmed */}
          {buyStatus === 'queued' && unpaidOrderNo && (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-flash/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-flash" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-[13px] text-muted mb-1">購入リクエスト受付済</p>
              <p className="font-mono text-[11px] text-muted mb-4">ORDER: {unpaidOrderNo}</p>
              <div className="bg-ink border border-white/[0.08] rounded-[4px] p-4 mb-5 text-left">
                <div className="text-[13px] text-muted mb-1">{saleName}</div>
                <div className="font-oswald text-[24px] font-semibold">¥{price.toLocaleString()}</div>
                <div className="font-mono text-[10px] text-muted mt-1 tracking-[1px]">
                  STATUS: UNPAID → お支払いをお待ちしています
                </div>
              </div>
              <button className="btn-base bg-flash" onClick={() => onProceedPayment(unpaidOrderNo)}>
                お支払いへ進む
              </button>
              <p className="font-mono text-[9.5px] text-muted mt-2 tracking-[0.5px]">
                15分以内にお支払いがない場合は自動キャンセルされます
              </p>
            </div>
          )}

          {/* Sold out */}
          {buyStatus === 'sold_out' && (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-full bg-white/[0.06] flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="text-paper font-semibold mb-2">売り切れました</p>
              <p className="text-[13px] text-muted">申し訳ありませんが、在庫がなくなりました。</p>
            </div>
          )}

          {/* Error */}
          {buyStatus === 'error' && (
            <div className="text-center py-8">
              <p className="text-flash font-semibold mb-2">エラーが発生しました</p>
              <p className="text-[13px] text-muted mb-4">しばらくしてから再度お試しください。</p>
              <button className="btn-base bg-flash" onClick={handleClose}>
                閉じる
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Spinner() {
  return <div className="w-10 h-10 border-2 border-white/[0.12] border-t-flash rounded-full animate-spin mx-auto" />
}
