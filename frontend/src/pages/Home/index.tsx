// ホームページ — ヒーロー・人気Top10フラッシュセール・人気Top10抽選（平铺グリッド表示）
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { FlashTicket, LotteryTicket } from '../../components/TicketCard'
import { api } from '../../services/api'
import { useOrderStore } from '../../stores/orderStore'

export default function Home() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')

  // ホーム画面専用の「人気Top10」取得APIを呼び出す
  const { data: featuredData, isLoading } = useQuery({
    queryKey: ['homeFeatured'],
    queryFn: api.getHomeFeatured,
    refetchInterval: 15000, // 閲覧数や在庫の更新を反映する
  })

  const flashList = featuredData?.flashList ?? []
  const lotteryList = featuredData?.lotteryList ?? []

  // 人気Top10のレスポンスデータから「人気カテゴリー」をフロントエンドで動的に計算・抽出する（追加APIなし）
  const popularCategories = useMemo(() => {
    const categoriesSet = new Set<string>()
    flashList.forEach((s) => {
      if (s.category) categoriesSet.add(s.category)
    })
    lotteryList.forEach((l) => {
      if (l.category) categoriesSet.add(l.category)
    })
    return Array.from(categoriesSet).slice(0, 5) // 上位最大5件
  }, [flashList, lotteryList])

  const { appliedIds } = useOrderStore()

  // 検索フォームの送信
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
  }

  return (
    <div className="min-h-screen page-enter">
      {/* ===== ヒーローセクション (方案2：技術ハイライト＆高アクセス対応アーキテクチャ) ===== */}
      <section className="px-10 pt-14 pb-14 border-b border-white/[0.12] bg-gradient-to-b from-flash/[0.05] to-transparent max-sm:px-5 max-sm:pt-8 max-sm:pb-10">
        {/* 技術ハイライト・アーキテクチャバッジ */}
        <div className="flex flex-wrap items-center gap-2.5 mb-5">
          <span className="font-mono text-[11px] tracking-[1.5px] uppercase bg-flash/15 text-flash border border-flash/30 px-3 py-1 rounded-[2px] font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-flash animate-pulse" />
            HIGH-CONCURRENCY ARCHITECTURE
          </span>
          <span className="font-mono text-[11px] tracking-[0.5px] text-paper/80 bg-white/[0.05] border border-white/[0.1] px-2.5 py-1 rounded-[2px]">
            ⚡ 大量同時アクセス対応
          </span>
          <span className="font-mono text-[11px] tracking-[0.5px] text-paper/80 bg-white/[0.05] border border-white/[0.1] px-2.5 py-1 rounded-[2px] hidden sm:inline-block">
            🎯 フェアな自動抽選エンジン
          </span>
          <span className="font-mono text-[11px] tracking-[0.5px] text-paper/80 bg-white/[0.05] border border-white/[0.1] px-2.5 py-1 rounded-[2px] hidden md:inline-block">
            🛡️ トークンバケット限流
          </span>
        </div>

        <h1 className="font-oswald font-semibold text-[56px] leading-[1.05] tracking-[-0.5px] max-w-[720px] mb-[12px] max-sm:text-[34px]">
          整理券は、もう並ばない。
        </h1>
        <p className="text-muted text-[15px] max-w-[540px] mb-8 leading-[1.7] max-sm:text-[14px]">
          フラッシュセールは早い者勝ち、抽選は公平な運。大量アクセス下でも高速に動作する、次世代の限定販売プラットフォーム。
        </p>

        {/* 検索バー */}
        <form onSubmit={handleSearch} className="flex gap-2 max-w-[480px] mb-8 max-sm:mb-6">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ライブ、スニーカー、イベントを検索..."
            className="input-dark flex-1 text-[13px]"
          />
          <button
            type="submit"
            className="px-4 py-2.5 bg-flash text-paper font-oswald font-semibold text-[13px] tracking-[1px] rounded-[3px] hover:brightness-110 transition-all whitespace-nowrap">
            検索
          </button>
        </form>

        {/* 人気カテゴリー・クイック検索タグ（Top10データからフロントエンドで動的に抽出） */}
        {popularCategories.length > 0 && (
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-mono text-[11px] text-muted tracking-[1px] uppercase mr-1">POPULAR:</span>
            {popularCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => navigate(`/search?q=${encodeURIComponent(cat)}`)}
                className="font-mono text-[12px] bg-white/[0.04] hover:bg-white/[0.1] text-paper/80 border border-white/[0.1] hover:border-white/30 px-3 py-1.5 rounded-[3px] transition-all cursor-pointer">
                🏷️ {cat}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ===== フラッシュセール セクション（人気Top10・平铺グリッド表示） ===== */}
      <section className="px-10 pt-10 pb-12 max-sm:px-5 max-sm:pt-8 max-sm:pb-9">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-baseline gap-[14px]">
            <h2 className="font-oswald font-semibold text-[24px] tracking-[0.5px] text-flash flex items-center gap-2">
              <span>🔥</span> フラッシュセール 人気TOP 10
            </h2>
            <span className="font-mono text-[12px] text-muted max-sm:hidden">閲覧数上位・早い者勝ち</span>
          </div>
          <Link
            to="/flash"
            className="font-mono text-[12px] text-muted hover:text-flash transition-colors tracking-[0.5px] no-underline">
            すべての一覧を見る →
          </Link>
        </div>

        {/* 平铺（グリッド）表示エリア（1080P / 2K 画面では 5 列表示） */}
        {isLoading ?
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        : flashList.length === 0 ?
          <EmptyState message="現在開催中のセールはありません" />
        : <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
            {flashList.map((sale) => (
              <FlashTicket key={sale.id} sale={sale} />
            ))}
          </div>
        }
      </section>

      {/* ===== 抽選 セクション（人気Top10・平铺グリッド表示） ===== */}
      <section className="px-10 pt-4 pb-16 max-sm:px-5 max-sm:pb-12">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-baseline gap-[14px]">
            <h2 className="font-oswald font-semibold text-[24px] tracking-[0.5px] text-lottery flex items-center gap-2">
              <span>🎯</span> 抽選 人気TOP 10
            </h2>
            <span className="font-mono text-[12px] text-muted max-sm:hidden">閲覧数上位・公平な自動抽選</span>
          </div>
          <Link
            to="/lottery"
            className="font-mono text-[12px] text-muted hover:text-lottery transition-colors tracking-[0.5px] no-underline">
            すべての一覧を見る →
          </Link>
        </div>

        {/* 平铺（グリッド）表示エリア（1080P / 2K 画面では 5 列表示） */}
        {isLoading ?
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonCard key={i} type="lottery" />
            ))}
          </div>
        : lotteryList.length === 0 ?
          <EmptyState message="現在開催中の抽選はありません" />
        : <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
            {lotteryList.map((item) => (
              <LotteryTicket key={item.id} item={item} applied={appliedIds.has(item.id)} />
            ))}
          </div>
        }
      </section>
    </div>
  )
}

// スケルトン読み込みカード
function SkeletonCard({ type = 'flash' }: { type?: 'flash' | 'lottery' }) {
  const topColor = type === 'flash' ? 'bg-flash/40' : 'bg-lottery/40'
  return (
    <div className={`w-full bg-ink-soft rounded-[6px] overflow-hidden border-t-4 ${topColor} animate-pulse`}>
      <div className="h-[160px] bg-white/[0.04]" />
      <div className="p-5">
        <div className="h-4 bg-white/[0.06] rounded mb-2 w-3/4" />
        <div className="h-6 bg-white/[0.06] rounded mb-3 w-1/2" />
        <div className="h-9 bg-white/[0.06] rounded" />
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return <div className="text-muted font-mono text-[13px] tracking-[0.5px] py-8 text-center">{message}</div>
}
