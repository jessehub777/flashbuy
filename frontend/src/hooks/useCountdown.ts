// useCountdown hook — real-time countdown using Day.js
import { useState, useEffect, useRef } from 'react';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';

dayjs.extend(duration);

interface CountdownParts {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
  totalSeconds: number;
  isExpired: boolean;
}

export function useCountdown(targetDate: string): CountdownParts {
  const calculateParts = (): CountdownParts => {
    const diff = dayjs(targetDate).diff(dayjs(), 'second');
    if (diff <= 0) {
      return { days: '00', hours: '00', minutes: '00', seconds: '00', totalSeconds: 0, isExpired: true };
    }
    const d = dayjs.duration(diff, 'seconds');
    return {
      days: String(Math.floor(d.asDays())).padStart(2, '0'),
      hours: String(d.hours()).padStart(2, '0'),
      minutes: String(d.minutes()).padStart(2, '0'),
      seconds: String(d.seconds()).padStart(2, '0'),
      totalSeconds: diff,
      isExpired: false,
    };
  };

  const [parts, setParts] = useState<CountdownParts>(calculateParts);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setParts(calculateParts());
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [targetDate]);

  return parts;
}
