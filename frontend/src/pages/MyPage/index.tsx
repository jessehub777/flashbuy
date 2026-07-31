// MyPage — order history and lottery application results
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useOrderStore } from '../../stores/orderStore';
import { useAuthStore } from '../../stores/authStore';
import PaymentMockModal from '../../components/PaymentMockModal';
import dayjs from 'dayjs';
import type { OrderStatus } from '../../types';

export default function MyPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') === 'lottery' ? 'lottery' : 'orders';
  const [tab, setTab] = useState<'orders' | 'lottery'>(defaultTab);
  const [payingOrder, setPayingOrder] = useState<{ id: string; no: string; amount: number } | null>(null);

  const { user, isLoggedIn } = useAuthStore();
  const { orders, applications, fetchOrders, fetchApplications } = useOrderStore();

  useEffect(() => {
    if (!isLoggedIn()) { navigate('/login'); return; }
    fetchOrders();
    fetchApplications();
  }, []);

  if (!user) return null;

  return (
    <div className="max-w-3xl mx-auto px-10 py-10 page-enter max-sm:px-5">
      {/* Profile */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-full bg-flash/20 flex items-center justify-center font-oswald font-bold text-[20px] text-flash">
          {user.displayName.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <div className="font-semibold text-paper">{user.displayName}</div>
          <div className="font-mono text-[11px] text-muted tracking-[0.5px]">{user.email}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/[0.12] mb-8">
        {(['orders', 'lottery'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-3 font-oswald font-semibold text-[14px] tracking-[0.5px] transition-colors ${
              tab === t
                ? 'text-paper border-b-2 border-flash'
                : 'text-muted hover:text-paper'
            }`}
          >
            {t === 'orders' ? '購入履歴' : '抽選応募'}
          </button>
        ))}
      </div>

      {/* Orders tab */}
      {tab === 'orders' && (
        <div className="flex flex-col gap-3">
          {orders.length === 0 ? (
            <EmptyState message="購入履歴はありません" />
          ) : (
            orders.map((order) => (
              <div
                key={order.id}
                className="bg-ink-soft border border-white/[0.08] rounded-[4px] p-5 flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[10px] text-muted tracking-[1px] mb-1">
                    {order.orderNo}
                  </div>
                  <div className="font-semibold text-paper truncate">{order.saleName}</div>
                  <div className="font-mono text-[11px] text-muted mt-1 tracking-[0.5px]">
                    {dayjs(order.createdAt).format('YYYY/MM/DD HH:mm')}
                  </div>
                </div>
                <div className="text-right flex-none">
                  <div className="font-oswald font-bold text-[20px] text-paper mb-1">
                    ¥{order.price.toLocaleString()}
                  </div>
                  <StatusBadge status={order.status} />
                  {order.status === 'PENDING' && (
                    <button
                      className="mt-2 font-mono text-[10px] tracking-[1px] text-flash underline hover:no-underline"
                      onClick={() => setPayingOrder({ id: order.id, no: order.orderNo, amount: order.price })}
                    >
                      支払う →
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Lottery tab */}
      {tab === 'lottery' && (
        <div className="flex flex-col gap-3">
          {applications.length === 0 ? (
            <EmptyState message="応募履歴はありません" />
          ) : (
            applications.map((app) => (
              <div
                key={app.id}
                className="bg-ink-soft border border-white/[0.08] rounded-[4px] p-5 flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-paper truncate">{app.lotteryName}</div>
                  <div className="font-mono text-[11px] text-muted mt-1 tracking-[0.5px]">
                    応募日: {dayjs(app.appliedAt).format('YYYY/MM/DD')}
                  </div>
                  {app.result === 'WON' && app.payDeadline && (
                    <div className="font-mono text-[10px] text-flash mt-1 tracking-[0.5px]">
                      支払期限: {dayjs(app.payDeadline).format('MM/DD HH:mm')}
                    </div>
                  )}
                </div>
                <div className="text-right flex-none">
                  <LotteryResultBadge result={app.result} />
                  {app.result === 'WON' && app.payStatus === 'UNPAID' && (
                    <div className="font-mono text-[10px] text-flash mt-1 animate-pulse">
                      要支払い
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Payment modal */}
      {payingOrder && (
        <PaymentMockModal
          orderId={payingOrder.id}
          orderNo={payingOrder.no}
          amount={payingOrder.amount}
          onClose={() => setPayingOrder(null)}
          onSuccess={() => { setPayingOrder(null); fetchOrders(); }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const config = {
    PENDING:   { label: '未払い',   cls: 'text-warning border-warning/30 bg-warning/10' },
    PAID:      { label: '支払済',   cls: 'text-success border-success/30 bg-success/10' },
    CANCELLED: { label: 'キャンセル', cls: 'text-muted border-white/10 bg-white/5' },
    TIMEOUT:   { label: 'タイムアウト', cls: 'text-muted border-white/10 bg-white/5' },
  };
  const { label, cls } = config[status];
  return (
    <span className={`font-mono text-[10px] tracking-[1px] px-2 py-[3px] rounded-[2px] border ${cls}`}>
      {label}
    </span>
  );
}

function LotteryResultBadge({ result }: { result: 'PENDING' | 'WON' | 'LOST' }) {
  const config = {
    PENDING: { label: '抽選待ち', cls: 'text-muted border-white/10 bg-white/5' },
    WON:     { label: '当選 🎉', cls: 'text-lottery border-lottery/30 bg-lottery/10' },
    LOST:    { label: '落選',    cls: 'text-muted border-white/10 bg-white/5' },
  };
  const { label, cls } = config[result];
  return (
    <span className={`font-mono text-[10px] tracking-[1px] px-2 py-[3px] rounded-[2px] border ${cls}`}>
      {label}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-16 text-center font-mono text-[13px] text-muted tracking-[0.5px]">
      {message}
    </div>
  );
}
