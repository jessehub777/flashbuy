// 抽選一覧ページ — /lottery ルート（平铺グリッド表示・カテゴリ絞り込み・人気順ソート機能）
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { LotteryTicket } from '../../components/TicketCard'
import { api } from '../../services/api'
import { useOrderStore } from '../../stores/orderStore'
import { useAuthStore } from '../../stores/authStore'
import dayjs from 'dayjs'

type SortOption = 'popular' | 'deadline' | 'winners'

export default function LotteryList() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL')
  const [sortBy, setSortBy] = useState<SortOption>('popular')

  // 抽選一覧データを取得する
  const { data: lotteryList = [], isLoading } = useQuery({
    queryKey: ['lotteryList'],
    queryFn: api.getLotteryList,
  })

  const { appliedIds } = useOrderStore()
  const { isLoggedIn } = useAuthStore()

  // ログイン中のみ「自分の応募一覧」をサーバーから取得する
  // （appliedIdsはメモリ上だけなので、ページリロード後も応募済みを正しく表示するため）
  const { data: myApplications = [] } = useQuery({
    queryKey: ['myLotteryApplications'],
    queryFn: api.getMyLotteryApplicationList,
    enabled: isLoggedIn(),
  })

  // カテゴリ一覧を抽出する
  const categories = useMemo(() => {
    const set = new Set<string>()
    lotteryList.forEach((l) => {
      if (l.category) set.add(l.category)
    })
    return Array.from(set)
  }, [lotteryList])

  // 検索・カテゴリ・ソート条件でフィルタリングする
  const filtered = useMemo(() => {
    let result = [...lotteryList]

    // 検索キーワードで絞り込む
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.category.toLowerCase().includes(q) ||
          l.description.toLowerCase().includes(q),
      )
    }

    // カテゴリで絞り込む
    if (selectedCategory !== 'ALL') {
      result = result.filter((l) => l.category === selectedCategory)
    }

    // 並び替え（人気順・締切が近い順・当選枠が多い順）
    result.sort((a, b) => {
      if (sortBy === 'popular') return b.viewCount - a.viewCount // 閲覧数が多い順
      if (sortBy === 'deadline') return dayjs(a.applyDeadline).valueOf() - dayjs(b.applyDeadline).valueOf() // 締切が近い順
      if (sortBy === 'winners') return b.winnerCount - a.winnerCount // 当選枠が多い順
      return 0
    })

    return result
  }, [lotteryList, searchQuery, selectedCategory, sortBy])

  return (
    <div className="min-h-screen page-enter">
      {/* ページヘッダー */}
      <section className="px-10 pt-12 pb-10 border-b border-white/[0.12] bg-gradient-to-b from-lottery/[0.05] to-transparent max-sm:px-5 max-sm:pt-8 max-sm:pb-7">
        <div className="font-mono text-[11px] text-lottery tracking-[2px] uppercase mb-3">● LOTTERY</div>
        <h1 className="font-oswald font-semibold text-[48px] leading-[1.05] tracking-[-0.5px] mb-3 max-sm:text-[32px]">
          抽選一覧
        </h1>
        <p className="text-muted text-[14px] max-w-[520px]">
          公平な自動抽選。応募締切まで無料または定額で応募可能。抽選結果はマイページで確認できます。
        </p>
      </section>

      {/* フィルター・検索・ソートコントロールバー */}
      <div className="px-10 pt-8 pb-6 max-sm:px-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          {/* 検索入力フォーム */}
          <div className="flex gap-2 items-center max-w-[400px] w-full">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="抽選名・キーワードで検索..."
              className="input-dark flex-1 text-[13px]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="font-mono text-[11px] text-muted hover:text-paper transition-colors whitespace-nowrap">
                クリア
              </button>
            )}
          </div>

          {/* ソート順選択 */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted whitespace-nowrap">並び替え:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="input-dark py-2 text-[12px] cursor-pointer">
              <option value="popular">🎯 人気順（閲覧数順）</option>
              <option value="deadline">⏰ 締切が近い順</option>
              <option value="winners">🏆 当選枠が多い順</option>
            </select>
          </div>
        </div>

        {/* カテゴリフィルタータブ */}
        <div className="flex gap-2 flex-wrap items-center border-b border-white/[0.08] pb-4">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1.5 rounded-[3px] font-mono text-[11px] tracking-[0.5px] transition-all ${
              selectedCategory === 'ALL' ?
                'bg-lottery text-paper font-semibold'
              : 'bg-white/[0.04] text-muted hover:text-paper'
            }`}>
            すべて ({lotteryList.length})
          </button>
          {categories.map((cat) => {
            const count = lotteryList.filter((l) => l.category === cat).length
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-[3px] font-mono text-[11px] tracking-[0.5px] transition-all ${
                  selectedCategory === cat ?
                    'bg-lottery text-paper font-semibold'
                  : 'bg-white/[0.04] text-muted hover:text-paper'
                }`}>
                {cat} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* 商品平铺（グリッド）表示エリア */}
      <div className="px-10 pb-12 max-sm:px-5">
        <div className="flex items-baseline gap-[14px] mb-6">
          <h2 className="font-oswald font-semibold text-[20px] tracking-[0.5px] text-lottery">
            {selectedCategory === 'ALL' ? '応募受付中・抽選中のアイテム' : selectedCategory}
          </h2>
          {!isLoading && <span className="font-mono text-[12px] text-muted">{filtered.length} 件該当</span>}
        </div>

        {isLoading ?
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        : filtered.length === 0 ?
          <EmptyState query={searchQuery} />
        : <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
            {filtered.map((item) => (
              <LotteryTicket
                key={item.id}
                item={item}
                applied={appliedIds.has(item.id) || myApplications.some((a) => a.lotteryId === item.id)}
              />
            ))}
          </div>
        }
      </div>

      {/* トップへ戻る */}
      <div className="px-10 pb-16 max-sm:px-5">
        <Link
          to="/"
          className="font-mono text-[12px] text-muted hover:text-paper transition-colors tracking-[1px] no-underline">
          ← トップページへ戻る
        </Link>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="w-full bg-ink-soft rounded-[6px] overflow-hidden border-t-4 border-lottery/40 animate-pulse">
      <div className="h-[160px] bg-white/[0.04]" />
      <div className="p-5">
        <div className="h-4 bg-white/[0.06] rounded mb-2 w-3/4" />
        <div className="h-6 bg-white/[0.06] rounded mb-3 w-1/2" />
        <div className="h-9 bg-white/[0.06] rounded" />
      </div>
    </div>
  )
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="py-24 text-center">
      <div className="font-oswald font-bold text-[60px] text-white/[0.04] mb-4">NO LOTTERIES</div>
      <p className="font-mono text-[13px] text-muted tracking-[1px]">
        {query ? `「${query}」に一致する抽選が見つかりませんでした` : '現在該当する抽選はありません'}
      </p>
    </div>
  )
}
