// マイページ — ユーザープロフィール・注文履歴・抽選応募履歴・モック決済管理
import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { useOrderStore } from '../../stores/orderStore'
import { useAuthStore } from '../../stores/authStore'
import PaymentMockModal from '../../components/PaymentMockModal'
import { useCountdown } from '../../hooks/useCountdown'
import dayjs from 'dayjs'
import type { FlashOrderStatus, LotteryOrderStatus } from '../../types'

export default function MyPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const defaultTab = searchParams.get('tab') === 'lottery' ? 'lottery' : 'orders'
  const [tab, setTab] = useState<'orders' | 'lottery'>(defaultTab)
  const [orderStatusFilter, setOrderStatusFilter] = useState<FlashOrderStatus | 'ALL'>('ALL')
  const [payingOrder, setPayingOrder] = useState<{
    id: string
    orderType: 'flash' | 'lottery'
    amount: number
  } | null>(null)

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
  // 表示中のタブに対応するデータのみを集計する（購入と抽選で混ざらないようにする）
  const stats = useMemo(() => {
    if (tab === 'orders') {
      const total = orders.length
      const unpaid = orders.filter((o) => o.status === 'UNPAID').length
      const paid = orders.filter((o) => o.status === 'PAID').length
      const cancelled = orders.filter((o) => o.status === 'CANCELLED').length
      return { total, unpaid, paid, cancelled }
    }
    // 抽選: 当選(未払い+支払済) / 抽選待ち / 落選
    const total = applications.length
    const won = applications.filter((a) => a.status === 'UNPAID' || a.status === 'PAID').length
    const waiting = applications.filter((a) => a.status === 'WAITING').length
    const lost = applications.filter((a) => a.status === 'LOST').length
    return { total, unpaid: won, paid: waiting, cancelled: lost }
  }, [orders, applications, tab])

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

      {/* 統計サマリーカード（表示中のタブに対応する内訳のみ表示する） */}
      <div className="grid grid-cols-4 gap-3 mb-8 max-sm:grid-cols-2">
        {(
          tab === 'orders' ?
            [
              { label: '購入合計', value: stats.total, tone: 'paper' },
              { label: '未払い', value: stats.unpaid, tone: 'warning' },
              { label: '支払済', value: stats.paid, tone: 'success' },
              { label: 'キャンセル', value: stats.cancelled, tone: 'muted' },
            ]
          : [
              { label: '応募合計', value: stats.total, tone: 'paper' },
              { label: '当選', value: stats.unpaid, tone: 'lottery' },
              { label: '抽選待ち', value: stats.paid, tone: 'warning' },
              { label: '落選', value: stats.cancelled, tone: 'muted' },
            ]
        ).map((c) => (
          <div key={c.label} className="bg-ink-soft border border-white/[0.08] p-3.5 rounded-[4px]">
            <div className={`font-mono text-[10px] tracking-[1px] mb-1 ${CARD_TONE[c.tone].label}`}>
              {c.label}
            </div>
            <div className={`font-oswald font-bold text-[22px] ${CARD_TONE[c.tone].value}`}>
              {c.value} <span className="text-[11px] font-normal text-muted">件</span>
            </div>
          </div>
        ))}
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
                  <div className="flex-1 min-w-0 flex items-center gap-3">
                    <Thumb url={order.imageUrl} name={order.saleName} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-paper truncate text-[15px]">{order.saleName}</div>
                      <div className="font-mono text-[11px] text-muted mt-1 tracking-[0.5px]">
                        注文日時: {dayjs(order.createdAt).format('YYYY/MM/DD HH:mm')}
                      </div>
                      {order.status === 'UNPAID' && order.expiresAt && (
                        <PaymentDeadline deadline={order.expiresAt} onExpired={fetchOrders} />
                      )}
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
                          onClick={() => setPayingOrder({ id: order.id, orderType: 'flash', amount: order.price })}>
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
                <div className="flex-1 min-w-0 flex items-center gap-3">
                  <Thumb url={app.imageUrl} name={app.lotteryName} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-paper truncate text-[15px]">{app.lotteryName}</div>
                    <div className="font-mono text-[11px] text-muted mt-1 tracking-[0.5px]">
                      応募日時: {dayjs(app.appliedAt).format('YYYY/MM/DD HH:mm')}
                    </div>
                    {app.status === 'UNPAID' && app.payDeadline && (
                      <PaymentDeadline deadline={app.payDeadline} onExpired={fetchApplications} />
                    )}
                  </div>
                </div>
                <div className="text-right flex-none">
                  {(app.status === 'UNPAID' || app.status === 'PAID') && (
                    <div className="font-oswald font-bold text-[18px] text-paper mb-1">
                      ¥{(app.chosenPrice ?? 0).toLocaleString()}
                      {app.price === 0 && (
                        <span className="text-[10px] font-normal text-muted ml-1">応募無料</span>
                      )}
                    </div>
                  )}
                  <div className="flex flex-col items-end gap-1">
                    <LotteryResultBadge status={app.status} />
                    {app.status === 'UNPAID' && (
                      <button
                        className="mt-1 px-3 py-1 bg-lottery text-paper font-mono text-[11px] tracking-[0.5px] rounded-[2px] hover:brightness-110 transition-all font-semibold"
                        onClick={() => setPayingOrder({ id: app.id, orderType: 'lottery', amount: app.chosenPrice ?? 0 })}>
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
          orderType={payingOrder.orderType}
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

// 商品の縮小サムネイル（画像が無い場合は商品名の先頭文字を表示）
function Thumb({ url, name }: { url?: string; name: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="w-12 h-12 rounded-[3px] object-cover flex-none border border-white/[0.1]"
      />
    )
  }
  return (
    <div className="w-12 h-12 rounded-[3px] flex-none border border-white/[0.1] bg-white/[0.04] flex items-center justify-center font-oswald font-bold text-paper/25 text-[16px]">
      {name.slice(0, 1)}
    </div>
  )
}

// 統計カードの色トーン（ラベル色 / 数値色）
const CARD_TONE: Record<string, { label: string; value: string }> = {
  paper: { label: 'text-muted', value: 'text-paper' },
  warning: { label: 'text-warning', value: 'text-warning' },
  success: { label: 'text-success', value: 'text-success' },
  lottery: { label: 'text-lottery', value: 'text-lottery' },
  muted: { label: 'text-muted', value: 'text-muted' },
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

// 支払期限までの残り時間を表示する（期限を過ぎたら自動キャンセルの警告を出す）
// 期限切れになったら onExpired を呼び、親で注文一覧を再取得させる。
// サーバーの期限切れ処理（order_expirer、30秒間隔）が走るまでの間は
// 5秒ごとに再取得を続ける。親側で注文が CANCELLED / PAID に変わると
// このコンポーネント自体がアンマウントされるため、自動で停止する
function PaymentDeadline({ deadline, onExpired }: { deadline: string; onExpired?: () => void }) {
  const { days, hours, minutes, seconds, isExpired } = useCountdown(deadline)
  const expiredNotified = useRef(false)

  // 期限切れになったら（初回表示時点で既に切れている場合も含め）即座に通知する
  useEffect(() => {
    if (isExpired && !expiredNotified.current) {
      expiredNotified.current = true
      onExpired?.()
    }
  }, [isExpired, onExpired])

  // 期限切れ後もサーバーのキャンセル反映まで5秒ごとに再取得を試みる
  useEffect(() => {
    if (!isExpired) return
    const timer = setInterval(() => onExpired?.(), 5000)
    return () => clearInterval(timer)
  }, [isExpired, onExpired])

  // 残り時間が少なくなったら赤く点滅させて注意を促す（5分未満）
  const urgent = !isExpired && Number(hours) === 0 && Number(minutes) < 5

  if (isExpired) {
    return (
      <div className="font-mono text-[11px] text-flash mt-1 tracking-[0.5px] font-semibold animate-pulse">
        ⚠ 支払期限切れ — 注文は自動キャンセルされます
      </div>
    )
  }

  const numDays = Number(days)
  const timeText =
    numDays > 0 ? `${numDays}日 ${hours}:${minutes}:${seconds}` : `${hours}:${minutes}:${seconds}`

  return (
    <div
      className={`font-mono text-[11px] mt-1 tracking-[0.5px] font-semibold ${
        urgent ? 'text-flash animate-pulse' : 'text-warning'
      }`}>
      支払期限まで {timeText}
    </div>
  )
}
