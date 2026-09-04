// Admin page — flash and lottery management (create + list)
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../stores/authStore'
import { api } from '../../services/api'
import { uploadImage } from '../../services/request'
import dayjs from 'dayjs'

export default function Admin() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isAdmin, isLoggedIn } = useAuthStore()
  const [tab, setTab] = useState<'flash' | 'lottery'>('flash')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createType, setCreateType] = useState<'flash' | 'lottery'>('flash')

  // 管理画面用の一覧（終了済みも含む全件）。未ログイン・非管理者のときはリクエストしない
  const { data: flashList = [] } = useQuery({
    queryKey: ['adminFlashList'],
    queryFn: api.adminGetFlashList,
    enabled: isLoggedIn() && isAdmin(),
  })
  const { data: lotteryList = [] } = useQuery({
    queryKey: ['adminLotteryList'],
    queryFn: api.adminGetLotteryList,
    enabled: isLoggedIn() && isAdmin(),
  })

  // 未ログインならログイン画面へ移動する（render中にnavigateしないようにuseEffectで行う）
  useEffect(() => {
    if (!isLoggedIn()) {
      navigate('/login')
    }
  }, [isLoggedIn, navigate])

  if (!isLoggedIn()) {
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

      {/* Tabs */}
      <div className="flex border-b border-white/[0.12] mb-6">
        {(['flash', 'lottery'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-3 font-oswald font-semibold text-[14px] tracking-[0.5px] transition-colors ${
              tab === t ? 'text-paper border-b-2 border-flash' : 'text-muted hover:text-paper'
            }`}>
            {t === 'flash' ? `フラッシュセール管理 (${flashList.length})` : `抽選管理 (${lotteryList.length})`}
          </button>
        ))}
      </div>

      {/* Flash table */}
      {tab === 'flash' && (
        <div className="overflow-x-auto">
          <table className="w-full admin-table">
            <thead>
              <tr>
                <th className="text-left">商品名</th>
                <th className="text-left">価格</th>
                <th className="text-left">在庫</th>
                <th className="text-left">ステータス</th>
                <th className="text-left">開始 / 終了</th>
              </tr>
            </thead>
            <tbody>
              {flashList.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-10 font-mono text-[13px]">
                    商品がありません
                  </td>
                </tr>
              )}
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
                        sale.status === 'ACTIVE' ? 'text-success border-success/30 bg-success/10'
                        : sale.status === 'UPCOMING' ? 'text-lottery border-lottery/30 bg-lottery/10'
                        : 'text-muted border-white/10'
                      }`}>
                      {sale.status}
                    </span>
                  </td>
                  <td className="font-mono text-[11px] text-muted">
                    {dayjs(sale.startsAt).format('MM/DD HH:mm')} → {dayjs(sale.endsAt).format('MM/DD HH:mm')}
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
                <th className="text-left">当選時支払額</th>
                <th className="text-left">ステータス</th>
                <th className="text-left">締切</th>
              </tr>
            </thead>
            <tbody>
              {lotteryList.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-10 font-mono text-[13px]">
                    抽選がありません
                  </td>
                </tr>
              )}
              {lotteryList.map((item) => (
                <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="text-paper font-medium">{item.name}</td>
                  <td className="font-oswald text-[15px] text-lottery">{item.winnerCount}</td>
                  <td className="font-oswald text-[15px]">{item.applyCount.toLocaleString()}</td>
                  <td className="font-oswald text-[15px]">
                    ¥{item.chosenPrice.toLocaleString()}
                    {item.price === 0 && <span className="text-[10px] text-muted font-normal ml-1">応募無料</span>}
                  </td>
                  <td>
                    <span
                      className={`font-mono text-[10px] px-2 py-0.5 rounded-[2px] border ${
                        item.status === 'ACTIVE' ? 'text-success border-success/30 bg-success/10'
                        : item.status === 'UPCOMING' || item.status === 'DRAWING' ?
                          'text-lottery border-lottery/30 bg-lottery/10'
                        : 'text-muted border-white/10'
                      }`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="font-mono text-[11px] text-muted">
                    {dayjs(item.applyDeadline).format('MM/DD HH:mm')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showCreateModal && (
        <CreateModal
          type={createType}
          onClose={() => {
            setShowCreateModal(false)
            // 管理画面・ユーザー向け一覧・ホームのTop10をすべて更新する
            queryClient.invalidateQueries({ queryKey: ['adminFlashList'] })
            queryClient.invalidateQueries({ queryKey: ['adminLotteryList'] })
            queryClient.invalidateQueries({ queryKey: ['flashList'] })
            queryClient.invalidateQueries({ queryKey: ['lotteryList'] })
            queryClient.invalidateQueries({ queryKey: ['HomeTop10'] })
          }}
        />
      )}
    </div>
  )
}

function CreateModal({ type, onClose }: { type: 'flash' | 'lottery'; onClose: () => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [price, setPrice] = useState('')
  const [chosenPrice, setChosenPrice] = useState('')
  const [stock, setStock] = useState('')
  const [winnerCount, setWinnerCount] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [applyDeadline, setApplyDeadline] = useState('')
  const [drawAt, setDrawAt] = useState('')
  const [description, setDescription] = useState('')
  const [specText, setSpecText] = useState('')
  const [rulesText, setRulesText] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  // 画像を選択したらプレビューを表示する（アップロードは作成時に行う）
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const handleSave = async () => {
    if (!name.trim()) return
    setIsSubmitting(true)
    setError('')

    // 商品仕様（「項目: 値」を1行1項目）と注意事項（1行1項目）をパースする
    const specifications = specText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const parts = l.split(/[:：]/)
        return { label: parts[0]?.trim() ?? '仕様', value: parts.slice(1).join(':').trim() || '詳細参照' }
      })
    const rules = rulesText.split('\n').map((l) => l.trim()).filter(Boolean)

    try {
      // 画像が選択されていれば先にS3へアップロードし、そのkeyを商品に紐付ける
      let imageS3Key: string | undefined
      if (imageFile) {
        const uploaded = await uploadImage(imageFile, type === 'flash' ? 'products' : 'lottery')
        imageS3Key = uploaded.key
      }

      if (type === 'flash') {
        await api.createFlash({
          name,
          category: category.trim() || '限定アイテム',
          price: Number(price) || 0,
          stock: Number(stock) || 0,
          description,
          startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
          endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
          imageS3Key,
          specifications: specifications.length > 0 ? specifications : undefined,
          rules: rules.length > 0 ? rules : undefined,
        })
      } else {
        await api.createLottery({
          name,
          category: category.trim() || '限定アイテム',
          price: Number(price) || 0,
          chosenPrice: Number(chosenPrice) || 0,
          winnerCount: Number(winnerCount) || 10,
          description,
          startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
          applyDeadline: applyDeadline ? new Date(applyDeadline).toISOString() : undefined,
          drawAt: drawAt ? new Date(drawAt).toISOString() : undefined,
          imageS3Key,
          specifications: specifications.length > 0 ? specifications : undefined,
          rules: rules.length > 0 ? rules : undefined,
        })
      }
      setSaved(true)
      setTimeout(onClose, 800)
    } catch (e) {
      setError(e instanceof Error ? e.message : '作成に失敗しました')
    } finally {
      // 成功・失敗どちらでも処理中フラグを必ず戻す（ボタンが固まらないように）
      setIsSubmitting(false)
    }
  }

  const flashMode = type === 'flash'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop bg-black/70 animate-fade-in">
      <div className="bg-ink-soft border border-white/[0.12] rounded-[6px] w-full max-w-[560px] mx-4 overflow-hidden animate-slide-up max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.12]">
          <span className="font-oswald font-semibold text-[16px] flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${flashMode ? 'bg-flash' : 'bg-lottery'}`} />
            {flashMode ? '新規フラッシュセール作成' : '新規抽選作成'}
          </span>
          <button onClick={onClose} className="text-muted hover:text-paper text-[20px]">
            ×
          </button>
        </div>
        <div className="p-6 flex flex-col gap-3.5 overflow-y-auto">
          {/* 名称 */}
          <div>
            <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1">
              {flashMode ? '商品名' : '抽選イベント名'}
            </label>
            <input
              className="input-dark"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={flashMode ? '例: 限定クリアファイル' : '例: 限定サイン入りポスター'}
            />
          </div>

          {/* 商品画像（S3へ直接アップロード。作成時にkeyを商品へ紐付ける） */}
          <div>
            <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1">
              商品画像（JPEG / PNG / WebP）
            </label>
            <div className="flex items-center gap-3">
              {imagePreview && (
                <img
                  src={imagePreview}
                  alt="プレビュー"
                  className="w-14 h-14 object-cover rounded-[3px] border border-white/[0.12] flex-none"
                />
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageSelect}
                className="font-mono text-[11px] text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-[2px] file:border-0 file:bg-white/10 file:text-paper file:font-mono file:text-[11px] hover:file:bg-white/20"
              />
            </div>
          </div>

          {/* カテゴリ + 金額 */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1">カテゴリ</label>
              <input
                className="input-dark"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="例: 限定グッズ"
              />
            </div>
            <div>
              <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1">
                {flashMode ? '価格 (¥)' : '応募費 (¥)'}
              </label>
              <input
                className="input-dark"
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={flashMode ? '29800' : '0'}
              />
            </div>
            {!flashMode && (
              <div>
                <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1">
                  当選時支払額 (¥)
                </label>
                <input
                  className="input-dark"
                  type="number"
                  min={0}
                  value={chosenPrice}
                  onChange={(e) => setChosenPrice(e.target.value)}
                  placeholder="12000"
                />
              </div>
            )}
            {flashMode && (
              <div>
                <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1">在庫数</label>
                <input
                  className="input-dark"
                  type="number"
                  min={0}
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  placeholder="50"
                />
              </div>
            )}
          </div>

          {/* 抽選のみ: 当選枠数 */}
          {!flashMode && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1">
                  当選枠数
                </label>
                <input
                  className="input-dark"
                  type="number"
                  min={1}
                  value={winnerCount}
                  onChange={(e) => setWinnerCount(e.target.value)}
                  placeholder="10"
                />
              </div>
            </div>
          )}

          {/* 期間（datetime-local は幅が必要なため、抽選は縦積みにして各入力欄を全幅表示する） */}
          <div className={`grid ${flashMode ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
            <div>
              <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1">
                {flashMode ? '開始日時' : '応募開始'}
              </label>
              <input
                className="input-dark"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div>
              <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1">
                {flashMode ? '終了日時' : '応募締切'}
              </label>
              <input
                className="input-dark"
                type="datetime-local"
                value={flashMode ? endsAt : applyDeadline}
                onChange={(e) => {
                  const v = e.target.value
                  if (flashMode) {
                    setEndsAt(v)
                  } else {
                    setApplyDeadline(v)
                    // 抽選日を締切の翌日に自動設定する（ユーザーが後から変更も可能）
                    setDrawAt(v ? formatDateTimeLocal(new Date(new Date(v).getTime() + 24 * 60 * 60 * 1000)) : '')
                  }
                }}
              />
            </div>
            {!flashMode && (
              <div>
                <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1">抽選日</label>
                <input
                  className="input-dark"
                  type="datetime-local"
                  value={drawAt}
                  onChange={(e) => setDrawAt(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* 説明 */}
          <div>
            <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1">商品説明</label>
            <textarea
              className="input-dark h-14 resize-none text-[12px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="商品の詳細説明を入力してください"
            />
          </div>

          {/* 商品仕様（S3 Payload予定） */}
          <div>
            <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1">
              商品仕様（1行に「項目: 値」）
            </label>
            <textarea
              className="input-dark h-16 resize-none text-[12px]"
              value={specText}
              onChange={(e) => setSpecText(e.target.value)}
              placeholder={'型番: VZ-2026\nカラー: RETRO RED\n発送: 2-4日以内'}
            />
          </div>

          {/* 注意事項・規約（S3 Payload予定） */}
          <div>
            <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1">
              注意事項・購入規約（1行に1項目）
            </label>
            <textarea
              className="input-dark h-16 resize-none text-[12px]"
              value={rulesText}
              onChange={(e) => setRulesText(e.target.value)}
              placeholder={'お1人様1点まで\n転売目的の購入禁止\nBOT使用検知時自動キャンセル'}
            />
          </div>

          <p className="font-mono text-[10px] text-muted tracking-[0.5px]">
            ※ 時間を未入力の場合は
            {flashMode ? ' 即時開始・24時間後終了' : ' 即時開始・7日後締切・抽選は締切翌日'}
            に設定されます
          </p>

          {error && <div className="text-flash font-mono text-[12px] tracking-[0.5px]">{error}</div>}

          {saved ?
            <div className="text-center py-2 text-success font-mono text-[12px] tracking-[1px]">✓ 作成完了しました</div>
          : <button
              disabled={isSubmitting || !name.trim()}
              className={`btn-base mt-1 ${flashMode ? 'bg-flash' : 'bg-lottery'} ${
                !name.trim() ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              onClick={handleSave}>
              {isSubmitting ?
                '作成処理中...'
              : flashMode ?
                'フラッシュセールを作成'
              : '抽選イベントを作成'}
            </button>
          }
        </div>
      </div>
    </div>
  )
}

// datetime-local 入力欄の値（YYYY-MM-DDTHH:mm、ローカル時刻）にフォーマットする
function formatDateTimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
