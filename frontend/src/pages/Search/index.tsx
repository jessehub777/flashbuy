// 検索結果ページ — /search?q=xxx
// フラッシュセールと抽選を同時に検索する
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { FlashTicket, LotteryTicket } from '../../components/TicketCard'
import { api } from '../../services/api'
import { useOrderStore } from '../../stores/orderStore'
import { useAuthStore } from '../../stores/authStore'

type TimeRange = '6m' | '1y' | '3y'

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const [inputValue, setInputValue] = useState(query)
  const [timeRange, setTimeRange] = useState<TimeRange>('6m')
  const { appliedIds } = useOrderStore()
  const { isLoggedIn } = useAuthStore()

  // ログイン中はサーバーから応募済み状態を取得する（リロード後も表示を維持するため）
  const { data: myApplications = [] } = useQuery({
    queryKey: ['myLotteryApplications'],
    queryFn: api.getMyLotteryApplicationList,
    enabled: isLoggedIn(),
  })

  // URLのクエリが変わったときに入力フィールドも更新する
  useEffect(() => {
    setInputValue(query)
  }, [query])

  const { data, isLoading } = useQuery({
    queryKey: ['search', query, timeRange],
    queryFn: () => api.search(query, timeRange),
    enabled: !!query,
  })

  const flashList = data?.flashList ?? []
  const lotteryList = data?.lotteryList ?? []
  const totalCount = flashList.length + lotteryList.length

  // 新しいキーワードで再検索する
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim()) return
    setSearchParams({ q: inputValue.trim() })
  }

  return (
    <div className="min-h-screen page-enter">
      {/* 検索ヘッダー */}
      <section className="px-10 pt-10 pb-8 border-b border-white/[0.12] max-sm:px-5 max-sm:pt-7">
        <h1 className="font-oswald font-semibold text-[36px] tracking-[-0.3px] mb-4 max-sm:text-[26px]">検索結果</h1>

        {/* 検索フォーム */}
        <form onSubmit={handleSearch} className="flex gap-2 max-w-[540px]">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="キーワードを入力..."
            className="input-dark flex-1 text-[14px]"
          />
          <button
            type="submit"
            className="px-5 py-2.5 bg-flash text-paper font-oswald font-semibold text-[13px] tracking-[1px] rounded-[3px] hover:brightness-110 transition-all">
            再検索
          </button>
        </form>

        {/* 開催・販売時期フィルター（全期間の一括スキャンを避けるため対象期間を絞る） */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <span className="font-mono text-[11px] text-muted tracking-[1px] uppercase mr-1">対象期間:</span>
          {[
            { id: '6m', label: '6ヶ月以内' },
            { id: '1y', label: '1年以内' },
            { id: '3y', label: '3年以内' },
          ].map((range) => (
            <button
              key={range.id}
              type="button"
              onClick={() => setTimeRange(range.id as TimeRange)}
              className={`font-mono text-[11px] px-3 py-1 rounded-[2px] transition-all cursor-pointer border ${
                timeRange === range.id ?
                  'bg-paper text-ink font-semibold border-paper'
                : 'bg-white/[0.04] text-paper/70 border-white/[0.1] hover:border-white/30'
              }`}>
              {range.label}
            </button>
          ))}
        </div>

        {/* 検索結果の件数表示 */}
        {query && !isLoading && (
          <p className="font-mono text-[12px] text-muted mt-4 tracking-[0.5px]">
            「<span className="text-paper">{query}</span>」の検索結果：
            <span className="text-paper ml-1">{totalCount} 件</span>
            （セール {flashList.length} 件 / 抽選 {lotteryList.length} 件）
          </p>
        )}
      </section>

      {/* 検索中のスケルトン */}
      {isLoading && (
        <div className="px-10 py-10 max-sm:px-5">
          <div className="h-5 bg-white/[0.06] rounded w-32 mb-6 animate-pulse" />
          <div className="rail-scroll pb-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      )}

      {/* 検索前（クエリなし）の案内 */}
      {!query && (
        <div className="px-10 py-24 text-center max-sm:px-5">
          <div className="font-oswald font-bold text-[60px] text-white/[0.04] mb-4">SEARCH</div>
          <p className="font-mono text-[13px] text-muted tracking-[1px]">キーワードを入力して検索してください</p>
        </div>
      )}

      {/* 検索結果が0件 */}
      {query && !isLoading && totalCount === 0 && (
        <div className="px-10 py-24 text-center max-sm:px-5">
          <div className="font-oswald font-bold text-[60px] text-white/[0.04] mb-4">0</div>
          <p className="font-mono text-[13px] text-muted tracking-[1px] mb-6">
            「{query}」に一致する商品が見つかりません
          </p>
          <div className="flex gap-3 justify-center">
            <Link to="/flash" className="font-mono text-[12px] text-flash hover:underline no-underline">
              セール一覧を見る
            </Link>
            <span className="text-muted">／</span>
            <Link to="/lottery" className="font-mono text-[12px] text-lottery hover:underline no-underline">
              抽選一覧を見る
            </Link>
          </div>
        </div>
      )}

      {/* フラッシュセール結果 */}
      {!isLoading && flashList.length > 0 && (
        <div className="px-10 pt-10 max-sm:px-5 max-sm:pt-7">
          <div className="flex items-baseline gap-3 mb-5">
            <h2 className="font-oswald font-semibold text-[20px] tracking-[0.5px] text-flash">フラッシュセール</h2>
            <span className="font-mono text-[12px] text-muted">{flashList.length} 件</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5 pb-6">
            {flashList.map((sale) => (
              <FlashTicket key={sale.id} sale={sale} />
            ))}
          </div>
        </div>
      )}

      {/* 抽選結果 */}
      {!isLoading && lotteryList.length > 0 && (
        <div className="px-10 pt-8 pb-12 max-sm:px-5 max-sm:pb-9">
          <div className="flex items-baseline gap-3 mb-5">
            <h2 className="font-oswald font-semibold text-[20px] tracking-[0.5px] text-lottery">抽選</h2>
            <span className="font-mono text-[12px] text-muted">{lotteryList.length} 件</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5 pb-6">
            {lotteryList.map((item) => (
              <LotteryTicket key={item.id} item={item} applied={appliedIds.has(item.id) || myApplications.some((a) => a.lotteryId === item.id)} />
            ))}
          </div>
        </div>
      )}

      {/* トップへ戻るリンク */}
      {!isLoading && (
        <div className="px-10 pb-12 max-sm:px-5">
          <Link
            to="/"
            className="font-mono text-[12px] text-muted hover:text-paper transition-colors tracking-[1px] no-underline">
            ← トップへ戻る
          </Link>
        </div>
      )}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="flex-none w-[280px] bg-ink-soft rounded-[6px] overflow-hidden border-t-4 border-white/[0.12] animate-pulse">
      <div className="h-[160px] bg-white/[0.04]" />
      <div className="p-5">
        <div className="h-4 bg-white/[0.06] rounded mb-2 w-3/4" />
        <div className="h-6 bg-white/[0.06] rounded mb-3 w-1/2" />
        <div className="h-9 bg-white/[0.06] rounded" />
      </div>
    </div>
  )
}
