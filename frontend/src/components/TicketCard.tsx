// TicketCard — ticket-shaped card for flash sales and lottery items
// Matches the design mockup with punch hole, tear edge, and serial number
import { Link } from 'react-router-dom';
import StockDots from './StockDots';
import type { FlashSaleItem, LotteryItem } from '../types';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ja';

dayjs.extend(relativeTime);
dayjs.locale('ja');

// ===== Flash Sale Ticket =====
interface FlashTicketProps {
  sale: FlashSaleItem;
}

export function FlashTicket({ sale }: FlashTicketProps) {
  const isSoldOut = sale.stock <= 0;

  return (
    <Link
      to={`/flash/${sale.id}`}
      className="no-underline flex-none w-[280px] bg-paper text-ink rounded-[6px] relative overflow-hidden block hover:scale-[1.02] transition-transform duration-200"
      style={{ borderTop: '4px solid #FF4128' }}
    >
      {/* Image area */}
      <div className="h-[160px] bg-gradient-to-br from-[#e4e1d5] to-[#cfccc0] relative overflow-hidden">
        {sale.imageUrl && !sale.imageUrl.startsWith('/') ? (
          <img src={sale.imageUrl} alt={sale.name} className="w-full h-full object-cover" />
        ) : (
          <ProductPlaceholder name={sale.name} type="flash" />
        )}
        {/* Serial */}
        <div className="absolute top-3 left-3 font-mono text-[11px] tracking-[1px] bg-ink text-paper px-2 py-[3px] rounded-[2px]">
          {sale.serialNo}
        </div>
        {/* Tag */}
        <div className="absolute top-3 right-3 font-mono text-[10px] tracking-[1.5px] font-semibold px-[9px] py-1 rounded-[2px] bg-flash text-paper">
          {isSoldOut ? '売切' : 'SALE'}
        </div>
        {/* Punch hole accent */}
        <div className="absolute right-4 bottom-[-8px] w-4 h-4 bg-ink rounded-full z-10" />
      </div>

      {/* Tear edge */}
      <div className="tear-edge" />

      {/* Body */}
      <div className="px-[18px] pt-4 pb-5">
        <div className="text-[15px] font-bold leading-[1.3] mb-1 text-ink">{sale.name}</div>
        <div className="font-oswald font-semibold text-[21px] my-2 text-ink">
          <span className="text-[13px] font-normal text-muted mr-[2px]">¥</span>
          {sale.price.toLocaleString()}
        </div>
        <StockDots
          stock={sale.stock}
          totalStock={sale.totalStock}
          type="flash"
          className="mb-[14px]"
        />
        <button
          className="btn-base bg-flash"
          disabled={isSoldOut}
          onClick={(e) => { e.preventDefault(); }}
        >
          {isSoldOut ? '売り切れ' : '今すぐ購入'}
        </button>
        <div className="text-center font-mono text-[9.5px] text-muted mt-[6px] tracking-[0.5px]">
          在庫がなくなり次第終了
        </div>
      </div>
    </Link>
  );
}

// ===== Lottery Ticket =====
interface LotteryTicketProps {
  item: LotteryItem;
  applied?: boolean;
}

export function LotteryTicket({ item, applied = false }: LotteryTicketProps) {
  const deadline = dayjs(item.applyDeadline);
  const now = dayjs();
  const diffHours = deadline.diff(now, 'hour');
  const deadlineLabel =
    diffHours < 24
      ? `あと${diffHours}時間`
      : `あと${deadline.diff(now, 'day')}日${deadline.diff(now, 'hour') % 24}時間`;

  return (
    <Link
      to={`/lottery/${item.id}`}
      className="no-underline flex-none w-[280px] bg-paper text-ink rounded-[6px] relative overflow-hidden block hover:scale-[1.02] transition-transform duration-200"
      style={{ borderTop: '4px solid #3B6FE0' }}
    >
      {/* Image area */}
      <div className="h-[160px] bg-gradient-to-br from-[#dce4f5] to-[#c5d3ee] relative overflow-hidden">
        {item.imageUrl && !item.imageUrl.startsWith('/') ? (
          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <ProductPlaceholder name={item.name} type="lottery" />
        )}
        {/* Serial */}
        <div className="absolute top-3 left-3 font-mono text-[11px] tracking-[1px] bg-ink text-paper px-2 py-[3px] rounded-[2px]">
          {item.serialNo}
        </div>
        {/* Tag */}
        <div className="absolute top-3 right-3 font-mono text-[10px] tracking-[1.5px] font-semibold px-[9px] py-1 rounded-[2px] bg-lottery text-paper">
          {applied ? '応募済' : '抽選中'}
        </div>
        {/* Punch hole */}
        <div className="absolute right-4 bottom-[-8px] w-4 h-4 bg-ink rounded-full z-10" />
      </div>

      {/* Tear edge */}
      <div className="tear-edge" />

      {/* Body */}
      <div className="px-[18px] pt-4 pb-5">
        <div className="text-[15px] font-bold leading-[1.3] mb-1 text-ink">{item.name}</div>
        <div className="font-oswald font-semibold text-[21px] my-2 text-ink">
          <span className="text-[13px] font-normal text-muted mr-[2px]">¥</span>
          {item.price === 0 ? (
            <>0 <span className="text-[12px] text-muted font-normal">応募無料</span></>
          ) : item.price.toLocaleString()}
        </div>

        {/* Applicant info */}
        <div className="flex items-center gap-2 mb-[14px]">
          <div className="flex gap-[3px]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className={`w-[6px] h-[6px] rounded-full ${
                  i < Math.min(Math.round((item.winnerCount / Math.max(item.applicantCount, 1)) * 5 * 10), 5)
                    ? 'bg-lottery'
                    : 'bg-line-paper'
                }`}
              />
            ))}
          </div>
          <span className="font-mono text-[11px] text-muted">
            当選枠 {item.winnerCount} / 応募 {item.applicantCount.toLocaleString()}人
          </span>
        </div>

        <button
          className="btn-base bg-lottery"
          disabled={applied}
          onClick={(e) => { e.preventDefault(); }}
        >
          {applied ? '応募済み' : '抽選に応募する'}
        </button>
        <div className="text-center font-mono text-[9.5px] text-muted mt-[6px] tracking-[0.5px]">
          応募締切まで {deadlineLabel}
        </div>
      </div>
    </Link>
  );
}

// ===== Placeholder image for products without real images =====
function ProductPlaceholder({ name, type }: { name: string; type: 'flash' | 'lottery' }) {
  const initials = name.slice(0, 2);
  const bg = type === 'flash' ? '#e4e1d5' : '#dce4f5';
  const color = type === 'flash' ? '#FF4128' : '#3B6FE0';
  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ background: bg }}
    >
      <span
        className="font-oswald font-bold text-[36px] opacity-30"
        style={{ color }}
      >
        {initials}
      </span>
    </div>
  );
}
