// StockDots — visual stock indicator (dot progress bar)
interface StockDotsProps {
  stock: number;
  totalStock: number;
  type: 'flash' | 'lottery';
  className?: string;
}

const DOT_COUNT = 5;

export default function StockDots({ stock, totalStock, type, className = '' }: StockDotsProps) {
  const ratio = totalStock > 0 ? stock / totalStock : 0;
  const filledDots = Math.round(ratio * DOT_COUNT);
  const dotColor = type === 'flash' ? 'bg-flash' : 'bg-lottery';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex gap-[3px]">
        {Array.from({ length: DOT_COUNT }).map((_, i) => (
          <div
            key={i}
            className={`w-[6px] h-[6px] rounded-full ${i < filledDots ? dotColor : 'bg-line-paper'}`}
          />
        ))}
      </div>
      <span className="font-mono text-[11px] text-muted">
        残り {stock.toLocaleString()} / {totalStock.toLocaleString()}
      </span>
    </div>
  );
}
