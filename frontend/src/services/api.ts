// Mock API サービス — ポートフォリオ用のデモデータ
// 本番では Go API への axios 呼び出しに差し替える
// ※ 登場する人名・グループ名・作品名・ブランド名はすべて架空のものです

import dayjs from 'dayjs'
import type {
  FlashItem,
  LotteryItem,
  FlashOrderItem,
  LotteryOrderItem,
  FlashStatus,
  LotteryStatus,
  MockPaymentPayload,
  MockPaymentResult,
  HomeTop10,
} from '../types'
import { request, toImageUrl } from './request'

// 少し待ってからデータを返す（ネットワーク遅延を再現する）
const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms))

const now = dayjs()

// ===== 動的ステータス計算 =====

// フラッシュセールの状態を「時刻」と「在庫」から計算する
// 優先順位: UPCOMING → ENDED → SOLD_OUT → ACTIVE
export function computeFlashStatus(item: FlashItem): FlashStatus {
  const n = dayjs()
  if (n.isBefore(dayjs(item.startsAt))) return 'UPCOMING'
  if (n.isAfter(dayjs(item.endsAt))) return 'ENDED'
  if (item.stock <= 0) return 'SOLD_OUT'
  return 'ACTIVE'
}

// 抽選の状態を「締切日」と「抽選日」から計算する
export function computeLotteryStatus(item: LotteryItem): LotteryStatus {
  const n = dayjs()
  // 応募開始前は UPCOMING
  if (n.isBefore(dayjs(item.startsAt))) return 'UPCOMING'
  // 抽選日以降は ENDED (DRAWNは廃止しENDEDに一元化)
  if (n.isAfter(dayjs(item.drawAt))) return 'ENDED'
  if (n.isAfter(dayjs(item.applyDeadline))) return 'DRAWING'
  return 'ACTIVE'
}

export const mockFlashList: FlashItem[] =[]


