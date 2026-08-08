CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,               -- Cognito sub（認証基盤が発行した固定ID）
  email VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
);

CREATE TABLE IF NOT EXISTS flash_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  image_s3_key VARCHAR(512),
  detail_s3_key VARCHAR(512),
  price INTEGER NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0,
  total_stock INTEGER NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  category VARCHAR(100) NOT NULL,
  view_count BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  CONSTRAINT chk_stock_range CHECK (
    stock >= 0
    AND stock <= total_stock
  ),
  CONSTRAINT chk_time_range CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS lottery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  image_s3_key VARCHAR(512),
  detail_s3_key VARCHAR(512),
  price INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
  chosen_price INTEGER NOT NULL DEFAULT 0 CHECK (chosen_price >= 0),
  winner_count INTEGER NOT NULL CHECK (winner_count > 0),
  apply_count INTEGER NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ NOT NULL,
  apply_deadline TIMESTAMPTZ NOT NULL,
  draw_at TIMESTAMPTZ NOT NULL,
  category VARCHAR(100) NOT NULL,
  view_count BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  CONSTRAINT chk_lottery_times CHECK (
    draw_at > apply_deadline
    AND apply_deadline >= starts_at
  )
);

CREATE TABLE IF NOT EXISTS flash_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  order_no VARCHAR(30) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users (id),
  flash_id UUID NOT NULL REFERENCES flash_items (id),
  price INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('UNPAID', 'PAID', 'CANCELLED')),
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
);

CREATE TABLE IF NOT EXISTS lottery_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id UUID NOT NULL REFERENCES users (id),
  lottery_id UUID NOT NULL REFERENCES lottery_items (id),
  price INTEGER NOT NULL,
  chosen_price INTEGER NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  status VARCHAR(20) NOT NULL DEFAULT 'WAITING' CHECK (
    status IN ('WAITING', 'UNPAID', 'LOST', 'PAID', 'CANCELLED')
  ),
  pay_deadline TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  UNIQUE (user_id, lottery_id)
);

TRUNCATE TABLE lottery_orders,
flash_orders,
lottery_items,
flash_items,
users CASCADE;

INSERT INTO
  users (id, email, display_name, role)
VALUES
  (
    '9744da98-5011-70f4-36dc-f619e87e5ce2',
    'user@flashbuy.demo',
    '王迎新',
    'user'
  ),
  (
    'c7943ac8-d081-7072-c66f-7226d92bbf4e',
    'admin@flashbuy.demo',
    'オーナー',
    'admin'
  );

INSERT INTO
  flash_items (
    id,
    name,
    description,
    price,
    stock,
    total_stock,
    starts_at,
    ends_at,
    category,
    view_count
  )
VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001',
    '銀河少年団 復活コンサート — 東京ドーム 2026 アリーナ席',
    '伝説の5人組グループ「銀河少年団」が6年ぶりに復活！東京ドーム公演のアリーナA席チケット。',
    12000,
    42,
    500,
    NOW () - INTERVAL '30 minutes',
    NOW () + INTERVAL '2 hours',
    'ライブ・コンサート',
    3200
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002',
    'ソラリス24 全国握手会 参加券 幕張会場',
    '人気アイドルグループ「ソラリス24」最新シングル発売記念の全国握手会参加券。',
    1500,
    8,
    2000,
    NOW () - INTERVAL '1 hour',
    NOW () + INTERVAL '45 minutes',
    'アイドル・握手会',
    3060
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003',
    'Jリーグ チャンピオンシップ決勝 ゴール裏SS席',
    '2026 Jリーグチャンピオンシップ決勝のゴール裏SS席チケット。',
    8800,
    15,
    100,
    NOW () - INTERVAL '2 hours',
    NOW () + INTERVAL '6 hours',
    'スポーツ観戦',
    2920
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0004',
    '映画「炎獄の守護者」最終章 特別試写会 招待状',
    '大人気アニメ映画「炎獄の守護者」最終章の一般公開2日前の特別試写会招待状。',
    3500,
    3,
    200,
    NOW () - INTERVAL '20 minutes',
    NOW () + INTERVAL '3 hours',
    '映画・試写会',
    2780
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0005',
    'VELO × ZUKI コラボスニーカー 限定モデル (26.5cm)',
    '国内300足限定のVELO × ZUKIコラボモデル。',
    29800,
    5,
    30,
    NOW () - INTERVAL '10 minutes',
    NOW () + INTERVAL '5 hours',
    '限定スニーカー',
    2640
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0006',
    'CoreBox 5 Pro ソフト3本同梱版',
    '数量限定のCoreBox 5 Pro同梱版。最新タイトル3本付属。',
    89980,
    20,
    200,
    NOW () - INTERVAL '10 minutes',
    NOW () + INTERVAL '30 minutes',
    'ゲーム機',
    2500
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0007',
    '東京ゲームフェスト 2026 一般優先入場券',
    '一般公開日より1時間早く入場できる優先券。',
    2800,
    150,
    1000,
    NOW () - INTERVAL '3 hours',
    NOW () + INTERVAL '1 day',
    'ゲームイベント',
    2360
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0008',
    '月影歌劇団 風組公演 東京大劇場 SS席',
    '月影歌劇団 風組の東京大劇場SS席。',
    18000,
    7,
    50,
    NOW () - INTERVAL '1 hour',
    NOW () + INTERVAL '4 hours',
    '舞台・ミュージカル',
    2220
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0009',
    '創作大祭 2026 秋 一般参加 整理券（午前）',
    '同人誌即売会「創作大祭」秋大会の一般参加整理券。',
    1800,
    200,
    5000,
    NOW () - INTERVAL '15 minutes',
    NOW () + INTERVAL '5 hours',
    '同人誌・アニメイベント',
    2080
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0010',
    'RunBase 574 × BLOC Tokyo 限定コラボ',
    'BLOC Tokyo限定カラーのRunBase 574コラボモデル。',
    22000,
    12,
    50,
    NOW () - INTERVAL '40 minutes',
    NOW () + INTERVAL '2 hours 30 minutes',
    '限定スニーカー',
    1940
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0011',
    'FlipBoard 2 スペシャルエディション',
    'ゲームソフト2本同梱の数量限定スペシャルエディション。',
    54980,
    35,
    300,
    NOW () - INTERVAL '5 minutes',
    NOW () + INTERVAL '50 minutes',
    'ゲーム機',
    1800
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0012',
    'つきしろ空 ホールツアー 2026 名古屋公演 アリーナC列',
    'シンガーソングライター「つきしろ空」の全国ホールツアー名古屋公演。',
    7500,
    22,
    200,
    NOW () - INTERVAL '2 hours',
    NOW () + INTERVAL '8 hours',
    'ライブ・コンサート',
    1660
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0013',
    '電音フォル 15周年記念ライブ プレミアム席',
    '人気バーチャルシンガー「電音フォル」の15周年記念特別ライブ。',
    25000,
    200,
    200,
    NOW () + INTERVAL '2 days',
    NOW () + INTERVAL '4 days',
    'バーチャルライブ',
    1520
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0014',
    'MOONWAVE × アークスタジオ 限定コラボフィギュア',
    '人気音楽ユニット「MOONWAVE」の代表曲をモチーフにした限定フィギュア。',
    14800,
    80,
    80,
    NOW () + INTERVAL '1 day 6 hours',
    NOW () + INTERVAL '3 days',
    'グッズ・フィギュア',
    1380
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0015',
    '星海の冒険者 ワールドツアー展 VIP内覧会 招待券',
    '史上最大規模の漫画展「星海の冒険者展」VIP内覧会の招待券。',
    38000,
    10,
    10,
    NOW () + INTERVAL '5 days',
    NOW () + INTERVAL '7 days',
    '展覧会・イベント',
    1240
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0016',
    'SOLAR BEAR 日本武道館公演 S席チケット',
    'バンド「SOLAR BEAR」の日本武道館公演S席チケット。',
    9800,
    0,
    800,
    NOW () - INTERVAL '3 hours',
    NOW () + INTERVAL '1 hour',
    'ライブ・コンサート',
    1100
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0017',
    'RUSH × FORMA コラボスニーカー',
    'クリエイティブブランド「FORMA」とシューズブランド「RUSH」のコラボスニーカー。',
    35000,
    0,
    150,
    NOW () - INTERVAL '4 hours',
    NOW () + INTERVAL '2 hours',
    '限定スニーカー',
    960
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0018',
    '霧島蒼介 アリーナツアー 大阪公演',
    'シンガーソングライター「霧島蒼介」のアリーナツアー大阪公演チケット。',
    8800,
    0,
    1000,
    NOW () - INTERVAL '5 days',
    NOW () - INTERVAL '1 day',
    'ライブ・コンサート',
    820
  );

