// Admin page — flash and lottery management (CRUD)
// Demonstrates understanding of admin operations for DevOps/Cloud portfolio
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../stores/authStore'
import { api } from '../../services/api'
import dayjs from 'dayjs'

export default function Admin() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isAdmin, isLoggedIn } = useAuthStore()
  const [tab, setTab] = useState<'flash' | 'lottery' | 'orders'>('flash')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createType, setCreateType] = useState<'flash' | 'lottery'>('flash')
  const { data: flashList = [] } = useQuery({
    queryKey: ['flashList', 'all'],
    queryFn: api.getFlashList,
  })
  const { data: lotteryList = [] } = useQuery({
    queryKey: ['lotteryList', 'all'],
    queryFn: api.getLotteryList,
  })

  if (!isLoggedIn()) {
    navigate('/login')
    return null
  }
  if (!isAdmin()) {
    return (
      <div className="max-w-3xl mx-auto px-10 py-16 text-center">
        <div className="font-mono text-[12px] text-flash tracking-[2px] mb-4">403 FORBIDDEN</div>
        <p className="text-muted">管理者権限が必要です</p>
      </div>
    )
  }



  return (
    <div className="max-w-5xl mx-auto px-10 py-10 page-enter max-sm:px-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 max-sm:flex-col max-sm:items-start max-sm:gap-4">
        <div>
          <div className="font-mono text-[11px] text-lottery tracking-[2px] uppercase mb-1">ADMIN CONSOLE</div>
          <h1 className="font-oswald font-semibold text-[28px]">管理画面</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setCreateType('flash')
              setShowCreateModal(true)
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-flash font-oswald font-semibold text-[13px] tracking-[1px] rounded-[3px] hover:brightness-110 transition-all shadow-md">
            ＋ 新規フラッシュセール
          </button>
          <button
            onClick={() => {
              setCreateType('lottery')
              setShowCreateModal(true)
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-lottery font-oswald font-semibold text-[13px] tracking-[1px] rounded-[3px] hover:brightness-110 transition-all shadow-md">
            ＋ 新規抽選作成
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'フラッシュセール数', value: flashList.length, color: 'text-flash' },
          { label: '抽選数', value: lotteryList.length, color: 'text-lottery' },
          { label: '合計注文', value: 2, color: 'text-paper' },
          { label: '応募合計', value: 934, color: 'text-paper' },
        ].map((stat) => (
          <div key={stat.label} className="bg-ink-soft border border-white/[0.08] rounded-[4px] p-4">
            <div className={`font-oswald font-bold text-[32px] ${stat.color}`}>{stat.value}</div>
            <div className="font-mono text-[10px] text-muted tracking-[1px] mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/[0.12] mb-6">
        {(['flash', 'lottery', 'orders'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-3 font-oswald font-semibold text-[14px] tracking-[0.5px] transition-colors ${
              tab === t ? 'text-paper border-b-2 border-flash' : 'text-muted hover:text-paper'
            }`}>
            {t === 'flash' ?
              'フラッシュセール管理'
            : t === 'lottery' ?
              '抽選管理'
            : '注文確認'}
          </button>
        ))}
      </div>

      {/* Flash s table */}
      {tab === 'flash' && (
        <div className="overflow-x-auto">
          <table className="w-full admin-table">
            <thead>
              <tr>
                <th className="text-left">商品名</th>
                <th className="text-left">価格</th>
                <th className="text-left">在庫</th>
                <th className="text-left">ステータス</th>
                <th className="text-left">終了</th>
                <th className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {flashList.map((sale) => (
                <tr key={sale.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="text-paper font-medium">{sale.name}</td>
                  <td className="font-oswald text-[15px]">¥{sale.price.toLocaleString()}</td>
                  <td>
                    <span className={sale.stock < 10 ? 'text-flash' : 'text-paper'}>
                      {sale.stock}/{sale.totalStock}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`font-mono text-[10px] px-2 py-0.5 rounded-[2px] border ${
                        sale.status === 'ACTIVE' ?
                          'text-success border-success/30 bg-success/10'
                        : 'text-muted border-white/10'
                      }`}>
                      {sale.status}
                    </span>
                  </td>
                  <td className="font-mono text-[11px] text-muted">{dayjs(sale.endsAt).format('MM/DD HH:mm')}</td>
                  <td className="text-right">
                    <div className="flex gap-2 justify-end">
                      <button className="font-mono text-[10px] text-muted hover:text-paper tracking-[1px] transition-colors">
                        編集
                      </button>
                      <button className="font-mono text-[10px] text-flash hover:brightness-125 tracking-[1px] transition-colors">
                        停止
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Lottery table */}
      {tab === 'lottery' && (
        <div className="overflow-x-auto">
          <table className="w-full admin-table">
            <thead>
              <tr>
                <th className="text-left">抽選名</th>
                <th className="text-left">当選枠</th>
                <th className="text-left">応募数</th>
                <th className="text-left">ステータス</th>
                <th className="text-left">締切</th>
                <th className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {lotteryList.map((item) => (
                <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="text-paper font-medium">{item.name}</td>
                  <td className="font-oswald text-[15px] text-lottery">{item.winnerCount}</td>
                  <td className="font-oswald text-[15px]">{item.applyCount.toLocaleString()}</td>
                  <td>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded-[2px] border text-lottery border-lottery/30 bg-lottery/10">
                      {item.status}
                    </span>
                  </td>
                  <td className="font-mono text-[11px] text-muted">
                    {dayjs(item.applyDeadline).format('MM/DD HH:mm')}
                  </td>
                  <td className="text-right">
                    <div className="flex gap-2 justify-end">
                      <button className="font-mono text-[10px] text-muted hover:text-paper tracking-[1px]">編集</button>
                      <button className="font-mono text-[10px] text-lottery hover:brightness-125 tracking-[1px]">
                        抽選実行
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Orders */}
      {tab === 'orders' && (
        <div className="text-center py-12 text-muted font-mono text-[13px] tracking-[0.5px]">
          注文確認機能は実装中です（Lambda OrderCreator 連携後）
        </div>
      )}

      {/* Create modal */}
      {showCreateModal && (
        <CreateModal
          type={createType}
          onClose={() => {
            setShowCreateModal(false)
            queryClient.invalidateQueries({ queryKey: ['flashList'] })
            queryClient.invalidateQueries({ queryKey: ['lotteryList'] })
          }}
        />
      )}
    </div>
  )
}

function CreateModal({ type, onClose }: { type: 'flash' | 'lottery'; onClose: () => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [priceOrWinners, setPriceOrWinners] = useState('')
  const [stockOrDeadline, setStockOrDeadline] = useState('')
  const [description, setDescription] = useState('')
  const [specText, setSpecText] = useState('')
  const [rulesText, setRulesText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) return
    setIsSubmitting(true)
    const specifications = specText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const parts = l.split(/[:：]/)
        return { label: parts[0]?.trim() ?? '仕様', value: parts.slice(1).join(':').trim() || '詳細参照' }
      })

    const rules = rulesText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    if (type === 'flash') {
      await api.createFlash({
        name,
        category: category.trim() || '限定アイテム',
        price: Number(priceOrWinners) || 9800,
        stock: Number(stockOrDeadline) || 100,
        description,
        specifications: specifications.length > 0 ? specifications : undefined,
        rules: rules.length > 0 ? rules : undefined,
      })
    } else {
      await api.createLottery({
        name,
        category: category.trim() || '限定アイテム',
        price: 0,
        winnerCount: Number(priceOrWinners) || 10,
        description,
        specifications: specifications.length > 0 ? specifications : undefined,
        rules: rules.length > 0 ? rules : undefined,
      })
    }
    setIsSubmitting(false)
    setSaved(true)
    setTimeout(onClose, 800)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop bg-black/70 animate-fade-in">
      <div className="bg-ink-soft border border-white/[0.12] rounded-[6px] w-full max-w-[520px] mx-4 overflow-hidden animate-slide-up max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.12]">
          <span className="font-oswald font-semibold text-[16px] flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${type === 'flash' ? 'bg-flash' : 'bg-lottery'}`} />
            {type === 'flash' ? '新規フラッシュセール作成' : '新規抽選作成'}
          </span>
          <button onClick={onClose} className="text-muted hover:text-paper text-[20px]">
            ×
          </button>
        </div>
        <div className="p-6 flex flex-col gap-3.5 overflow-y-auto">
          <div>
            <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1">
              {type === 'flash' ? '商品名 (Single SKU)' : '抽選イベント名'}
            </label>
            <input
              className="input-dark"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                type === 'flash' ? '例: VELO × ZUKI コラボスニーカー (26.5cm)' : '例: 限定サイン入りポスター'
              }
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1">カテゴリ</label>
              <input
                className="input-dark"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="例: 限定スニーカー"
              />
            </div>
            <div>
              <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1">
                {type === 'flash' ? '価格 (¥)' : '当選枠数'}
              </label>
              <input
                className="input-dark"
                type="number"
                value={priceOrWinners}
                onChange={(e) => setPriceOrWinners(e.target.value)}
                placeholder={type === 'flash' ? '29800' : '10'}
              />
            </div>
            <div>
              <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1">
                {type === 'flash' ? '在庫数' : '応募締切'}
              </label>
              <input
                className="input-dark"
                value={stockOrDeadline}
                onChange={(e) => setStockOrDeadline(e.target.value)}
                placeholder={type === 'flash' ? '50' : '7日後'}
              />
            </div>
          </div>

          <div>
            <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1">商品説明</label>
            <textarea
              className="input-dark h-14 resize-none text-[12px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="商品の詳細説明を入力してください"
            />
          </div>

          <div>
            <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1">
              商品スペック（S3 Payload: 1行に「項目: 値」）
            </label>
            <textarea
              className="input-dark h-16 resize-none text-[12px]"
              value={specText}
              onChange={(e) => setSpecText(e.target.value)}
              placeholder="型番: VZ-2026-OG&#10;カラー: RETRO RED&#10;発送: 2-4日以内"
            />
          </div>

          <div>
            <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1">
              注意事項・規約（S3 Payload: 1行に1項目）
            </label>
            <textarea
              className="input-dark h-16 resize-none text-[12px]"
              value={rulesText}
              onChange={(e) => setRulesText(e.target.value)}
              placeholder="お1人様1点まで&#10;転売目的の購入禁止&#10;BOT使用検知時自動キャンセル"
            />
          </div>

          {saved ?
            <div className="text-center py-2 text-success font-mono text-[12px] tracking-[1px]">✓ 作成完了しました</div>
          : <button
              disabled={isSubmitting || !name.trim()}
              className={`btn-base mt-1 ${type === 'flash' ? 'bg-flash' : 'bg-lottery'} ${
                !name.trim() ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              onClick={handleSave}>
              {isSubmitting ?
                '作成処理中...'
              : type === 'flash' ?
                'フラッシュセールを作成'
              : '抽選イベントを作成'}
            </button>
          }
        </div>
      </div>
    </div>
  )
}
