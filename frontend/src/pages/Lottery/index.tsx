// Lottery detail page — entry details, applicant count, apply flow
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Countdown from '../../components/Countdown';
import { api } from '../../services/api';
import { useOrderStore } from '../../stores/orderStore';
import { useAuthStore } from '../../stores/authStore';
import dayjs from 'dayjs';

export default function LotteryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isLoggedIn } = useAuthStore();
  const { applyLottery, applyStatus, isApplied, resetApplyStatus } = useOrderStore();
  const [applied, setApplied] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const { data: item, isLoading } = useQuery({
    queryKey: ['lottery', id],
    queryFn: () => api.getLotteryById(id!),
    enabled: !!id,
  });

  const alreadyApplied = applied || (id ? isApplied(id) : false);
  const winRate = item ? ((item.winnerCount / Math.max(item.applicantCount + 1, 1)) * 100).toFixed(1) : '0';

  const handleApply = async () => {
    if (!isLoggedIn()) { navigate('/login'); return; }
    setShowConfirm(false);
    await applyLottery(id!);
    setApplied(true);
    resetApplyStatus();
  };

  if (isLoading) return <LoadingSkeleton />;
  if (!item) return <div className="p-10 text-muted">抽選が見つかりません</div>;

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
            style={{ background: 'linear-gradient(135deg, #dce4f5, #c5d3ee)' }}
          >
            <div className="absolute top-4 left-4 font-mono text-[11px] tracking-[1px] bg-ink text-paper px-2 py-[3px] rounded-[2px] z-10">
              {item.serialNo}
            </div>
            <div className="absolute top-4 right-4 font-mono text-[10px] tracking-[1.5px] font-semibold px-[9px] py-1 rounded-[2px] bg-lottery text-paper z-10">
              {alreadyApplied ? '応募済' : '抽選中'}
            </div>
            <div className="w-full h-full flex items-center justify-center">
              <span className="font-oswald font-bold text-[80px] text-lottery/20">
                {item.name.slice(0, 2)}
              </span>
            </div>
          </div>

          {/* Odds display */}
          <div className="mt-4 bg-ink-soft border border-white/[0.08] rounded-[4px] p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="font-oswald font-bold text-[28px] text-lottery">{item.winnerCount}</div>
                <div className="font-mono text-[10px] text-muted tracking-[1px]">当選枠</div>
              </div>
              <div>
                <div className="font-oswald font-bold text-[28px] text-paper">{item.applicantCount.toLocaleString()}</div>
                <div className="font-mono text-[10px] text-muted tracking-[1px]">応募者数</div>
              </div>
              <div>
                <div className="font-oswald font-bold text-[28px] text-paper">{winRate}%</div>
                <div className="font-mono text-[10px] text-muted tracking-[1px]">当選確率</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: info */}
        <div>
          <div className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase mb-2">
            {item.category}
          </div>
          <h1 className="font-oswald font-semibold text-[32px] leading-[1.1] mb-3 text-paper">
            {item.name}
          </h1>
          <div className="font-oswald font-bold text-[36px] text-paper mb-1">
            {item.price === 0 ? (
              <span>¥0 <span className="text-[16px] font-normal text-muted">応募無料</span></span>
            ) : (
              <><span className="text-[18px] font-normal text-muted mr-1">¥</span>{item.price.toLocaleString()}</>
            )}
          </div>

          <p className="text-[14px] text-muted leading-[1.8] mt-4 mb-8">{item.description}</p>

          {/* Countdown */}
          <div className="bg-ink-soft border border-white/[0.08] rounded-[4px] p-4 mb-4">
            <div className="font-mono text-[10px] text-muted tracking-[1.5px] uppercase mb-3">応募締切まで</div>
            <Countdown targetDate={item.applyDeadline} label="" showDays={false} />
          </div>

          {/* Draw schedule */}
          <div className="font-mono text-[11px] text-muted tracking-[0.5px] mb-6">
            抽選日時: {dayjs(item.drawAt).format('YYYY年MM月DD日 HH:mm')}
          </div>

          {/* Apply button */}
          {alreadyApplied ? (
            <div className="flex items-center gap-3 p-4 bg-lottery/10 border border-lottery/30 rounded-[4px]">
              <svg className="w-5 h-5 text-lottery flex-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <div className="text-lottery font-semibold text-[14px]">応募済み</div>
                <div className="font-mono text-[10px] text-muted mt-0.5 tracking-[0.5px]">
                  抽選結果はマイページでご確認いただけます
                </div>
              </div>
            </div>
          ) : (
            <>
              <button
                className="btn-base bg-lottery py-3 text-[15px]"
                onClick={() => setShowConfirm(true)}
                disabled={applyStatus === 'applying'}
              >
                {applyStatus === 'applying' ? '応募中...' : '抽選に応募する'}
              </button>
              <p className="font-mono text-[10px] text-muted mt-2 text-center tracking-[0.5px]">
                応募は無料 / 一人につき1回まで
              </p>
            </>
          )}
        </div>
      </div>

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop bg-black/70 animate-fade-in">
          <div className="bg-ink-soft border border-white/[0.12] rounded-[6px] w-full max-w-[380px] mx-4 p-6 animate-slide-up">
            <h3 className="font-oswald font-semibold text-[18px] mb-2">応募を確認</h3>
            <p className="text-[14px] text-muted mb-1">{item.name}</p>
            <p className="font-mono text-[11px] text-muted mb-5 tracking-[0.5px]">
              現在の当選確率: 約 {winRate}%（{item.applicantCount.toLocaleString()}人中{item.winnerCount}名当選）
            </p>
            <div className="flex gap-3">
              <button
                className="flex-1 py-2.5 border border-white/[0.12] text-muted font-oswald font-semibold text-[13px] tracking-[1px] uppercase rounded-[3px] hover:border-white/25 transition-colors"
                onClick={() => setShowConfirm(false)}
              >
                キャンセル
              </button>
              <button
                className="btn-base bg-lottery flex-1"
                onClick={handleApply}
              >
                応募する
              </button>
            </div>
          </div>
        </div>
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
          <div className="h-4 bg-white/[0.06] rounded w-5/6" />
        </div>
      </div>
    </div>
  );
}
