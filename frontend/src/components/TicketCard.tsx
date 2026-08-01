// チケット風カードコンポーネント — セール商品および抽選商品のカードを表示する
// パンチホール（丸穴）やミシン目のデザインを適用
import { Link } from 'react-router-dom'
import StockDots from './StockDots'
import type { FlashItem, LotteryItem } from '../types'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/ja'

dayjs.extend(relativeTime)
dayjs.locale('ja')

// ===== フラッシュセール用チケットカード =====
interface FlashTicketProps {
  sale: FlashItem
}

export function FlashTicket({ sale }: FlashTicketProps) {
  const isSoldOut = sale.stock <= 0
  const isUpcoming = sale.status === 'UPCOMING'
  const isEnded = sale.status === 'ENDED'

  const startsAtDate = sale.startsAt ? dayjs(sale.startsAt) : dayjs()
  const now = dayjs()
  const startDiffHours = startsAtDate.diff(now, 'hour')
  const startsAtLabel =
    startDiffHours < 24 ?
      `あと${startDiffHours}時間`
    : `あと${startsAtDate.diff(now, 'day')}日${startsAtDate.diff(now, 'hour') % 24}時間`

  return (
    <Link
      to={`/flash/${sale.id}`}
      className="no-underline w-full bg-paper text-ink rounded-[6px] relative overflow-hidden flex flex-col hover:scale-[1.02] transition-transform duration-200 shadow-lg"
      style={{ borderTop: '4px solid #FF4128' }}>
      {/* 画像・アイキャッチエリア */}
      <div className="h-[160px] bg-gradient-to-br from-[#e4e1d5] to-[#cfccc0] relative overflow-hidden flex-none">
        {sale.imageUrl && !sale.imageUrl.startsWith('/') ?
          <img src={sale.imageUrl} alt={sale.name} className="w-full h-full object-cover" />
        : <ProductPlaceholder name={sale.name} type="flash" />}
        {/* シリアルナンバー */}
        <div className="absolute top-3 left-3 font-mono text-[11px] tracking-[1px] bg-ink text-paper px-2 py-[3px] rounded-[2px] z-10">
          {sale.id}
        </div>
        {/* 販売状態タグ */}
        <div
          className={`absolute top-3 right-3 font-mono text-[10px] tracking-[1.5px] font-semibold px-[9px] py-1 rounded-[2px] z-10 ${
            isUpcoming ? 'bg-purple-500 text-white shadow-sm'
            : isSoldOut || isEnded ? 'bg-black/75 text-white/60 border border-white/20'
            : 'bg-flash text-paper'
          }`}>
          {isUpcoming ?
            '予告'
          : isSoldOut ?
            '売切'
          : isEnded ?
            '終了'
          : 'SALE'}
        </div>
        {/* 人気度（閲覧数）バッジ */}
        <div className="absolute bottom-3 left-3 font-mono text-[10px] tracking-[0.5px] bg-black/60 text-white/90 px-2 py-[2px] rounded-[2px] backdrop-blur-sm z-10 flex items-center gap-1">
          <span>🔥</span> {(sale.viewCount ?? 0).toLocaleString()} views
        </div>
        {/* チケットの丸穴アクセント */}
        <div className="absolute right-4 bottom-[-8px] w-4 h-4 bg-ink rounded-full z-10" />
      </div>

      {/* ミシン目ライン */}
      <div className="tear-edge" />

      {/* カード本文 */}
      <div className="px-[18px] pt-4 pb-5 flex-1 flex flex-col justify-between">
        <div>
          <div className="text-[11px] font-mono text-muted tracking-[0.5px] uppercase mb-1">{sale.category}</div>
          <div className="text-[15px] font-bold leading-[1.3] mb-1 text-ink line-clamp-2">{sale.name}</div>
          <div className="font-oswald font-semibold text-[21px] my-2 text-ink">
            <span className="text-[13px] font-normal text-muted mr-[2px]">¥</span>
            {sale.price.toLocaleString()}
          </div>
          <StockDots stock={sale.stock} totalStock={sale.totalStock} type="flash" className="mb-[14px]" />
        </div>
        <div>
          <div
            className={`btn-base flex items-center justify-center text-center transition-all ${
              isUpcoming ?
                'bg-purple-500/20 text-purple-300 border border-purple-500/30 opacity-80 cursor-not-allowed font-medium'
              : isSoldOut || isEnded ? 'opacity-40 cursor-not-allowed bg-white/10 text-paper/50'
              : 'bg-flash text-paper hover:brightness-110'
            }`}>
            {isUpcoming ?
              '受付前'
            : isSoldOut ?
              '売り切れ'
            : isEnded ?
              '販売終了'
            : '今すぐ購入'}
          </div>
          <div className="text-center font-mono text-[9.5px] text-muted mt-[6px] tracking-[0.5px]">
            {isUpcoming ?
              `販売開始まで ${startsAtLabel}`
            : isEnded ?
              '販売受付は終了しました'
            : '在庫がなくなり次第終了'}
          </div>
        </div>
      </div>
    </Link>
  )
}

