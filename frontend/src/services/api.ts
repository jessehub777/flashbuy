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
  HomeFeatured,
} from '../types'

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
  // 抽選日から7日以上経過したら終了扱い
  if (n.isAfter(dayjs(item.drawAt).add(7, 'day'))) return 'ENDED'
  if (n.isAfter(dayjs(item.drawAt))) return 'DRAWN'
  if (n.isAfter(dayjs(item.applyDeadline))) return 'DRAWING'
  return 'ACTIVE'
}

// ===== フラッシュセール Mock データ（18件）=====
// ※ すべて架空のイベント・商品です
// startsAt / endsAt / stock から status が自動計算される
const rawFlashList: (Omit<FlashItem, 'viewCount'> & { viewCount?: number })[] = [
  // ── ACTIVE（販売中）12件 ──
  {
    id: 'fs-001',
    name: '銀河少年団 復活コンサート — 東京ドーム 2026 アリーナ席',
    description:
      '伝説の5人組グループ「銀河少年団」が6年ぶりに復活！東京ドーム公演のアリーナA席チケット。転売禁止・本人確認あり。1アカウント1枚限り。',
    imageUrl: '',
    price: 12000,
    stock: 42,
    totalStock: 500,
    status: 'ACTIVE',
    startsAt: now.subtract(30, 'minute').toISOString(),
    endsAt: now.add(2, 'hour').toISOString(),
    category: 'ライブ・コンサート',
    // 汎用S3拡張詳細データ (シングルSKU対応・BackendがS3より結合)
    specifications: [
      { label: '開催会場', value: '東京ドーム（東京都文京区後楽1-3-61）' },
      { label: '主催・企画', value: '銀河少年団 2026 実行委員会 / DISK GARAGE' },
      { label: '発券方法', value: '電子チケット（FlashBuy スマチケ アプリ入場）' },
      { label: 'お問い合わせ', value: 'DISK GARAGE (TEL: 050-5533-0888)' },
    ],
    rules: [
      'お1人様 1回につき 1枚までご購入いただけます。',
      '転売目的の購入は固く禁止されており、入場時に本人確認を実施します。',
      '未就学児童の入場は不可となります（小学生以上チケット必要）。',
    ],
  },
  {
    id: 'fs-002',
    name: 'ソラリス24 全国握手会 参加券 幕張会場',
    description:
      '人気アイドルグループ「ソラリス24」最新シングル発売記念の全国握手会参加券。各メンバー1回握手できます。会場は幕張メッセ。チケットは電子入場証。',
    imageUrl: '',
    price: 1500,
    stock: 8,
    totalStock: 2000,
    status: 'ACTIVE',
    startsAt: now.subtract(1, 'hour').toISOString(),
    endsAt: now.add(45, 'minute').toISOString(),
    category: 'アイドル・握手会',
  },
  {
    id: 'fs-003',
    name: 'Jリーグ チャンピオンシップ決勝 ゴール裏SS席',
    description: '2026 Jリーグチャンピオンシップ決勝のゴール裏SS席チケット。試合前の入場セレモニーも間近で見られます。',
    imageUrl: '',
    price: 8800,
    stock: 15,
    totalStock: 100,
    status: 'ACTIVE',
    startsAt: now.subtract(2, 'hour').toISOString(),
    endsAt: now.add(6, 'hour').toISOString(),
    category: 'スポーツ観戦',
  },
  {
    id: 'fs-004',
    name: '映画「炎獄の守護者」最終章 特別試写会 招待状',
    description:
      '大人気アニメ映画「炎獄の守護者」最終章の一般公開2日前の特別試写会招待状。監督・主要声優登壇の舞台挨拶あり。来場特典クリアファイル付き。',
    imageUrl: '',
    price: 3500,
    stock: 3,
    totalStock: 200,
    status: 'ACTIVE',
    startsAt: now.subtract(20, 'minute').toISOString(),
    endsAt: now.add(3, 'hour').toISOString(),
    category: '映画・試写会',
  },
  {
    id: 'fs-005',
    name: 'VELO × ZUKI コラボスニーカー 限定モデル (26.5cm)',
    description: '国内300足限定のVELO × ZUKIコラボモデル。正規品保証・専用シリアルナンバー刻印入り。単一SKU限定販売。',
    imageUrl: '',
    price: 29800,
    stock: 5,
    totalStock: 30,
    status: 'ACTIVE',
    startsAt: now.subtract(10, 'minute').toISOString(),
    endsAt: now.add(5, 'hour').toISOString(),
    category: '限定スニーカー',
    // 汎用S3拡張詳細データ (シングルSKU対応・限定スニーカー)
    specifications: [
      { label: 'ブランド', value: 'VELO × ZUKI' },
      { label: '型番 (SKU)', value: 'VZ-2026-OG-RED' },
      { label: 'カラー', value: 'RETRO WHITE / VARSITY RED' },
      { label: 'サイズ', value: '26.5cm (単一SKU販売)' },
      { label: '発送時期', value: '決済完了後 2〜4営業日以内に発送' },
      { label: '返品規定', value: '限定品のため購入完了後のキャンセル・返品不可' },
    ],
    rules: [
      'お1人様（1アカウント）につき 1点までご購入いただけます。',
      '自動購入プロセスの不正検知（BOT対策）を実施しており、不正検知時は自動キャンセルとなります。',
      '外箱の初期擦れ等による交換は致しかねます。',
    ],
  },
  {
    id: 'fs-006',
    name: 'CoreBox 5 Pro ソフト3本同梱版',
    description: '数量限定のCoreBox 5 Pro同梱版。最新タイトル3本付属。メーカー1年保証。転売防止のため本人確認必須。',
    imageUrl: '',
    price: 89980,
    stock: 20,
    totalStock: 200,
    status: 'ACTIVE',
    startsAt: now.subtract(10, 'minute').toISOString(),
    endsAt: now.add(30, 'minute').toISOString(),
    category: 'ゲーム機',
  },
  {
    id: 'fs-007',
    name: '東京ゲームフェスト 2026 一般優先入場券',
    description:
      '一般公開日より1時間早く入場できる優先券。限定グッズ交換券付き。幕張メッセ全館入場可。会場混雑時も優先レーン使用可。',
    imageUrl: '',
    price: 2800,
    stock: 150,
    totalStock: 1000,
    status: 'ACTIVE',
    startsAt: now.subtract(3, 'hour').toISOString(),
    endsAt: now.add(1, 'day').toISOString(),
    category: 'ゲームイベント',
  },
  {
    id: 'fs-008',
    name: '月影歌劇団 風組公演 東京大劇場 SS席',
    description: '月影歌劇団 風組の東京大劇場SS席。舞台に最も近い特等席。公演後の出待ちエリアへのアクセスあり。',
    imageUrl: '',
    price: 18000,
    stock: 7,
    totalStock: 50,
    status: 'ACTIVE',
    startsAt: now.subtract(1, 'hour').toISOString(),
    endsAt: now.add(4, 'hour').toISOString(),
    category: '舞台・ミュージカル',
  },
  {
    id: 'fs-009',
    name: '創作大祭 2026 秋 一般参加 整理券（午前）',
    description:
      '同人誌即売会「創作大祭」秋大会の一般参加整理券（午前の部）。整理番号順に入場。東京ビッグサイト東展示棟。',
    imageUrl: '',
    price: 1800,
    stock: 200,
    totalStock: 5000,
    status: 'ACTIVE',
    startsAt: now.subtract(15, 'minute').toISOString(),
    endsAt: now.add(5, 'hour').toISOString(),
    category: '同人誌・アニメイベント',
  },
  {
    id: 'fs-010',
    name: 'RunBase 574 × BLOC Tokyo 限定コラボ',
    description:
      'BLOC Tokyo限定カラーのRunBase 574コラボモデル。日本国内500足のみ生産。ナンバリング入り専用ボックス付属。',
    imageUrl: '',
    price: 22000,
    stock: 12,
    totalStock: 50,
    status: 'ACTIVE',
    startsAt: now.subtract(40, 'minute').toISOString(),
    endsAt: now.add(2, 'hour').add(30, 'minute').toISOString(),
    category: '限定スニーカー',
  },
  {
    id: 'fs-011',
    name: 'FlipBoard 2 スペシャルエディション',
    description:
      'ゲームソフト2本同梱の数量限定スペシャルエディション。オリジナルカラーのコントローラー付き。生産数は極めて少数。',
    imageUrl: '',
    price: 54980,
    stock: 35,
    totalStock: 300,
    status: 'ACTIVE',
    startsAt: now.subtract(5, 'minute').toISOString(),
    endsAt: now.add(50, 'minute').toISOString(),
    category: 'ゲーム機',
  },
  {
    id: 'fs-012',
    name: 'つきしろ空 ホールツアー 2026 名古屋公演 アリーナC列',
    description:
      'シンガーソングライター「つきしろ空」の全国ホールツアー名古屋公演。アリーナC列の良席。CD購入者向け優先抽選外の一般販売分。',
    imageUrl: '',
    price: 7500,
    stock: 22,
    totalStock: 200,
    status: 'ACTIVE',
    startsAt: now.subtract(2, 'hour').toISOString(),
    endsAt: now.add(8, 'hour').toISOString(),
    category: 'ライブ・コンサート',
  },
  // ── UPCOMING（予告）3件 ──
  {
    id: 'fs-013',
    name: '電音フォル 15周年記念ライブ プレミアム席',
    description:
      '人気バーチャルシンガー「電音フォル」の15周年記念特別ライブ。最新AR演出と生オーケストラの競演。プレミアム席は限定200席のみ。',
    imageUrl: '',
    price: 25000,
    stock: 200,
    totalStock: 200,
    status: 'UPCOMING',
    startsAt: now.add(2, 'day').toISOString(),
    endsAt: now.add(4, 'day').toISOString(),
    category: 'バーチャルライブ',
  },
  {
    id: 'fs-014',
    name: 'MOONWAVE × アークスタジオ 限定コラボフィギュア',
    description:
      '人気音楽ユニット「MOONWAVE」の代表曲をモチーフにした限定フィギュア。全長22cm・塗装済み完成品。1アカウント1個まで。',
    imageUrl: '',
    price: 14800,
    stock: 80,
    totalStock: 80,
    status: 'UPCOMING',
    startsAt: now.add(1, 'day').add(6, 'hour').toISOString(),
    endsAt: now.add(3, 'day').toISOString(),
    category: 'グッズ・フィギュア',
  },
  {
    id: 'fs-015',
    name: '星海の冒険者 ワールドツアー展 VIP内覧会 招待券',
    description:
      '史上最大規模の漫画展「星海の冒険者展」VIP内覧会の招待券。作者複製サイン入り証明書・限定グッズ付き。定員10名。',
    imageUrl: '',
    price: 38000,
    stock: 10,
    totalStock: 10,
    status: 'UPCOMING',
    startsAt: now.add(5, 'day').toISOString(),
    endsAt: now.add(7, 'day').toISOString(),
    category: '展覧会・イベント',
  },
  // ── SOLD_OUT（売切）2件 ──
  {
    id: 'fs-016',
    name: 'SOLAR BEAR 日本武道館公演 S席チケット',
    description:
      'バンド「SOLAR BEAR」の日本武道館公演S席チケット。アリーナに隣接の特等席。秒速完売の人気公演。キャンセル待ち不可。',
    imageUrl: '',
    price: 9800,
    stock: 0,
    totalStock: 800,
    status: 'SOLD_OUT',
    startsAt: now.subtract(3, 'hour').toISOString(),
    endsAt: now.add(1, 'hour').toISOString(),
    category: 'ライブ・コンサート',
  },
  {
    id: 'fs-017',
    name: 'RUSH × FORMA コラボスニーカー',
    description:
      'クリエイティブブランド「FORMA」とシューズブランド「RUSH」のコラボスニーカー。完全売り切れ。入荷予定なし。',
    imageUrl: '',
    price: 35000,
    stock: 0,
    totalStock: 150,
    status: 'SOLD_OUT',
    startsAt: now.subtract(4, 'hour').toISOString(),
    endsAt: now.add(2, 'hour').toISOString(),
    category: '限定スニーカー',
  },
  // ── ENDED（終了）1件 ──
  {
    id: 'fs-018',
    name: '霧島蒼介 アリーナツアー 大阪公演',
    description:
      'シンガーソングライター「霧島蒼介」のアリーナツアー大阪公演チケット。販売期間は終了しています。次回公演情報はオフィシャルサイトで確認。',
    imageUrl: '',
    price: 8800,
    stock: 0,
    totalStock: 1000,
    status: 'ENDED',
    startsAt: now.subtract(5, 'day').toISOString(),
    endsAt: now.subtract(1, 'day').toISOString(),
    category: 'ライブ・コンサート',
  },
]