INSERT INTO
  lottery_items (
    id,
    name,
    description,
    price,
    winner_count,
    apply_count,
    starts_at,
    apply_deadline,
    draw_at,
    category,
    view_count
  )
VALUES
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001',
    '銀河少年団 ファンミーティング 2026 参加権',
    '6年ぶりとなる「銀河少年団」のファンミーティング参加権。全員ハイタッチ付き。',
    0,
    500,
    48200,
    NOW () - INTERVAL '7 days',
    NOW () + INTERVAL '5 days',
    NOW () + INTERVAL '6 days',
    'アイドル・ファンイベント',
    4100
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002',
    'ワンダーパーク 竜城エリア 完全貸切体験',
    '抽選で選ばれた20名が「ワンダーパーク」の竜城エリアを1時間完全貸切。',
    0,
    20,
    35600,
    NOW () - INTERVAL '7 days',
    NOW () + INTERVAL '3 days 12 hours',
    NOW () + INTERVAL '4 days',
    'テーマパーク',
    3920
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0003',
    '富士山 初日の出 特別観覧席 ご招待',
    '富士山五合目の特別観覧席から初日の出を鑑賞。',
    0,
    50,
    8900,
    NOW () - INTERVAL '7 days',
    NOW () + INTERVAL '10 days',
    NOW () + INTERVAL '11 days',
    '自然・絶景体験',
    3740
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0004',
    '北星フェニックス 全選手サイン入り公式ボール',
    'プロ野球チーム「北星フェニックス」現役全選手のサイン入り公式ボール。',
    0,
    10,
    12300,
    NOW () - INTERVAL '7 days',
    NOW () + INTERVAL '2 days',
    NOW () + INTERVAL '2 days 12 hours',
    'スポーツグッズ',
    3560
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0005',
    '春野夏輝 × 夏風勇貴 声優トークショー 参加権',
    '人気声優2名「春野夏輝・夏風勇貴」によるトークショー参加権。',
    0,
    100,
    22400,
    NOW () - INTERVAL '7 days',
    NOW () + INTERVAL '7 days',
    NOW () + INTERVAL '8 days',
    '声優イベント',
    3380
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0006',
    '首都歴史博物館「古代エジプト展」優先入場権',
    '通常入場より1時間早く入場できる優先入場権。',
    0,
    200,
    5600,
    NOW () - INTERVAL '7 days',
    NOW () + INTERVAL '4 days',
    NOW () + INTERVAL '4 days 18 hours',
    '美術館・博物館',
    3200
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0007',
    'Jリーグ 優勝セレモニー ピッチサイド最前列',
    '優勝チームのセレモニーをピッチサイド最前列で観戦できる招待権。',
    0,
    30,
    18900,
    NOW () - INTERVAL '7 days',
    NOW () + INTERVAL '1 day 8 hours',
    NOW () + INTERVAL '1 day 10 hours',
    'スポーツ観戦',
    3020
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0008',
    '大河川花火大会 屋形船 乗船権',
    '大河川花火大会を屋形船から鑑賞できる特別乗船権。',
    0,
    20,
    31000,
    NOW () - INTERVAL '7 days',
    NOW () + INTERVAL '6 days',
    NOW () + INTERVAL '7 days',
    '季節・祭りイベント',
    2840
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0009',
    'CoreBox 6 先行体験会 参加権',
    '次世代ゲーム機「CoreBox 6」の正式発表前の先行体験会参加権。',
    0,
    50,
    95000,
    NOW () + INTERVAL '6 hours',
    NOW () + INTERVAL '2 days 6 hours',
    NOW () + INTERVAL '3 days',
    'ゲーム体験会',
    2660
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0010',
    'マジカルキャッスル 新エリア グランドオープン前プレビュー',
    '大型テーマパーク「マジカルキャッスル」の新エリアを一般公開の1週間前に体験できるプレビュー参加権。',
    0,
    300,
    120000,
    NOW () + INTERVAL '2 days',
    NOW () + INTERVAL '8 days',
    NOW () + INTERVAL '9 days',
    'テーマパーク',
    2480
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0011',
    'MOONWAVE 非公開スタジオライブ 招待',
    '音楽ユニット「MOONWAVE」の非公開スタジオライブ招待。現在抽選中。',
    0,
    30,
    68000,
    NOW () - INTERVAL '7 days',
    NOW () - INTERVAL '2 hours',
    NOW () + INTERVAL '10 hours',
    'ライブ・コンサート',
    2300
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0012',
    '「炎獄の守護者」展覧会 VIP鑑賞会 参加権',
    '人気アニメ「炎獄の守護者」展のVIP鑑賞会参加権。',
    0,
    50,
    41500,
    NOW () - INTERVAL '7 days',
    NOW () - INTERVAL '5 hours',
    NOW () + INTERVAL '3 hours',
    'アニメ・展覧会',
    2120
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0013',
    'THUNDER CROWS 全国アリーナツアー 大阪公演',
    'バンド「THUNDER CROWS」のアリーナツアー大阪公演。',
    8500,
    1000,
    55000,
    NOW () - INTERVAL '7 days',
    NOW () - INTERVAL '3 days',
    NOW () - INTERVAL '1 day',
    'ライブ・コンサート',
    1940
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0014',
    '限定カラービニール盤「ボイスノイドクラシックス Vol.1」',
    'バーチャルシンガー「ボイスノイド」の人気楽曲をアナログレコード化。',
    6800,
    200,
    9800,
    NOW () - INTERVAL '7 days',
    NOW () - INTERVAL '4 days',
    NOW () - INTERVAL '2 days',
    '音楽グッズ',
    1760
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0015',
    '首都国際スポーツ大会 公式記念品 特別抽選',
    '首都国際スポーツ大会関連の公式記念品特別抽選キャンペーン。',
    0,
    500,
    280000,
    NOW () - INTERVAL '30 days',
    NOW () - INTERVAL '20 days',
    NOW () - INTERVAL '15 days',
    'スポーツ記念品',
    1580
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0016',
    'つきしろ空 直筆サイン入り歌詞カード 抽選',
    'シンガーソングライター「つきしろ空」の直筆歌詞カードプレゼントキャンペーン。',
    0,
    10,
    42000,
    NOW () - INTERVAL '30 days',
    NOW () - INTERVAL '18 days',
    NOW () - INTERVAL '14 days',
    '音楽グッズ',
    1400
  );

