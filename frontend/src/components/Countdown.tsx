// Countdown — flip-style countdown display matching design mockup board
import { useCountdown } from '../hooks/useCountdown';

interface CountdownProps {
  targetDate: string;
  label?: string;
  showDays?: boolean;
}

function FlipBlock({ digits, label }: { digits: string; label: string }) {
  return (
    <div className="bg-ink-soft border border-white/[0.12] rounded-[4px] px-[10px] pt-[14px] pb-[10px] text-center min-w-[88px] relative overflow-hidden">
      {/* Top half divider */}
      <div className="absolute inset-x-0 top-1/2 h-px bg-white/[0.06]" />
      <div
        className="font-oswald font-semibold text-[44px] leading-none text-paper tabular-nums"
        key={digits} // re-mounts on change → CSS animation kicks in
        style={{ animation: 'flipDown 0.35s ease-in-out' }}
      >
        {digits}
      </div>
      <div className="font-mono text-[10px] text-muted tracking-[2px] uppercase mt-2">{label}</div>
    </div>
  );
}

export default function Countdown({ targetDate, label = 'LIVE — 次回販売まで', showDays = true }: CountdownProps) {
  const { days, hours, minutes, seconds, isExpired } = useCountdown(targetDate);

  if (isExpired) {
    return (
      <div className="font-mono text-[12px] text-flash tracking-[2px] uppercase">
        販売終了
      </div>
    );
  }

  return (
    <div>
      {/* Live label */}
      <div className="flex items-center gap-[10px] font-mono text-[12px] text-flash tracking-[2px] uppercase mb-[18px]">
        <span className="pulse-dot" />
        {label}
      </div>

      {/* Flip board */}
      <div className="flex items-end gap-[14px] flex-wrap">
        {showDays && (
          <>
            <FlipBlock digits={days} label="Days" />
            <span className="font-oswald text-[36px] text-muted pb-[14px]">:</span>
          </>
        )}
        <FlipBlock digits={hours} label="Hours" />
        <span className="font-oswald text-[36px] text-muted pb-[14px]">:</span>
        <FlipBlock digits={minutes} label="Min" />
        <span className="font-oswald text-[36px] text-muted pb-[14px]">:</span>
        <FlipBlock digits={seconds} label="Sec" />
      </div>
    </div>
  );
}
