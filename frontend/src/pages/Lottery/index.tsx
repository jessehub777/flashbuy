// 抽選詳細ページ — 応募情報・倍率計算・閲覧数・応募確認
import { useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Countdown from '../../components/Countdown'
import { api } from '../../services/api'
import { useOrderStore } from '../../stores/orderStore'
import { useAuthStore } from '../../stores/authStore'
import dayjs from 'dayjs'

export default function LotteryDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { isLoggedIn } = useAuthStore()
  const { applyLottery, applyStatus, isApplied, resetApplyStatus } = useOrderStore()
  const [applied, setApplied] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // IDで抽選情報を取得する（閲覧数を1プラスする）
  const { data: item, isLoading } = useQuery({
    queryKey: ['lottery', id],
    queryFn: () => api.getLotteryById(id!),
    enabled: !!id,
  })

  const alreadyApplied = applied || (id ? isApplied(id) : false)
  const winRate = item ? ((item.winnerCount / Math.max(item.applyCount + 1, 1)) * 100).toFixed(1) : '0'

  const handleApply = async () => {
    if (!isLoggedIn()) {
      // ログインしていない場合はログイン画面へ
      navigate('/login', { state: { from: location } })
      return
    }
    setShowConfirm(false)
    await applyLottery(id!)
    setApplied(true)
    resetApplyStatus()
  }

  if (isLoading) return <LoadingSkeleton />
  if (!item) return <div className="p-10 text-muted font-mono">指定された抽選が見つかりません</div>

  const isActive = item.status === 'ACTIVE'

  return (
    <div className="max-w-5xl mx-auto px-10 py-10 page-enter max-sm:px-5">
      {/* 戻るボタン */}
      <button
        onClick={() => navigate(-1)}
        className="font-mono text-[12px] text-muted hover:text-paper transition-colors mb-8 flex items-center gap-2 tracking-[1px]">
        ← 戻る
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        {/* 左側：商品画像と倍率表示 */}
        <div>
          <div
            className="w-full aspect-square rounded-[6px] overflow-hidden relative shadow-xl"
            style={{ background: 'linear-gradient(135deg, #dce4f5, #c5d3ee)' }}>
            {/* 商品ID表示 */}
            <div className="absolute top-4 left-4 font-mono text-[11px] tracking-[1px] bg-ink text-paper px-2 py-[3px] rounded-[2px] z-10">
              {item.id}
            </div>
            {/* ステータスタグ（予告: パープル, 応募済: エメラルド, 受付中: ブルー, 抽選中: アンバー, 終了: ダークグレー） */}
            <div className="absolute top-4 right-4 flex items-center gap-1.5 z-10">
              {item.status === 'UPCOMING' && !alreadyApplied && (
                <span className="font-mono text-[10px] tracking-[1px] font-semibold px-[9px] py-1 rounded-[2px] bg-purple-500 text-white shadow-sm">
                  予告
                </span>
              )}
              {alreadyApplied && (
                <span className="font-mono text-[10px] tracking-[1px] font-semibold px-[9px] py-1 rounded-[2px] bg-emerald-600 text-white shadow-sm">
                  応募済
                </span>
              )}
              {!alreadyApplied && isActive && (
                <span className="font-mono text-[10px] tracking-[1px] font-semibold px-[9px] py-1 rounded-[2px] bg-lottery text-paper">
                  受付中
                </span>
              )}
              {item.status === 'DRAWING' && (
                <span className="font-mono text-[10px] tracking-[1px] font-bold px-[9px] py-1 rounded-[2px] bg-amber-500 text-black animate-pulse shadow-sm">
                  抽選中
                </span>
              )}
              {!alreadyApplied && item.status !== 'UPCOMING' && !isActive && item.status !== 'DRAWING' && (
                <span className="font-mono text-[10px] tracking-[1px] font-semibold px-[9px] py-1 rounded-[2px] bg-black/75 text-white/60 border border-white/20">
                  終了
                </span>
              )}
            </div>
            {/* 閲覧数バッジ */}
            <div className="absolute bottom-4 left-4 font-mono text-[11px] tracking-[0.5px] bg-black/60 text-white/90 px-2.5 py-1 rounded-[2px] backdrop-blur-sm z-10 flex items-center gap-1.5">
              <span>🔥</span> {item.viewCount.toLocaleString()} 回閲覧されています
            </div>
            {/* プレースホルダー表示 */}
            <div className="w-full h-full flex items-center justify-center">
              <span className="font-oswald font-bold text-[80px] text-lottery/20">{item.name.slice(0, 2)}</span>
            </div>
          </div>

          {/* 当選確率・応募枠の数値カード */}
          <div className="mt-4 bg-ink-soft border border-white/[0.08] rounded-[4px] p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="font-oswald font-bold text-[28px] text-lottery">{item.winnerCount}</div>
                <div className="font-mono text-[10px] text-muted tracking-[1px]">当選枠</div>
              </div>
              <div>
                <div className="font-oswald font-bold text-[28px] text-paper">{item.applyCount.toLocaleString()}</div>
                <div className="font-mono text-[10px] text-muted tracking-[1px]">応募者数</div>
              </div>
              <div>
                <div className="font-oswald font-bold text-[28px] text-paper">{winRate}%</div>
                <div className="font-mono text-[10px] text-muted tracking-[1px]">推定当選率</div>
              </div>
            </div>
          </div>
        </div>

        {/* 右側：抽選概要と応募ボタン */}
        <div>
          <div className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase mb-2">{item.category}</div>
          <h1 className="font-oswald font-semibold text-[32px] leading-[1.1] mb-3 text-paper">{item.name}</h1>
          <div className="font-oswald font-bold text-[36px] text-paper mb-1">
            {item.price === 0 ?
              <span>
                ¥0 <span className="text-[16px] font-normal text-muted">応募無料</span>
              </span>
            : <>
                <span className="text-[18px] font-normal text-muted mr-1">¥</span>
                {item.price.toLocaleString()}
              </>
            }
          </div>

          <p className="text-[14px] text-muted leading-[1.8] mt-4 mb-8">{item.description}</p>

          {/* Countdown — UPCOMING / DRAWING / 通常受付のステータス表示 */}
          <div className="bg-ink-soft border border-white/[0.08] rounded-[4px] p-4 mb-4">
            {item.status === 'UPCOMING' ?
              <>
                <div className="font-mono text-[10px] text-purple-400 tracking-[1.5px] uppercase mb-3">
                  応募開始まで
                </div>
                <Countdown targetDate={item.startsAt} label="" showDays expiredText="受付開始" />
              </>
            : item.status === 'DRAWING' ?
              <>
                <div className="font-mono text-[10px] text-amber-400 tracking-[1.5px] uppercase mb-3 font-semibold">
                  ステータス: 抽選集計中
                </div>
                <Countdown targetDate={item.applyDeadline} label="" showDays={false} expiredText="受付終了（抽選集計中）" />
              </>
            : !isActive ?
              <>
                <div className="font-mono text-[10px] text-muted tracking-[1.5px] uppercase mb-3 font-semibold">
                  ステータス: 応募受付終了
                </div>
                <Countdown targetDate={item.applyDeadline} label="" showDays={false} expiredText="受付終了" />
              </>
            : <>
                <div className="font-mono text-[10px] text-muted tracking-[1.5px] uppercase mb-3">応募締切まで</div>
                <Countdown targetDate={item.applyDeadline} label="" showDays expiredText="受付終了" />
              </>
            }
          </div>

          {/* Draw schedule */}
          <div className="font-mono text-[11px] text-muted tracking-[0.5px] mb-6">
            抽選日時: {dayjs(item.drawAt).format('YYYY年MM月DD日 HH:mm')}
          </div>

          {/* 応募ボタン — UPCOMING: 予告（無効）, ACTIVE: 応募可能, DRAWING以降: 受付終了 */}
          {alreadyApplied ?
            <div className="flex items-center gap-3 p-4 bg-emerald-600/10 border border-emerald-500/30 rounded-[4px]">
              <svg className="w-5 h-5 text-emerald-400 flex-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <div className="text-emerald-400 font-semibold text-[14px]">応募済み</div>
                <div className="font-mono text-[10px] text-muted mt-0.5 tracking-[0.5px]">
                  抽選結果はマイページでご確認いただけます
                </div>
              </div>
            </div>
          : item.status === 'UPCOMING' ?
            /* 予告：応募ボタンを disabled 表示 */
            <div>
              <button
                className="btn-base py-3 text-[15px] opacity-40 cursor-not-allowed bg-purple-500/20 text-purple-300 border border-purple-500/30"
                disabled>
                予告
              </button>
              <p className="font-mono text-[10px] text-purple-400 mt-2 text-center tracking-[0.5px]">
                応募開始: {dayjs(item.startsAt).format('MM/DD HH:mm')} から受付開始
              </p>
            </div>
          : !isActive ?
            <div className="p-4 bg-white/[0.04] border border-white/[0.1] rounded-[4px] text-center">
              <div className="text-paper/70 font-semibold text-[14px]">
                {item.status === 'DRAWING' ? '受付終了（抽選集計中）' : '受付終了'}
              </div>
              <div className="font-mono text-[10px] text-muted mt-1 tracking-[0.5px]">
                {item.status === 'DRAWING' ?
                  '現在抽選の集計を行っております。当落発表までお待ちください。'
                : 'この抽選イベントの応募受付は終了しました。'}
              </div>
            </div>
          : <>
              <button
                className="btn-base bg-lottery py-3 text-[15px]"
                onClick={() => setShowConfirm(true)}
                disabled={applyStatus === 'applying'}>
                {applyStatus === 'applying' ? '応募中...' : '抽選に応募する'}
              </button>
              <p className="font-mono text-[10px] text-muted mt-2 text-center tracking-[0.5px]">
                応募は無料 / 一人につき1回まで
              </p>
            </>
          }
        </div>
      </div>

      {/* S3静的拡張データ：商品スペック・応募規約 (シングルSKU汎用設計) */}
      {(item.specifications?.length || item.rules?.length) && (
        <div className="mt-12 pt-8 border-t border-white/[0.1] animate-fade-in">
          <h2 className="font-oswald font-semibold text-[20px] text-paper mb-6 tracking-[0.5px] flex items-center gap-2">
            <span className="w-1.5 h-4 bg-lottery rounded-full inline-block" />
            商品仕様・応募規約（S3 Payload）
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-ink-soft border border-white/[0.08] rounded-[6px] p-6">
            {/* 仕様 Key-Value */}
            {item.specifications && item.specifications.length > 0 && (
              <div className="space-y-4 font-mono text-[12px]">
                {item.specifications.map((spec, idx) => (
                  <div key={idx}>
                    <span className="text-muted tracking-[1px] block text-[10px] uppercase mb-1">{spec.label}</span>
                    <span className="text-paper font-medium">{spec.value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 注意事項・規約リスト */}
            {item.rules && item.rules.length > 0 && (
              <div className="border-l border-white/[0.08] pl-6 max-md:border-l-0 max-md:pl-0 max-md:pt-4 max-md:border-t">
                <span className="font-mono text-[10px] text-muted tracking-[1px] uppercase block mb-2">
                  注意事項・応募規約
                </span>
                <ul className="space-y-2 text-[12.5px] text-paper/80 leading-[1.6] list-disc list-inside">
                  {item.rules.map((rule, idx) => (
                    <li key={idx}>{rule}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop bg-black/70 animate-fade-in">
          <div className="bg-ink-soft border border-white/[0.12] rounded-[6px] w-full max-w-[380px] mx-4 p-6 animate-slide-up">
            <h3 className="font-oswald font-semibold text-[18px] mb-2">応募を確認</h3>
            <p className="text-[14px] text-muted mb-1">{item.name}</p>
            <p className="font-mono text-[11px] text-muted mb-5 tracking-[0.5px]">
              現在の当選確率: 約 {winRate}%（{item.applyCount.toLocaleString()}人中{item.winnerCount}名当選）
            </p>
            <div className="flex gap-3">
              <button
                className="flex-1 py-2.5 border border-white/[0.12] text-muted font-oswald font-semibold text-[13px] tracking-[1px] uppercase rounded-[3px] hover:border-white/25 transition-colors"
                onClick={() => setShowConfirm(false)}>
                キャンセル
              </button>
              <button className="btn-base bg-lottery flex-1" onClick={handleApply}>
                応募する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
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
  )
}
