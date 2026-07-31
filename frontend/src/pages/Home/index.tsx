// Home page — hero section + flash sale rail + lottery rail
// Matches design mockup exactly
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Countdown from '../../components/Countdown';
import { FlashTicket, LotteryTicket } from '../../components/TicketCard';
import { api } from '../../services/api';
import { useOrderStore } from '../../stores/orderStore';
import dayjs from 'dayjs';

export default function Home() {
  const { data: flashSales = [], isLoading: flashLoading } = useQuery({
    queryKey: ['flashSales'],
    queryFn: api.getFlashSaleList,
    refetchInterval: 15000, // refresh every 15s for stock updates
  });

  const { data: lotteryItems = [], isLoading: lotteryLoading } = useQuery({
    queryKey: ['lotteryItems'],
    queryFn: api.getLotteryList,
  });

  const { appliedIds } = useOrderStore();

  // Next upcoming flash sale end time (for countdown)
  const nextSaleEnd = flashSales[0]?.endsAt ?? dayjs().add(2, 'day').add(14, 'hour').add(37, 'minute').toISOString();

  return (
    <div className="min-h-screen page-enter">
      {/* ===== HERO ===== */}
      <section className="px-10 pt-16 pb-14 border-b border-white/[0.12] bg-gradient-to-b from-flash/[0.05] to-transparent max-sm:px-5 max-sm:pt-10 max-sm:pb-10">
        <Countdown targetDate={nextSaleEnd} label="LIVE — 次回販売まで" />

        <h1 className="font-oswald font-semibold text-[56px] leading-[1.05] tracking-[-0.5px] max-w-[680px] mt-[18px] mb-[10px] max-sm:text-[36px]">
          整理券は、もう並ばない。
        </h1>
        <p className="text-muted text-[15px] max-w-[520px] mb-9">
          フラッシュセールは早い者勝ち、抽選は公平な運。あなたに合った買い方を選べる、次世代の限定販売プラットフォーム。
        </p>

        <div className="flex gap-3 flex-wrap">
          <Link
            to="/flash"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-flash text-paper font-oswald font-semibold text-[13px] tracking-[1px] uppercase rounded-[3px] no-underline hover:brightness-110 transition-all"
          >
            セールを見る →
          </Link>
          <Link
            to="/lottery"
            className="inline-flex items-center gap-2 px-5 py-2.5 border border-white/[0.2] text-paper font-oswald font-semibold text-[13px] tracking-[1px] uppercase rounded-[3px] no-underline hover:border-white/40 transition-all"
          >
            抽選に応募する
          </Link>
        </div>
      </section>

      {/* ===== FLASH SALE RAIL ===== */}
      <div className="flex items-baseline gap-[14px] px-10 pt-9 pb-5 max-sm:px-5 max-sm:pt-7">
        <h2 className="font-oswald font-semibold text-[22px] tracking-[0.5px] text-flash">
          フラッシュセール — FLASH SALE
        </h2>
        <span className="font-mono text-[13px] text-muted">早い者勝ち / 在庫リアルタイム</span>
      </div>

      <div className="rail-scroll px-10 pb-12 max-sm:px-5 max-sm:pb-9">
        {flashLoading
          ? Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
          : flashSales.map((sale) => <FlashTicket key={sale.id} sale={sale} />)
        }
        {!flashLoading && flashSales.length === 0 && (
          <EmptyState message="現在開催中のセールはありません" />
        )}
      </div>

      {/* ===== LOTTERY RAIL ===== */}
      <div className="flex items-baseline gap-[14px] px-10 pt-2 pb-5 max-sm:px-5">
        <h2 className="font-oswald font-semibold text-[22px] tracking-[0.5px] text-lottery">
          抽選 — LOTTERY
        </h2>
        <span className="font-mono text-[13px] text-muted">応募は公平に、結果は自動抽選で</span>
      </div>

      <div className="rail-scroll px-10 pb-12 max-sm:px-5 max-sm:pb-9">
        {lotteryLoading
          ? Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} type="lottery" />)
          : lotteryItems.map((item) => (
              <LotteryTicket
                key={item.id}
                item={item}
                applied={appliedIds.has(item.id)}
              />
            ))
        }
        {!lotteryLoading && lotteryItems.length === 0 && (
          <EmptyState message="現在開催中の抽選はありません" />
        )}
      </div>
    </div>
  );
}

// Skeleton loading card
function SkeletonCard({ type = 'flash' }: { type?: 'flash' | 'lottery' }) {
  const topColor = type === 'flash' ? 'bg-flash/40' : 'bg-lottery/40';
  return (
    <div className={`flex-none w-[280px] bg-ink-soft rounded-[6px] overflow-hidden border-t-4 ${topColor} animate-pulse`}>
      <div className="h-[160px] bg-white/[0.04]" />
      <div className="p-5">
        <div className="h-4 bg-white/[0.06] rounded mb-2 w-3/4" />
        <div className="h-6 bg-white/[0.06] rounded mb-3 w-1/2" />
        <div className="h-9 bg-white/[0.06] rounded" />
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-muted font-mono text-[13px] tracking-[0.5px] py-4">{message}</div>
  );
}
