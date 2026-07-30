// Flash Sale detail page — product details, real-time stock, buy flow
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Countdown from '../../components/Countdown';
import StockDots from '../../components/StockDots';
import OrderStatusModal from '../../components/OrderStatusModal';
import PaymentMockModal from '../../components/PaymentMockModal';
import { api } from '../../services/api';
import { useOrderStore } from '../../stores/orderStore';
import { useAuthStore } from '../../stores/authStore';

export default function FlashSaleDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isLoggedIn } = useAuthStore();
  const { flashBuy, buyStatus, resetBuyStatus } = useOrderStore();

  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payOrderNo, setPayOrderNo] = useState('');

  const { data: sale, isLoading } = useQuery({
    queryKey: ['flashSale', id],
    queryFn: () => api.getFlashSaleById(id!),
    enabled: !!id,
    refetchInterval: 5000,
  });

  const handleBuy = async () => {
    if (!isLoggedIn()) {
      navigate('/login');
      return;
    }
    setShowOrderModal(true);
    await flashBuy(id!);
  };

  const handleProceedPayment = (orderNo: string) => {
    setPayOrderNo(orderNo);
    setShowOrderModal(false);
    setShowPaymentModal(true);
  };

  const handlePaySuccess = () => {
    setShowPaymentModal(false);
    setTimeout(() => navigate('/my'), 1000);
  };

  if (isLoading) return <LoadingSkeleton />;
  if (!sale) return <div className="p-10 text-muted">商品が見つかりません</div>;

  const isSoldOut = sale.stock <= 0;
  const stockRatio = sale.totalStock > 0 ? sale.stock / sale.totalStock : 0;
  const urgency = stockRatio < 0.1 ? 'critical' : stockRatio < 0.3 ? 'low' : 'normal';

  return (
    <div className="max-w-5xl mx-auto px-10 py-10 page-enter max-sm:px-5">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="font-mono text-[12px] text-muted hover:text-paper transition-colors mb-8 flex items-center gap-2 tracking-[1px]"
      >
        ← BACK
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        {/* Left: image */}
        <div>
          <div
            className="w-full aspect-square rounded-[6px] overflow-hidden relative"
            style={{ background: 'linear-gradient(135deg, #e4e1d5, #cfccc0)' }}
          >
            {/* Serial badge */}
            <div className="absolute top-4 left-4 font-mono text-[11px] tracking-[1px] bg-ink text-paper px-2 py-[3px] rounded-[2px] z-10">
              {sale.serialNo}
            </div>
            <div className="absolute top-4 right-4 font-mono text-[10px] tracking-[1.5px] font-semibold px-[9px] py-1 rounded-[2px] bg-flash text-paper z-10">
              {isSoldOut ? '売切' : 'SALE'}
            </div>
            {/* Placeholder */}
            <div className="w-full h-full flex items-center justify-center">
              <span className="font-oswald font-bold text-[80px] text-flash/20">
                {sale.name.slice(0, 2)}
              </span>
            </div>
          </div>

          {/* Stock progress bar */}
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
                ⚠ 残りわずかです
              </p>
            )}
          </div>
        </div>

        {/* Right: info + buy */}
        <div>
          <div className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase mb-2">
            {sale.category}
          </div>
          <h1 className="font-oswald font-semibold text-[32px] leading-[1.1] mb-3 text-paper">
            {sale.name}
          </h1>
          <div className="font-oswald font-bold text-[40px] text-paper mb-1">
            <span className="text-[20px] font-normal text-muted mr-1">¥</span>
            {sale.price.toLocaleString()}
          </div>
          <div className="font-mono text-[11px] text-muted mb-6 tracking-[0.5px]">
            税込価格
          </div>

          <p className="text-[14px] text-muted leading-[1.8] mb-8">{sale.description}</p>

          {/* Countdown */}
          <div className="bg-ink-soft border border-white/[0.08] rounded-[4px] p-4 mb-6">
            <div className="font-mono text-[10px] text-muted tracking-[1.5px] uppercase mb-3">
              販売終了まで
            </div>
            <Countdown targetDate={sale.endsAt} label="" showDays={false} />
          </div>

          <StockDots stock={sale.stock} totalStock={sale.totalStock} type="flash" className="mb-5" />

          <button
            className="btn-base bg-flash text-[15px] py-3 disabled:opacity-40"
            onClick={handleBuy}
            disabled={isSoldOut || buyStatus === 'queuing'}
          >
            {isSoldOut ? '売り切れ' : buyStatus === 'queuing' ? '処理中...' : '今すぐ購入'}
          </button>
          <p className="font-mono text-[10px] text-muted mt-2 text-center tracking-[0.5px]">
            一人につき1点まで / 在庫がなくなり次第終了
          </p>
        </div>
      </div>

      {/* Modals */}
      {showOrderModal && (
        <OrderStatusModal
          saleId={sale.id}
          saleName={sale.name}
          price={sale.price}
          onClose={() => { setShowOrderModal(false); resetBuyStatus(); }}
          onProceedPayment={handleProceedPayment}
        />
      )}

      {showPaymentModal && (
        <PaymentMockModal
          orderId={`ord-${Date.now()}`}
          orderNo={payOrderNo}
          amount={sale.price}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={handlePaySuccess}
        />
      )}
    </div>
  );
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
  );
}