const rawLotteryList: (Omit<LotteryItem, 'viewCount' | 'startsAt'> & { viewCount?: number; startsAt?: string })[] = [
  // ── ACTIVE（応募受付中）10件 ──
  {
    id: 'lt-001',
    name: '銀河少年団 ファンミーティング 2026 参加権',
    description:
      '6年ぶりとなる「銀河少年団」のファンミーティング参加権。全員ハイタッチ付き。500名限定。当選者には後日メールで詳細を連絡。',
    imageUrl: '',
    price: 0,
    winnerCount: 500,
    applyCount: 48200,
    status: 'ACTIVE',
    applyDeadline: now.add(5, 'day').toISOString(),
    drawAt: now.add(6, 'day').toISOString(),
    category: 'アイドル・ファンイベント',
    // 汎用S3拡張詳細データ (シングルSKU対応・BackendがS3より結合)
    specifications: [
      { label: '開催会場', value: '横浜アリーナ（神奈川県横浜市港北区新横浜3-10）' },
      { label: '主催・運営', value: '銀河少年団 ファンクラブ事務局' },
      { label: '受取方法', value: '電子入場証（発券手数料無料）' },
      { label: 'お問い合わせ', value: 'ファンクラブインフォメーションデスク' },
    ],
    rules: [
      '抽選応募は無料です。当落発表後、期限内にお支払いをお願いいたします。',
      '重複応募が発覚した場合は、すべての応募が無効となります。',
      '当選権利の第三者への譲渡・転売は一切できません。',
    ],
  },
  {
    id: 'lt-002',
    name: 'ワンダーパーク 竜城エリア 完全貸切体験',
    description:
      '抽選で選ばれた20名が「ワンダーパーク」の竜城エリアを1時間完全貸切。城型ライドも自由に体験可。記念撮影スタッフ同行。',
    imageUrl: '',
    price: 0,
    winnerCount: 20,
    applyCount: 35600,
    status: 'ACTIVE',
    applyDeadline: now.add(3, 'day').add(12, 'hour').toISOString(),
    drawAt: now.add(4, 'day').toISOString(),
    category: 'テーマパーク',
  },
  {
    id: 'lt-003',
    name: '富士山 初日の出 特別観覧席 ご招待',
    description:
      '富士山五合目の特別観覧席から初日の出を鑑賞。温かい甘酒と記念品付き。防寒具・ヘッドランプの貸し出しあり。',
    imageUrl: '',
    price: 0,
    winnerCount: 50,
    applyCount: 8900,
    status: 'ACTIVE',
    applyDeadline: now.add(10, 'day').toISOString(),
    drawAt: now.add(11, 'day').toISOString(),
    category: '自然・絶景体験',
  },
  {
    id: 'lt-004',
    name: '北星フェニックス 全選手サイン入り公式ボール',
    description:
      'プロ野球チーム「北星フェニックス」現役全選手のサイン入り公式ボール。球団から直接配布のため本物保証。専用ケース・証明書付き。',
    imageUrl: '',
    price: 0,
    winnerCount: 10,
    applyCount: 12300,
    status: 'ACTIVE',
    applyDeadline: now.add(2, 'day').toISOString(),
    drawAt: now.add(2, 'day').add(12, 'hour').toISOString(),
    category: 'スポーツグッズ',
  },
  {
    id: 'lt-005',
    name: '春野夏輝 × 夏風勇貴 声優トークショー 参加権',
    description:
      '人気声優2名「春野夏輝・夏風勇貴」によるトークショー参加権。質問コーナーあり。特典として2ショットチェキ撮影付き。サイン色紙プレゼント抽選も。',
    imageUrl: '',
    price: 0,
    winnerCount: 100,
    applyCount: 22400,
    status: 'ACTIVE',
    applyDeadline: now.add(7, 'day').toISOString(),
    drawAt: now.add(8, 'day').toISOString(),
    category: '声優イベント',
  },
  {
    id: 'lt-006',
    name: '首都歴史博物館「古代エジプト展」優先入場権',
    description: '通常入場より1時間早く入場できる優先入場権。会場混雑なしでゆっくり鑑賞可能。音声ガイド・図録付き。',
    imageUrl: '',
    price: 0,
    winnerCount: 200,
    applyCount: 5600,
    status: 'ACTIVE',
    applyDeadline: now.add(4, 'day').toISOString(),
    drawAt: now.add(4, 'day').add(18, 'hour').toISOString(),
    category: '美術館・博物館',
  },
  {
    id: 'lt-007',
    name: 'Jリーグ 優勝セレモニー ピッチサイド最前列',
    description: '優勝チームのセレモニーをピッチサイド最前列で観戦できる招待権。選手入場ハイタッチ列に参加できます。',
    imageUrl: '',
    price: 0,
    winnerCount: 30,
    applyCount: 18900,
    status: 'ACTIVE',
    applyDeadline: now.add(1, 'day').add(8, 'hour').toISOString(),
    drawAt: now.add(1, 'day').add(10, 'hour').toISOString(),
    category: 'スポーツ観戦',
  },
  {
    id: 'lt-008',
    name: '大河川花火大会 屋形船 乗船権',
    description:
      '大河川花火大会を屋形船から鑑賞できる特別乗船権。本格和食コース・飲み放題付き。定員20名のプレミアム席。',
    imageUrl: '',
    price: 0,
    winnerCount: 20,
    applyCount: 31000,
    status: 'ACTIVE',
    applyDeadline: now.add(6, 'day').toISOString(),
    drawAt: now.add(7, 'day').toISOString(),
    category: '季節・祭りイベント',
  },
  {
    id: 'lt-009',
    name: 'CoreBox 6 先行体験会 参加権',
    description:
      '次世代ゲーム機「CoreBox 6」の正式発表前の先行体験会参加権。メーカー本社での特別イベント。参加者は守秘義務契約あり。',
    imageUrl: '',
    price: 0,
    winnerCount: 50,
    applyCount: 95000,
    status: 'UPCOMING',
    startsAt: now.add(6, 'hour').toISOString(), // 6時間後に応募開始 → UPCOMING
    applyDeadline: now.add(2, 'day').add(6, 'hour').toISOString(),
    drawAt: now.add(3, 'day').toISOString(),
    category: 'ゲーム体験会',
  },
  {
    id: 'lt-010',
    name: 'マジカルキャッスル 新エリア グランドオープン前プレビュー',
    description:
      '大型テーマパーク「マジカルキャッスル」の新エリアを一般公開の1週間前に体験できるプレビュー参加権。非公開バックステージへのアクセスあり。',
    imageUrl: '',
    price: 0,
    winnerCount: 300,
    applyCount: 120000,
    status: 'UPCOMING',
    startsAt: now.add(2, 'day').toISOString(), // 2日後に応募開始 → UPCOMING
    applyDeadline: now.add(8, 'day').toISOString(),
    drawAt: now.add(9, 'day').toISOString(),
    category: 'テーマパーク',
  },
  // ── DRAWING（抽選中）2件 ──
  {
    id: 'lt-011',
    name: 'MOONWAVE 非公開スタジオライブ 招待',
    description:
      '音楽ユニット「MOONWAVE」の非公開スタジオライブ招待。応募は締め切りました。現在抽選作業中。結果は本日中に通知予定。',
    imageUrl: '',
    price: 0,
    winnerCount: 30,
    applyCount: 68000,
    status: 'DRAWING',
    applyDeadline: now.subtract(2, 'hour').toISOString(),
    drawAt: now.add(10, 'hour').toISOString(),
    category: 'ライブ・コンサート',
  },
  {
    id: 'lt-012',
    name: '「炎獄の守護者」展覧会 VIP鑑賞会 参加権',
    description:
      '人気アニメ「炎獄の守護者」展のVIP鑑賞会参加権。応募受付は終了しています。ただいま抽選中。当選者にはメールで連絡します。',
    imageUrl: '',
    price: 0,
    winnerCount: 50,
    applyCount: 41500,
    status: 'DRAWING',
    applyDeadline: now.subtract(5, 'hour').toISOString(),
    drawAt: now.add(3, 'hour').toISOString(),
    category: 'アニメ・展覧会',
  },
  // ── ENDED（抽選完了・終了）4件 ──
  {
    id: 'lt-013',
    name: 'THUNDER CROWS 全国アリーナツアー 大阪公演',
    description: 'バンド「THUNDER CROWS」のアリーナツアー大阪公演。抽選は終了しました。当選者には個別に連絡済みです。',
    imageUrl: '',
    price: 8500,
    winnerCount: 1000,
    applyCount: 55000,
    status: 'ENDED',
    applyDeadline: now.subtract(3, 'day').toISOString(),
    drawAt: now.subtract(1, 'day').toISOString(),
    category: 'ライブ・コンサート',
  },
  {
    id: 'lt-014',
    name: '限定カラービニール盤「ボイスノイドクラシックス Vol.1」',
    description:
      'バーチャルシンガー「ボイスノイド」の人気楽曲をアナログレコード化。180g重量盤・限定カラービニール。抽選・当選者への発送は完了済み。',
    imageUrl: '',
    price: 6800,
    winnerCount: 200,
    applyCount: 9800,
    status: 'ENDED',
    applyDeadline: now.subtract(4, 'day').toISOString(),
    drawAt: now.subtract(2, 'day').toISOString(),
    category: '音楽グッズ',
  },
  {
    id: 'lt-015',
    name: '首都国際スポーツ大会 公式記念品 特別抽選',
    description: '首都国際スポーツ大会関連の公式記念品特別抽選キャンペーン。こちらの抽選は完全に終了しています。',
    imageUrl: '',
    price: 0,
    winnerCount: 500,
    applyCount: 280000,
    status: 'ENDED',
    applyDeadline: now.subtract(20, 'day').toISOString(),
    drawAt: now.subtract(15, 'day').toISOString(),
    category: 'スポーツ記念品',
  },
  {
    id: 'lt-016',
    name: 'つきしろ空 直筆サイン入り歌詞カード 抽選',
    description:
      'シンガーソングライター「つきしろ空」の直筆歌詞カードプレゼントキャンペーン。キャンペーン期間終了・抽選・発送まですべて完了済みです。',
    imageUrl: '',
    price: 0,
    winnerCount: 10,
    applyCount: 42000,
    status: 'ENDED',
    applyDeadline: now.subtract(18, 'day').toISOString(),
    drawAt: now.subtract(14, 'day').toISOString(),
    category: '音楽グッズ',
  },
]