INSERT INTO
  flash_orders (
    id,
    order_no,
    user_id,
    flash_id,
    price,
    status,
    paid_at,
    expires_at,
    created_at
  )
VALUES
  (
    'cccccccc-cccc-cccc-cccc-cccccccc0001',
    'fl-202608010001-00001',
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001',
    12000,
    'PAID',
    NOW () - INTERVAL '2 days',
    NOW () + INTERVAL '15 minutes',
    NOW () - INTERVAL '2 days'
  ),
  (
    'cccccccc-cccc-cccc-cccc-cccccccc0002',
    'fl-202608010005-00042',
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0005',
    29800,
    'UNPAID',
    NULL,
    NOW () + INTERVAL '5 minutes',
    NOW () - INTERVAL '10 minutes'
  ),
  (
    'cccccccc-cccc-cccc-cccc-cccccccc0003',
    'fl-202608010003-00108',
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003',
    158000,
    'CANCELLED',
    NULL,
    NOW () - INTERVAL '6 days',
    NOW () - INTERVAL '6 days'
  );

INSERT INTO
  lottery_orders (
    id,
    user_id,
    lottery_id,
    price,
    chosen_price,
    applied_at,
    status,
    pay_deadline,
    paid_at
  )
VALUES
  (
    'dddddddd-dddd-dddd-dddd-dddddddd0001',
    '11111111-1111-1111-1111-111111111111',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001',
    0,
    1200,
    NOW () - INTERVAL '1 day',
    'WAITING',
    NULL,
    NULL
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddd0002',
    '11111111-1111-1111-1111-111111111111',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0013',
    0,
    1200,
    NOW () - INTERVAL '5 days',
    'UNPAID',
    NOW () + INTERVAL '2 days',
    NULL
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddd0003',
    '11111111-1111-1111-1111-111111111111',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0014',
    0,
    1200,
    NOW () - INTERVAL '10 days',
    'LOST',
    NULL,
    NULL
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddd0004',
    '11111111-1111-1111-1111-111111111111',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0015',
    0,
    1200,
    NOW () - INTERVAL '12 days',
    'PAID',
    NOW () - INTERVAL '1 day',
    NOW () - INTERVAL '2 days'
  );