export const mockFlashList: FlashItem[] = rawFlashList.map((item, idx) => ({
  viewCount: item.viewCount ?? Math.max(120, 3200 - idx * 140),
  specifications: item.specifications ?? [
    { label: '発送時期', value: '決済完了後 2〜4営業日以内に発送' },
    { label: '配送方法', value: 'ヤマト運輸 / 佐川急便 (全国送料無料)' },
    { label: '正規品保証', value: '日本国内正規品・シリアル刻印保証' },
  ],
  rules: item.rules ?? [
    'お1人様 1点までの数量限定販売となります。',
    '転売目的の購入およびBOT等の不正アクセス・スクリプトの使用は禁止です。',
    '決済確定後のキャンセル・お客様都合による返品・交換は致しかねます。',
  ],
  ...item,
}))

// ===== 抽選 Mock データ（16件）=====
// ※ すべて架空のイベント・商品です
// applyDeadline / drawAt から status が自動計算される
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
  // ── DRAWN（抽選済み）2件 ──
  {
    id: 'lt-013',
    name: 'THUNDER CROWS 全国アリーナツアー 大阪公演',
    description: 'バンド「THUNDER CROWS」のアリーナツアー大阪公演。抽選は終了しました。当選者には個別に連絡済みです。',
    imageUrl: '',
    price: 8500,
    winnerCount: 1000,
    applyCount: 55000,
    status: 'DRAWN',
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
    status: 'DRAWN',
    applyDeadline: now.subtract(4, 'day').toISOString(),
    drawAt: now.subtract(2, 'day').toISOString(),
    category: '音楽グッズ',
  },
  // ── ENDED（終了）2件 ──
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
    saleId: 'fs-001',
    saleName: '銀河少年団 復活コンサート — 東京ドーム 2026 アリーナ席',
    price: 12000,
    status: 'PAID',
    createdAt: now.subtract(2, 'day').toISOString(),
    paidAt: now.subtract(2, 'day').add(5, 'minute').toISOString(),
  },
  {
    id: 'ord-002',
    orderNo: 'FB-20260729-042',
    saleId: 'fs-005',
    saleName: 'VELO × ZUKI コラボスニーカー 限定モデル',
    price: 29800,
    status: 'WAITING',
    createdAt: now.subtract(10, 'minute').toISOString(),
  },
  {
    id: 'ord-003',
    orderNo: 'FB-20260725-108',
    saleId: 'fs-003',
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
    status: 'WON',
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
  async getHomeFeatured(): Promise<HomeFeatured> {
    await delay(300)
    const flashList = [...mockFlashList]
      .map((s) => ({ ...s, status: computeFlashStatus(s) }))
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, 10)

    const lotteryList = [...mockLotteryList]
      .map((l) => ({ ...l, status: computeLotteryStatus(l) }))
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, 10)

    return { flashList, lotteryList }
  },

  // フラッシュセール一覧（販売中・告知・売切を返す。完全終了は除外）
  async getFlashList(): Promise<FlashItem[]> {
    await delay(400)
    return mockFlashList.map((s) => ({ ...s, status: computeFlashStatus(s) })).filter((s) => s.status !== 'ENDED')
  },

  // IDでフラッシュセールを取得する（閲覧数を1増やす）
  async getFlashById(id: string): Promise<FlashItem | null> {
    await delay(300)
    const item = mockFlashList.find((s) => s.id === id)
    if (!item) return null
    item.viewCount += 1 // ページが見られたので閲覧数をプラスする
    return { ...item, status: computeFlashStatus(item) }
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
        if (threshold && dayjs(s.startsAt).isBefore(threshold)) return false
        return true
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
        if (threshold && dayjs(l.applyDeadline).isBefore(threshold)) return false
        return true
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
      id: `fs-${Date.now()}`,
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