export const mockLotteryList: LotteryItem[] = rawLotteryList.map((item, idx) => ({
  viewCount: item.viewCount ?? Math.max(150, 4100 - idx * 180),
  // startsAt が未設定の場合はデフォルトで7日前（過去）= 即 ACTIVE 扱い
  startsAt: item.startsAt ?? now.subtract(7, 'day').toISOString(),
  specifications: item.specifications ?? [
    { label: '抽選方式', value: '公平自動抽選プログラム (フェアエンジン)' },
    { label: '受取方法', value: '電子入場証 / アプリ内デジタル受取' },
    { label: 'お問い合わせ', value: 'FlashBuy カスタマーサポート' },
  ],
  rules: item.rules ?? [
    '抽選応募は無料です。当落発表後、期限内にお支払いをお願いいたします。',
    '同一人物による多重アカウントでの応募が検出された場合、すべての応募が無効となります。',
    '当選権利の第三者への譲渡・転売・オークション出品は固く禁止いたします。',
  ],
  ...item,
}))

export const mockFlashOrderList: FlashOrderItem[] = [
  {
    id: 'ord-001',
    orderNo: 'FB-20260730-001',
    saleId: 'fl-001',
    saleName: '銀河少年団 復活コンサート — 東京ドーム 2026 アリーナ席',
    price: 12000,
    status: 'PAID',
    createdAt: now.subtract(2, 'day').toISOString(),
    paidAt: now.subtract(2, 'day').add(5, 'minute').toISOString(),
  },
  {
    id: 'ord-002',
    orderNo: 'FB-20260729-042',
    saleId: 'fl-005',
    saleName: 'VELO × ZUKI コラボスニーカー 限定モデル',
    price: 29800,
    status: 'UNPAID',
    createdAt: now.subtract(10, 'minute').toISOString(),
  },
  {
    id: 'ord-003',
    orderNo: 'FB-20260725-108',
    saleId: 'fl-003',
    saleName: '超軽量カーボン ロードバイク フレームセット 2026',
    price: 158000,
    status: 'CANCELLED',
    createdAt: now.subtract(6, 'day').toISOString(),
  },
]

