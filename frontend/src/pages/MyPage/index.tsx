// マイページ — ユーザープロフィール・注文履歴・抽選応募履歴・モック決済管理
import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { useOrderStore } from '../../stores/orderStore'
import { useAuthStore } from '../../stores/authStore'
import PaymentMockModal from '../../components/PaymentMockModal'
import dayjs from 'dayjs'
import type { FlashOrderStatus, LotteryOrderStatus } from '../../types'

export default function MyPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const defaultTab = searchParams.get('tab') === 'lottery' ? 'lottery' : 'orders'
  const [tab, setTab] = useState<'orders' | 'lottery'>(defaultTab)
  const [orderStatusFilter, setOrderStatusFilter] = useState<FlashOrderStatus | 'ALL'>('ALL')
  const [payingOrder, setPayingOrder] = useState<{ id: string; amount: number } | null>(null)

  const { user, isLoggedIn } = useAuthStore()
  const { orders, applications, fetchOrders, fetchApplications } = useOrderStore()

  // ログイン確認とデータ取得
  useEffect(() => {
    if (!isLoggedIn()) {
      navigate('/login', { state: { from: location } })
      return
    }
    fetchOrders()
    fetchApplications()
  }, [fetchApplications, fetchOrders, isLoggedIn, location, navigate])

  // 統計サマリーの計算
  const stats = useMemo(() => {
    const unpaidCount = orders.filter((o) => o.status === 'UNPAID').length
    const paidCount = orders.filter((o) => o.status === 'PAID').length
    const wonCount = applications.filter((a) => a.status === 'UNPAID').length
    return { unpaidCount, paidCount, wonCount }
  }, [orders, applications])

  // 注文ステータスで絞り込んだリスト
  const filteredOrders = useMemo(() => {
    if (orderStatusFilter === 'ALL') return orders
    return orders.filter((o) => o.status === orderStatusFilter)
  }, [orders, orderStatusFilter])

  if (!user) return null

  return (
    <div className="max-w-3xl mx-auto px-10 py-10 page-enter max-sm:px-5">
      {/* ユーザープロフィールヘッダー */}
      <div className="flex items-center gap-4 mb-6 p-4 bg-ink-soft border border-white/[0.08] rounded-[6px]">
        <div className="w-14 h-14 rounded-full bg-flash/20 flex items-center justify-center font-oswald font-bold text-[24px] text-flash border border-flash/30">
          {user.displayName.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <div className="font-semibold text-[18px] text-paper">{user.displayName}</div>
          <div className="font-mono text-[12px] text-muted tracking-[0.5px]">{user.email}</div>
        </div>
      </div>

      {/* 統計サマリーカード */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="bg-ink-soft border border-white/[0.08] p-3.5 rounded-[4px]">
          <div className="font-mono text-[10px] text-muted tracking-[1px] mb-1">購入合計</div>
          <div className="font-oswald font-bold text-[22px] text-paper">
            {orders.length} <span className="text-[11px] font-normal text-muted">件</span>
          </div>
        </div>
        <div className="bg-ink-soft border border-warning/20 p-3.5 rounded-[4px]">
          <div className="font-mono text-[10px] text-warning tracking-[1px] mb-1">未払い</div>
          <div className="font-oswald font-bold text-[22px] text-warning">
            {stats.unpaidCount} <span className="text-[11px] font-normal text-muted">件</span>
          </div>
        </div>
        <div className="bg-ink-soft border border-lottery/20 p-3.5 rounded-[4px]">
          <div className="font-mono text-[10px] text-lottery tracking-[1px] mb-1">抽選当選</div>
          <div className="font-oswald font-bold text-[22px] text-lottery">
            {stats.wonCount} <span className="text-[11px] font-normal text-muted">件</span>
          </div>
        </div>
      </div>

      {/* タブ切り替え（購入履歴 / 抽選応募） */}
      <div className="flex border-b border-white/[0.12] mb-6">
        {(['orders', 'lottery'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-3 font-oswald font-semibold text-[15px] tracking-[0.5px] transition-colors ${
              tab === t ? 'text-paper border-b-2 border-flash' : 'text-muted hover:text-paper'
            }`}>
            {t === 'orders' ? `購入履歴 (${orders.length})` : `抽選応募 (${applications.length})`}
          </button>
        ))}
      </div>

      {/* 購入履歴タブ */}
      {tab === 'orders' && (
        <div>
          {/* 注文ステータスフィルター */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            {[
              { key: 'ALL', label: 'すべて' },
              { key: 'UNPAID', label: '未払い' },
              { key: 'PAID', label: '支払済' },
              { key: 'CANCELLED', label: 'キャンセル' },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setOrderStatusFilter(f.key as FlashOrderStatus | 'ALL')}
                className={`px-3 py-1 rounded-[2px] font-mono text-[11px] whitespace-nowrap transition-colors ${
                  orderStatusFilter === f.key ?
                    'bg-white/20 text-paper font-semibold'
                  : 'bg-white/[0.04] text-muted hover:text-paper'
                }`}>
                {f.label}
              </button>
            ))}
          </div>

          {/* 注文リスト */}
          <div className="flex flex-col gap-3">
            {filteredOrders.length === 0 ?
              <EmptyState message="該当する購入履歴はありません" />
            : filteredOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-ink-soft border border-white/[0.08] rounded-[4px] p-5 flex items-center justify-between gap-4 hover:border-white/20 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-paper truncate text-[15px]">{order.saleName}</div>
                    <div className="font-mono text-[11px] text-muted mt-1 tracking-[0.5px]">
                      注文日時: {dayjs(order.createdAt).format('YYYY/MM/DD HH:mm')}
                    </div>
                  </div>
                  <div className="text-right flex-none">
                    <div className="font-oswald font-bold text-[20px] text-paper mb-1">
                      ¥{order.price.toLocaleString()}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge status={order.status} />
                      {order.status === 'UNPAID' && (
                        <button
                          className="mt-1 px-3 py-1 bg-flash text-paper font-mono text-[11px] tracking-[0.5px] rounded-[2px] hover:brightness-110 transition-all font-semibold"
                          onClick={() => setPayingOrder({ id: order.id, amount: order.price })}>
                          支払う →
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* 抽選応募履歴タブ */}
      {tab === 'lottery' && (
        <div className="flex flex-col gap-3">
          {applications.length === 0 ?
            <EmptyState message="応募履歴はありません" />
          : applications.map((app) => (
              <div
                key={app.id}
                className="bg-ink-soft border border-white/[0.08] rounded-[4px] p-5 flex items-center justify-between gap-4 hover:border-white/20 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-paper truncate text-[15px]">{app.lotteryName}</div>
                  <div className="font-mono text-[11px] text-muted mt-1 tracking-[0.5px]">
                    応募日時: {dayjs(app.appliedAt).format('YYYY/MM/DD HH:mm')}
                  </div>
                  {app.status === 'UNPAID' && app.payDeadline && (
                    <div className="font-mono text-[11px] text-flash mt-1 tracking-[0.5px] font-semibold">
                      支払期限: {dayjs(app.payDeadline).format('MM/DD HH:mm')} まで
                    </div>
                  )}
                </div>
                <div className="text-right flex-none">
                  {(app.status === 'UNPAID' || app.status === 'PAID') && (
                    <div className="font-oswald font-bold text-[18px] text-paper mb-1">
                      ¥{(app.price ?? 9800).toLocaleString()}
                    </div>
                  )}
                  <div className="flex flex-col items-end gap-1">
                    <LotteryResultBadge status={app.status} />
                    {app.status === 'UNPAID' && (
                      <button
                        className="mt-1 px-3 py-1 bg-lottery text-paper font-mono text-[11px] tracking-[0.5px] rounded-[2px] hover:brightness-110 transition-all font-semibold"
                        onClick={() => setPayingOrder({ id: app.id, amount: app.price ?? 9800 })}>
                        支払う →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* 支払いモーダル（モック決済状態機械） */}
      {payingOrder && (
        <PaymentMockModal
          orderId={payingOrder.id}
          amount={payingOrder.amount}
          onClose={() => setPayingOrder(null)}
          onSuccess={() => {
            setPayingOrder(null)
            fetchOrders()
            fetchApplications()
          }}
        />
      )}
    </div>
  )
}

// 注文ステータスバッジ
function StatusBadge({ status }: { status: FlashOrderStatus }) {
  const config = {
    UNPAID: { label: '未払い', cls: 'text-warning border-warning/30 bg-warning/10' },
    PAID: { label: '支払済', cls: 'text-success border-success/30 bg-success/10' },
    CANCELLED: { label: 'キャンセル', cls: 'text-muted border-white/10 bg-white/5' },
  }
  const { label, cls } = config[status] ?? { label: status, cls: 'text-muted border-white/10 bg-white/5' }
  return (
    <span className={`font-mono text-[10px] tracking-[1px] px-2 py-[3px] rounded-[2px] border ${cls}`}>{label}</span>
  )
}

// 抽選結果バッジ
function LotteryResultBadge({ status }: { status: LotteryOrderStatus }) {
  const config: Record<LotteryOrderStatus, { label: string; cls: string }> = {
    WAITING: { label: '抽選待ち', cls: 'text-muted border-white/10 bg-white/5' },
    UNPAID: { label: '当選 (未払い) 🎉', cls: 'text-lottery border-lottery/30 bg-lottery/10 font-bold' },
    PAID: { label: '当選 (支払済) 🎉', cls: 'text-success border-success/30 bg-success/10 font-bold' },
    LOST: { label: '落選', cls: 'text-muted border-white/10 bg-white/5' },
    CANCELLED: { label: 'キャンセル', cls: 'text-muted border-white/10 bg-white/5' },
  }
  const { label, cls } = config[status] ?? { label: status, cls: 'text-muted border-white/10 bg-white/5' }
  return (
    <span className={`font-mono text-[10px] tracking-[1px] px-2.5 py-[3px] rounded-[2px] border ${cls}`}>{label}</span>
  )
}

function EmptyState({ message }: { message: string }) {
  return <div className="py-16 text-center font-mono text-[13px] text-muted tracking-[0.5px]">{message}</div>
}
