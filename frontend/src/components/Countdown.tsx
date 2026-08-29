// Countdown — flip-style countdown display matching design mockup board
import { useEffect, useRef } from 'react';
import { useCountdown } from '../hooks/useCountdown';

interface CountdownProps {
  targetDate: string;
  label?: string;
  showDays?: boolean;
  expiredText?: string;
  // 期限切れになった瞬間に1回だけ呼ばれる（親で状態を再取得させるために使う）
  onExpired?: () => void;
}

function FlipBlock({
  digits,
  label,
  compact = false,
}: {
  digits: string;
  label: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`bg-ink-soft border border-white/[0.12] rounded-[4px] text-center relative overflow-hidden flex-none ${
        compact
          ? 'px-2 pt-2.5 pb-2 min-w-[62px] sm:min-w-[76px]'
          : 'px-[10px] pt-[14px] pb-[10px] min-w-[76px] sm:min-w-[88px]'
      }`}
    >
      {/* Top half divider */}
      <div className="absolute inset-x-0 top-1/2 h-px bg-white/[0.06]" />
      <div
        className={`font-oswald font-semibold leading-none text-paper tabular-nums ${
          compact ? 'text-[28px] sm:text-[36px]' : 'text-[34px] sm:text-[44px]'
        }`}
        key={digits} // re-mounts on change → CSS animation kicks in
        style={{ animation: 'flipDown 0.35s ease-in-out' }}
      >
        {digits}
      </div>
      <div className="font-mono text-[9px] sm:text-[10px] text-muted tracking-[1.5px] uppercase mt-1.5">
        {label}
      </div>
    </div>
  );
}

export default function Countdown({
  targetDate,
  label = 'LIVE — 次回販売まで',
  showDays = true,
  expiredText = '受付終了',
  onExpired,
}: CountdownProps) {
  const { days, hours, minutes, seconds, isExpired } = useCountdown(targetDate);
  const expiredNotified = useRef(false);

  // 対象時刻が変わったら通知済みフラグをリセットする。
  // 状態が変わると targetDate が差し替わる（例: 締切 → 抽選日）ため、
  // 同じコンポーネントで次の期限切れも通知できるようにする。
  useEffect(() => {
    expiredNotified.current = false;
  }, [targetDate]);

  // 期限切れになったら1回だけ通知する（初回表示時点で既に切れている場合も含む）
  useEffect(() => {
    if (isExpired && !expiredNotified.current) {
      expiredNotified.current = true;
      onExpired?.();
    }
  }, [isExpired, onExpired]);

  if (isExpired) {
    return (
      <div className="font-mono text-[12px] text-paper/70 tracking-[2px] uppercase font-semibold">
        {expiredText}
      </div>
    );
  }

  const numericDays = Number(days) || 0;
  const hasDays = showDays && numericDays > 0;

  return (
    <div>
      {/* Live label (if label provided) */}
      {label && (
        <div className="flex items-center gap-[10px] font-mono text-[12px] text-flash tracking-[2px] uppercase mb-[18px]">
          <span className="pulse-dot" />
          {label}
        </div>
      )}

      {/* Flip board — flex-nowrap keeps all blocks strictly on one line */}
      <div className="flex items-end gap-1.5 sm:gap-3 flex-nowrap overflow-x-auto py-1 no-scrollbar">
        {hasDays && (
          <>
            <FlipBlock digits={days} label="Days" compact={hasDays} />
            <span className="font-oswald text-[22px] sm:text-[32px] text-muted pb-2 flex-none">:</span>
          </>
        )}
        <FlipBlock digits={hours} label="Hours" compact={hasDays} />
        <span className="font-oswald text-[22px] sm:text-[32px] text-muted pb-2 flex-none">:</span>
        <FlipBlock digits={minutes} label="Min" compact={hasDays} />
        <span className="font-oswald text-[22px] sm:text-[32px] text-muted pb-2 flex-none">:</span>
        <FlipBlock digits={seconds} label="Sec" compact={hasDays} />
      </div>
    </div>
  );
}