export const mockLotteryApplicationList: LotteryOrderItem[] = [
  {
    id: 'app-001',
    lotteryId: 'lt-001',
    lotteryName: '銀河少年団 ファンミーティング 2026 参加権',
    appliedAt: now.subtract(1, 'day').toISOString(),
    status: 'WAITING',
  },
  {
    id: 'app-002',
    lotteryId: 'lt-013',
    lotteryName: 'THUNDER CROWS 全国アリーナツアー 大阪公演',
    appliedAt: now.subtract(5, 'day').toISOString(),
    status: 'UNPAID',
    payDeadline: now.add(2, 'day').toISOString(),
    price: 9800,
  },
  {
    id: 'app-003',
    lotteryId: 'lt-014',
    lotteryName: 'MOONWAVE × アークスタジオ 限定コラボフィギュア',
    appliedAt: now.subtract(10, 'day').toISOString(),
    status: 'LOST',
  },
  {
    id: 'app-004',
    lotteryId: 'lt-015',
    lotteryName: 'ハイレゾ対応 ワイヤレスイヤホン 特装版',
    appliedAt: now.subtract(12, 'day').toISOString(),
    status: 'PAID',
    payDeadline: now.subtract(1, 'day').toISOString(),
    price: 34800,
  },
]

// ===== API 関数 =====

