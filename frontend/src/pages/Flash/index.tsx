import { useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import Countdown from '../../components/Countdown'
import StockDots from '../../components/StockDots'
import OrderStatusModal from '../../components/OrderStatusModal'
import PaymentMockModal from '../../components/PaymentMockModal'
import { api } from '../../services/api'
import { useOrderStore } from '../../stores/orderStore'
import { useAuthStore } from '../../stores/authStore'
import { useCountdown } from '../../hooks/useCountdown'

export default function FlashDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { isLoggedIn } = useAuthStore()
  const { flashBuy, buyStatus, resetBuyStatus } = useOrderStore()

  const [showOrderModal, setShowOrderModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)

  // IDでセール情報を取得する（同時に閲覧数が1増やされる）
  const { data: sale, isLoading } = useQuery({
    queryKey: ['flash', id],
    queryFn: () => api.getFlashById(id!),
    enabled: !!id,
  })

  const { isExpired } = useCountdown(sale?.endsAt ?? '')

  const handleBuy = async () => {
    if (!isLoggedIn()) {
      // ログインしていない場合はログイン画面に移動する
      navigate('/login', { state: { from: location } })
      return
    }
    setShowOrderModal(true)
    await flashBuy(id!)
    // 在庫はサーバー側で減っているため、詳細データを再取得して表示を更新する
    // （成功・売切・失敗のいずれの場合も最新の在庫を反映する）
    queryClient.invalidateQueries({ queryKey: ['flash', id] })
  }

  const handleProceedPayment = () => {
    setShowOrderModal(false)
    setShowPaymentModal(true)
  }

  const handlePaySuccess = () => {
    setShowPaymentModal(false)
    setTimeout(() => navigate('/my'), 1000)
  }

  if (isLoading) return <LoadingSkeleton />
  if (!sale) return <div className="p-10 text-muted font-mono">指定された商品が見つかりません</div>

  const isSoldOut = sale.stock <= 0
  const isEnded = sale.status === 'ENDED' || isExpired || dayjs().isAfter(dayjs(sale.endsAt))
  const isUpcoming = sale.status === 'UPCOMING' || dayjs().isBefore(dayjs(sale.startsAt))
  const stockRatio = sale.totalStock > 0 ? sale.stock / sale.totalStock : 0
  const urgency =
    stockRatio < 0.1 ? 'critical'
    : stockRatio < 0.3 ? 'low'
    : 'normal'

  return (
    <div className="max-w-5xl mx-auto px-10 py-10 page-enter max-sm:px-5">
      {/* 戻るボタン */}
      <button
        onClick={() => navigate(-1)}
        className="font-mono text-[12px] text-muted hover:text-paper transition-colors mb-8 flex items-center gap-2 tracking-[1px]">
        ← 戻る
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        {/* 左側：商品画像と在庫メーター */}
        <div>
          <div
            className="w-full aspect-square rounded-[6px] overflow-hidden relative shadow-xl"
            style={{ background: 'linear-gradient(135deg, #e4e1d5, #cfccc0)' }}>
            {/* ステータスタグ（売切 / 販売終了 / 予告 / SALE） */}
            <div
              className={`absolute top-4 right-4 font-mono text-[10px] tracking-[1.5px] font-semibold px-[9px] py-1 rounded-[2px] z-10 ${
                isSoldOut || isEnded ? 'bg-black/75 text-white/60 border border-white/20'
                : isUpcoming ? 'bg-lottery text-paper'
                : 'bg-flash text-paper'
              }`}>
              {isSoldOut ?
                '売切'
              : isEnded ?
                '販売終了'
              : isUpcoming ?
                '予告'
              : 'SALE'}
            </div>
            {/* 閲覧数バッジ */}
            <div className="absolute bottom-4 left-4 font-mono text-[11px] tracking-[0.5px] bg-black/60 text-white/90 px-2.5 py-1 rounded-[2px] backdrop-blur-sm z-10 flex items-center gap-1.5">
              <span>🔥</span> {sale.viewCount.toLocaleString()} 回閲覧されています
            </div>
            {/* プレースホルダー表示 */}
            <div className="w-full h-full flex items-center justify-center">
              <span className="font-oswald font-bold text-[80px] text-flash/20">{sale.name.slice(0, 2)}</span>
            </div>
          </div>

          {/* 在庫残量プログレスバー */}
          <div className="mt-4">
            <div className="flex justify-between font-mono text-[11px] text-muted mb-2">
              <span>在庫残量</span>
              <span className={urgency === 'critical' ? 'text-flash animate-pulse' : ''}>
                残り {sale.stock.toLocaleString()} / {sale.totalStock.toLocaleString()}
              </span>
            </div>
            <div className="h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
              <div
                className="h-full bg-flash rounded-full transition-all duration-1000"
                style={{ width: `${stockRatio * 100}%` }}
              />
            </div>
            {urgency === 'critical' && (
              <p className="font-mono text-[11px] text-flash mt-2 tracking-[0.5px] animate-pulse">
                ⚠ 残りわずかです！お早めにご購入ください
              </p>
            )}
          </div>
        </div>

        {/* 右側：商品情報と購入ボタン */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase">{sale.category}</span>
          </div>
          <h1 className="font-oswald font-semibold text-[32px] leading-[1.1] mb-3 text-paper">{sale.name}</h1>
          <div className="font-oswald font-bold text-[40px] text-paper mb-1">
            <span className="text-[20px] font-normal text-muted mr-1">¥</span>
            {sale.price.toLocaleString()}
          </div>
          <div className="font-mono text-[11px] text-muted mb-6 tracking-[0.5px]">税込価格（送料無料）</div>

          <p className="text-[14px] text-muted leading-[1.8] mb-8">{sale.description}</p>

          {/* Countdown */}
          <div className="bg-ink-soft border border-white/[0.08] rounded-[4px] p-4 mb-6">
            <div className="font-mono text-[10px] text-muted tracking-[1.5px] uppercase mb-3">販売終了まで</div>
            <Countdown targetDate={sale.endsAt} label="" showDays={false} />
          </div>

          <StockDots stock={sale.stock} totalStock={sale.totalStock} type="flash" className="mb-5" />

          {/* 購入ボタン（売り切れ / 販売終了 / 予告 / 購入手続き） */}
          <button
            className={`btn-base text-[15px] py-3 transition-all ${
              isSoldOut || isEnded || isUpcoming || buyStatus === 'queuing' ?
                'opacity-40 cursor-not-allowed bg-white/10 text-paper/50'
              : 'bg-flash text-paper hover:brightness-110'
            }`}
            onClick={handleBuy}
            disabled={isSoldOut || isEnded || isUpcoming || buyStatus === 'queuing'}>
            {isSoldOut ?
              '売り切れ'
            : isEnded ?
              '販売終了'
            : isUpcoming ?
              '販売開始前'
            : buyStatus === 'queuing' ?
              '処理中...'
            : '今すぐ購入'}
          </button>
          <p className="font-mono text-[10px] text-muted mt-2 text-center tracking-[0.5px]">
            一人につき1点まで / 在庫がなくなり次第終了
          </p>
        </div>
      </div>

      {/* S3静的拡張データ：商品スペック・購入規約 (シングルSKU汎用設計) */}
      {(sale.specifications?.length || sale.rules?.length) && (
        <div className="mt-12 pt-8 border-t border-white/[0.1] animate-fade-in">
          <h2 className="font-oswald font-semibold text-[20px] text-paper mb-6 tracking-[0.5px] flex items-center gap-2">
            <span className="w-1.5 h-4 bg-flash rounded-full inline-block" />
            商品仕様・注意事項（S3 Payload）
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-ink-soft border border-white/[0.08] rounded-[6px] p-6">
            {/* 仕様 Key-Value */}
            {sale.specifications && sale.specifications.length > 0 && (
              <div className="space-y-4 font-mono text-[12px]">
                {sale.specifications.map((spec, idx) => (
                  <div key={idx}>
                    <span className="text-muted tracking-[1px] block text-[10px] uppercase mb-1">{spec.label}</span>
                    <span className="text-paper font-medium">{spec.value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 注意事項・規約リスト */}
            {sale.rules && sale.rules.length > 0 && (
              <div className="border-l border-white/[0.08] pl-6 max-md:border-l-0 max-md:pl-0 max-md:pt-4 max-md:border-t">
                <span className="font-mono text-[10px] text-muted tracking-[1px] uppercase block mb-2">
                  注意事項・購入規約
                </span>
                <ul className="space-y-2 text-[12.5px] text-paper/80 leading-[1.6] list-disc list-inside">
                  {sale.rules.map((rule, idx) => (
                    <li key={idx}>{rule}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showOrderModal && (
        <OrderStatusModal
          saleId={sale.id}
          saleName={sale.name}
          price={sale.price}
          onClose={() => {
            setShowOrderModal(false)
            resetBuyStatus()
          }}
          onProceedPayment={handleProceedPayment}
        />
      )}

      {showPaymentModal && (
        <PaymentMockModal
          orderId={`ord-${Date.now()}`}
          amount={sale.price}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={handlePaySuccess}
        />
      )}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="max-w-5xl mx-auto px-10 py-10 animate-pulse">
      <div className="h-4 bg-white/[0.06] rounded w-16 mb-8" />
      <div className="grid grid-cols-2 gap-12">
        <div className="aspect-square bg-white/[0.04] rounded-[6px]" />
        <div>
          <div className="h-3 bg-white/[0.06] rounded w-20 mb-4" />
          <div className="h-8 bg-white/[0.06] rounded w-3/4 mb-3" />
          <div className="h-10 bg-white/[0.06] rounded w-1/2 mb-6" />
          <div className="h-4 bg-white/[0.06] rounded mb-2" />
          <div className="h-4 bg-white/[0.06] rounded mb-2 w-5/6" />
          <div className="h-4 bg-white/[0.06] rounded w-4/6" />
        </div>
      </div>
    </div>
  )
}