// ===== 抽選用チケットカード =====
interface LotteryTicketProps {
  item: LotteryItem
  applied?: boolean
}

export function LotteryTicket({ item, applied = false }: LotteryTicketProps) {
  const startsAtDate = item.startsAt ? dayjs(item.startsAt) : dayjs()
  const deadline = dayjs(item.applyDeadline)
  const now = dayjs()

  const startDiffHours = startsAtDate.diff(now, 'hour')
  const startsAtLabel =
    startDiffHours < 24 ?
      `あと${startDiffHours}時間`
    : `あと${startsAtDate.diff(now, 'day')}日${startsAtDate.diff(now, 'hour') % 24}時間`

  const diffHours = deadline.diff(now, 'hour')
  const deadlineLabel =
    diffHours < 24 ? `あと${diffHours}時間` : `あと${deadline.diff(now, 'day')}日${deadline.diff(now, 'hour') % 24}時間`

  const isActive = item.status === 'ACTIVE'

  return (
    <Link
      to={`/lottery/${item.id}`}
      className="no-underline w-full bg-paper text-ink rounded-[6px] relative overflow-hidden flex flex-col hover:scale-[1.02] transition-transform duration-200 shadow-lg"
      style={{ borderTop: '4px solid #3B6FE0' }}>
      {/* 画像・アイキャッチエリア */}
      <div className="h-[160px] bg-gradient-to-br from-[#dce4f5] to-[#c5d3ee] relative overflow-hidden flex-none">
        {item.imageUrl && !item.imageUrl.startsWith('/') ?
          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
        : <ProductPlaceholder name={item.name} type="lottery" />}
        {/* シリアルナンバー */}
        <div className="absolute top-3 left-3 font-mono text-[11px] tracking-[1px] bg-ink text-paper px-2 py-[3px] rounded-[2px] z-10">
          {item.id}
        </div>
        {/* ステータスタグ（予告: パープル, 応募済: エメラルド, 受付中: ブルー, 抽選中: アンバー, 終了: ダークグレー） */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
          {!applied && item.status === 'UPCOMING' && (
            <span className="font-mono text-[10px] tracking-[1px] font-semibold px-[8px] py-1 rounded-[2px] bg-purple-500 text-white shadow-sm">
              予告
            </span>
          )}
          {applied && (
            <span className="font-mono text-[10px] tracking-[1px] font-semibold px-[8px] py-1 rounded-[2px] bg-emerald-600 text-white shadow-sm">
              応募済
            </span>
          )}
          {!applied && isActive && (
            <span className="font-mono text-[10px] tracking-[1px] font-semibold px-[8px] py-1 rounded-[2px] bg-lottery text-paper">
              受付中
            </span>
          )}
          {item.status === 'DRAWING' && (
            <span className="font-mono text-[10px] tracking-[1px] font-bold px-[8px] py-1 rounded-[2px] bg-amber-500 text-black animate-pulse shadow-sm">
              抽選中
            </span>
          )}
          {!applied && item.status !== 'UPCOMING' && !isActive && item.status !== 'DRAWING' && (
            <span className="font-mono text-[10px] tracking-[1px] font-semibold px-[8px] py-1 rounded-[2px] bg-black/75 text-white/60 border border-white/20">
              終了
            </span>
          )}
        </div>
        {/* 人気度（閲覧数）バッジ */}
        <div className="absolute bottom-3 left-3 font-mono text-[10px] tracking-[0.5px] bg-black/60 text-white/90 px-2 py-[2px] rounded-[2px] backdrop-blur-sm z-10 flex items-center gap-1">
          <span>🔥</span> {(item.viewCount ?? 0).toLocaleString()} views
        </div>
        {/* チケットの丸穴アクセント */}
        <div className="absolute right-4 bottom-[-8px] w-4 h-4 bg-ink rounded-full z-10" />
      </div>

      {/* ミシン目ライン */}
      <div className="tear-edge" />

      {/* カード本文 */}
      <div className="px-[18px] pt-4 pb-5 flex-1 flex flex-col justify-between">
        <div>
          <div className="text-[11px] font-mono text-muted tracking-[0.5px] uppercase mb-1">{item.category}</div>
          <div className="text-[15px] font-bold leading-[1.3] mb-1 text-ink line-clamp-2">{item.name}</div>
          <div className="font-oswald font-semibold text-[21px] my-2 text-ink">
            <span className="text-[13px] font-normal text-muted mr-[2px]">¥</span>
            {item.price === 0 ?
              <>
                0 <span className="text-[12px] text-muted font-normal">応募無料</span>
              </>
            : item.price.toLocaleString()}
          </div>

          {/* 応募者数・当選枠 */}
          <div className="flex items-center gap-2 mb-[14px]">
            <div className="flex gap-[3px]">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-[6px] h-[6px] rounded-full ${
                    i < Math.min(Math.round((item.winnerCount / Math.max(item.applyCount ?? 1, 1)) * 5 * 10), 5) ?
                      'bg-lottery'
                    : 'bg-line-paper'
                  }`}
                />
              ))}
            </div>
            <span className="font-mono text-[11px] text-muted">
              枠 {item.winnerCount} / 応募 {(item.applyCount ?? 0).toLocaleString()}人
            </span>
          </div>
        </div>

        <div>
          {/* ボタンエリア（UPCOMING -> 予告, ACTIVE/ACTIVE -> 抽選に応募する, DRAWING -> 受付終了（集計中）, applied -> 応募済み） */}
          <div
            className={`btn-base flex items-center justify-center text-center transition-all ${
              applied ?
                'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 opacity-90 cursor-not-allowed font-medium'
              : item.status === 'UPCOMING' ?
                'bg-purple-500/20 text-purple-300 border border-purple-500/30 opacity-80 cursor-not-allowed font-medium'
              : isActive ? 'bg-lottery text-paper hover:brightness-110 shadow-md'
              : item.status === 'DRAWING' ?
                'bg-amber-500/20 text-amber-300 border border-amber-500/30 opacity-80 cursor-not-allowed font-medium'
              : 'bg-white/10 text-paper/50 opacity-50 cursor-not-allowed'
            }`}>
            {applied ?
              '応募済み'
            : item.status === 'UPCOMING' ?
              '予告'
            : isActive ?
              '抽選に応募する'
            : item.status === 'DRAWING' ?
              '受付終了（集計中）'
            : '受付終了'}
          </div>
          <div className="text-center font-mono text-[9.5px] text-muted mt-[6px] tracking-[0.5px]">
            {applied ?
              '抽選結果はマイページで確認'
            : item.status === 'UPCOMING' ?
              `応募開始まで ${startsAtLabel}`
            : isActive ?
              `応募締切まで ${deadlineLabel}`
            : item.status === 'DRAWING' ?
              '現在抽選の集計を行っています'
            : '応募受付は終了しました'}
          </div>
        </div>
      </div>
    </Link>
  )
}

// ===== 画像がない場合のプレースホルダー =====
function ProductPlaceholder({ name, type }: { name: string; type: 'flash' | 'lottery' }) {
  const initials = name.slice(0, 2)
  const bg = type === 'flash' ? '#e4e1d5' : '#dce4f5'
  const color = type === 'flash' ? '#FF4128' : '#3B6FE0'
  return (
    <div className="w-full h-full flex items-center justify-center" style={{ background: bg }}>
      <span className="font-oswald font-bold text-[36px] opacity-30" style={{ color }}>
        {initials}
      </span>
    </div>
  )
}