export const api = {
  // ホーム画面専用 — 閲覧数（viewCount）が多い人気 Top 10 を取得する API
  async getHomeTop10(): Promise<HomeTop10> {
    const res = await request<{ flashList: any[]; lotteryList: any[] }>('/api/v1/home/top10')
    return {
      flashList: res.flashList.map((s) => ({ ...toImageUrl(s), status: computeFlashStatus(s) })),
      lotteryList: res.lotteryList.map((l) => ({ ...toImageUrl(l), status: computeLotteryStatus(l) })),
    }
  },

  // フラッシュセール一覧（販売中・告知・売切を返す。完全終了は除外）
  async getFlashList(): Promise<FlashItem[]> {
    const res = await request<{ flashList: any[] }>('/api/v1/flash/list')
    return res.flashList.map((s) => ({ ...toImageUrl(s), status: computeFlashStatus(s) }))
  },

  // IDでフラッシュセールを取得する（閲覧数を1増やす）
  async getFlashById(id: string): Promise<FlashItem> {
    const res = await request<{ flashItem: any }>(`/api/v1/flash/getFlashById/${id}`)
    res.flashItem.viewCount += 1 // ページが見られたので閲覧数をプラスする
    return { ...toImageUrl(res.flashItem), status: computeFlashStatus(res.flashItem) }
  },

  // 抽選一覧（予告・受付中・抽選集計中を返す。終了・当落済みは除外）
  async getLotteryList(): Promise<LotteryItem[]> {
    await delay(400)
    return mockLotteryList
      .map((l) => ({ ...l, status: computeLotteryStatus(l) }))
      .filter((l) => l.status === 'UPCOMING' || l.status === 'ACTIVE' || l.status === 'DRAWING')
  },

  // IDで抽選情報を取得する（閲覧数を1増やす）
  async getLotteryById(id: string): Promise<LotteryItem | null> {
    await delay(300)
    const item = mockLotteryList.find((l) => l.id === id)
    if (!item) return null
    item.viewCount += 1 // ページが見られたので閲覧数をプラスする
    return { ...item, status: computeLotteryStatus(item) }
  },

  // 検索 — 名前・説明・カテゴリでキーワードを探す
  async search(
    query: string,
    timeRange: '6m' | '1y' | '3y' = '6m',
  ): Promise<{ flashList: FlashItem[]; lotteryList: LotteryItem[] }> {
    await delay(400)
    const q = query.toLowerCase().trim()
    if (!q) return { flashList: [], lotteryList: [] }

    // 期間計算のしきい値判定（6ヶ月/1年/3年）
    let threshold: dayjs.Dayjs | null = null
    if (timeRange === '6m') threshold = dayjs().subtract(6, 'month')
    if (timeRange === '1y') threshold = dayjs().subtract(1, 'year')
    if (timeRange === '3y') threshold = dayjs().subtract(3, 'year')

    const flashList = mockFlashList
      .map((s) => ({ ...s, status: computeFlashStatus(s) }))
      .filter((s) => {
        // キーワード検索判定
        const matchesQuery =
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q)
        if (!matchesQuery) return false

        // 期間フィルター（指定された期間より古い過去データを除外する）
        return !(threshold && dayjs(s.startsAt).isBefore(threshold));

      })

    const lotteryList = mockLotteryList
      .map((l) => ({ ...l, status: computeLotteryStatus(l) }))
      .filter((l) => {
        // キーワード検索判定
        const matchesQuery =
          l.name.toLowerCase().includes(q) ||
          l.description.toLowerCase().includes(q) ||
          l.category.toLowerCase().includes(q)
        if (!matchesQuery) return false

        // 期間フィルター（指定された期間より古い過去データを除外する）
        return !(threshold && dayjs(l.applyDeadline).isBefore(threshold));

      })

    return { flashList, lotteryList }
  },

  // フラッシュ購入 — トークンバケット→在庫確認→キュー投入のMock
  async flashBuy(saleId: string): Promise<{ orderNo: string; status: 'QUEUED' | 'SOLD_OUT' }> {
    await delay(600)
    const sale = mockFlashList.find((s) => s.id === saleId)
    if (!sale || sale.stock <= 0) {
      return { orderNo: '', status: 'SOLD_OUT' }
    }
    // 在庫を1つ減らす
    sale.stock = Math.max(0, sale.stock - 1)
    const orderNo = `FB-${dayjs().format('YYYYMMDD')}-${String(Math.floor(Math.random() * 9000) + 1000)}`
    return { orderNo, status: 'QUEUED' }
  },

  // 抽選応募
  async applyLottery(lotteryId: string): Promise<{ applicationId: string }> {
    await delay(500)
    const item = mockLotteryList.find((l) => l.id === lotteryId)
    if (item) item.applyCount += 1
    return { applicationId: `APP-${Date.now()}` }
  },

  // マイページ — 注文・応募履歴を取得する
  async getMyFlashOrderList(): Promise<FlashOrderItem[]> {
    await delay(400)
    return mockFlashOrderList
  },

  async getMyLotteryApplicationList(): Promise<LotteryOrderItem[]> {
    await delay(400)
    return mockLotteryApplicationList
  },

  // 支払いMock — WAITING → PAID / TIMEOUT の状態機械
  async processMockPayment(payload: MockPaymentPayload): Promise<MockPaymentResult> {
    await delay(1500)
    const success = Math.random() > 0.6 // 40%の確率で成功
    if (success) {
      const order = mockFlashOrderList.find((o) => o.id === payload.orderId)
      if (order) {
        order.status = 'PAID'
        order.paidAt = dayjs().toISOString()
      }
      const app = mockLotteryApplicationList.find((a) => a.id === payload.orderId)
      if (app) {
        app.status = 'PAID'
      }
    }
    return {
      success,
      transactionId: `TXN-${Date.now()}`,
      paidAt: dayjs().toISOString(),
    }
  },

  // 管理画面用 — 新規フラッシュセール作成 API
  async createFlash(sale: Partial<FlashItem>): Promise<FlashItem> {
    await delay(500)
    const newItem: FlashItem = {
      id: `fl-${Date.now()}`,
      name: sale.name || '新規フラッシュセール商品',
      description: sale.description || '',
      imageUrl: sale.imageUrl || '',
      price: Number(sale.price) || 0,
      stock: Number(sale.stock) || 100,
      totalStock: Number(sale.stock) || 100,
      status: 'ACTIVE',
      startsAt: dayjs().toISOString(),
      endsAt: dayjs().add(7, 'day').toISOString(),
      category: sale.category || 'その他',
      viewCount: 1,
    }
    mockFlashList.unshift(newItem)
    return newItem
  },

  // 管理画面用 — 新規抽選作成 API
  async createLottery(lottery: Partial<LotteryItem>): Promise<LotteryItem> {
    await delay(500)
    const newItem: LotteryItem = {
      id: `lot-${Date.now()}`,
      name: lottery.name || '新規抽選イベント',
      description: lottery.description || '',
      imageUrl: lottery.imageUrl || '',
      price: Number(lottery.price) || 0,
      winnerCount: Number(lottery.winnerCount) || 10,
      applyCount: 0,
      status: 'ACTIVE',
      startsAt: dayjs().toISOString(),
      applyDeadline: dayjs().add(7, 'day').toISOString(),
      drawAt: dayjs().add(8, 'day').toISOString(),
      category: lottery.category || 'その他',
      viewCount: 1,
    }
    mockLotteryList.unshift(newItem)
    return newItem
  },

  // 認証（Mock）
  async login(email: string, _password: string) {
    await delay(800)
    return {
      user: {
        id: 'u-001',
        email,
        displayName: email.split('@')[0],
        role: email.includes('admin') ? 'admin' : 'user',
      },
      token: 'mock-jwt-token-' + Date.now(),
    }
  },

  async logout() {
    await delay(200)
  },
}
