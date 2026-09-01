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
  detail_json TEXT, -- 商品仕様・注意事項（JSON）
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
  detail_json TEXT, -- 商品仕様・注意事項（JSON）
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
    '21e7f4a9-5c2b-4d8e-9a13-6f0b2c1d4e51',
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
    '7b3d9e21-8a4f-4c6b-9d52-1e0f7a3c8b62',
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
    '4c8a1f63-2d5e-4b9a-8c07-3f6e2a9d1b73',
    'フロンティアリーグ チャンピオンシップ決勝 ゴール裏SS席',
    '2026 フロンティアリーグチャンピオンシップ決勝のゴール裏SS席チケット。',
    8800,
    15,
    100,
    NOW () - INTERVAL '2 hours',
    NOW () + INTERVAL '6 hours',
    'スポーツ観戦',
    2920
  ),
  (
    '9e2b5d47-1a8c-4f3b-9d60-7c4a2e8b1f84',
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
    '3a6f8c12-9b4d-4e7a-8f35-2d1c9b6e4a95',
    'アロマリウ 限定香水「夜の庭園」エディション',
    'フローラルとムスクを基調とした数量限定のオリジナル香水。1本限りの特別ボトルデザイン。',
    29800,
    5,
    30,
    NOW () - INTERVAL '10 minutes',
    NOW () + INTERVAL '5 hours',
    '限定フレグランス',
    2640
  ),
  (
    '6d1c4b89-3e7f-4a2b-9c58-4b8f3d2a6e06',
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
    '8f2e7a54-1c9b-4d3a-8b27-5e6c4f1a9d17',
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
    '2b9d3c68-7a4e-4f1b-9c43-8d7e5a2f1b28',
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
    '5c4a8b73-2f6d-4e9b-8a14-9d3c7e6b2f39',
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
    '1e7f2d95-4b8a-4c6d-9f23-6a4d8c1e3b40',
    'アロマリウ 限定香水「朝露の森」エディション',
    'フレグランスブランド「アロマリウ」の数量限定香水。森の朝露をイメージした香り。',
    22000,
    12,
    50,
    NOW () - INTERVAL '40 minutes',
    NOW () + INTERVAL '2 hours 30 minutes',
    '限定香水',
    1940
  ),
  (
    '9a3b6c81-2d4f-4e8a-9c57-3f1e7b4d2a51',
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
    '4d8e1a62-7c3b-4f9a-8d24-5b6e2c9a1f62',
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
    '7c2f5d93-1a8b-4e4c-9b36-8d4a3f1e7c73',
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
    '3f6a9b84-2c7d-4e1b-9a45-6c8d2f4b3e84',
    'MOONWAVE 15周年記念フィギュア「星奏」',
    '音楽ユニット「MOONWAVE」の15周年を記念したオリジナルフィギュア。',
    14800,
    80,
    80,
    NOW () + INTERVAL '1 day 6 hours',
    NOW () + INTERVAL '3 days',
    'グッズ・フィギュア',
    1380
  ),
  (
    '6b1d4c75-9e3a-4f8b-8c12-4a7e5d3f1b95',
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
    '2a8c7e46-1d4b-4f3a-9e23-7b6c4a2f8d06',
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
    '8d4c1a98-2f7b-4e3a-9c25-6f1b8d4a3e28',
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
    chosen_price,
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
    'a1c9e3b7-4d8f-4a2b-9c16-7e5d3f1a8b41',
    '銀河少年団 ファンミーティング 2026 参加権',
    '6年ぶりとなる「銀河少年団」のファンミーティング参加権。全員ハイタッチ付き。',
    0,
    12000,
    500,
    48200,
    NOW () - INTERVAL '7 days',
    NOW () + INTERVAL '5 days',
    NOW () + INTERVAL '6 days',
    'アイドル・ファンイベント',
    4100
  ),
  (
    'c4d7a2e9-1f3b-4c8a-9d52-6b4e2a7c3f52',
    'ワンダーパーク 竜城エリア 完全貸切体験',
    '抽選で選ばれた20名が「ワンダーパーク」の竜城エリアを1時間完全貸切。',
    0,
    5000,
    20,
    35600,
    NOW () - INTERVAL '7 days',
    NOW () + INTERVAL '3 days 12 hours',
    NOW () + INTERVAL '4 days',
    'テーマパーク',
    3920
  ),
  (
    'e8b3f5c1-9a2d-4e7b-8c34-5f6a1d9e2b63',
    '富士山 初日の出 特別観覧席 ご招待',
    '富士山五合目の特別観覧席から初日の出を鑑賞。',
    0,
    3000,
    50,
    8900,
    NOW () - INTERVAL '7 days',
    NOW () + INTERVAL '10 days',
    NOW () + INTERVAL '11 days',
    '自然・絶景体験',
    3740
  ),
  (
    'b2a6d4e7-3c8f-4b1a-9f25-8d7c4e3a1f74',
    'ノーザンスターズ 全選手サイン入り公式ボール',
    'プロ野球チーム「ノーザンスターズ」現役全選手のサイン入り公式ボール。',
    0,
    8800,
    10,
    12300,
    NOW () - INTERVAL '7 days',
    NOW () + INTERVAL '2 days',
    NOW () + INTERVAL '2 days 12 hours',
    'スポーツグッズ',
    3560
  ),
  (
    'd5c8a1f3-7e2b-4a9c-8b46-3f1d7e5c2a85',
    '星詠フェス 2026 声優トークショー 参加権',
    '音声ドラマ「星詠フェス」キャストによるトークショー参加権。',
    0,
    2500,
    100,
    22400,
    NOW () - INTERVAL '7 days',
    NOW () + INTERVAL '7 days',
    NOW () + INTERVAL '8 days',
    '声優イベント',
    3380
  ),
  (
    'f1e4b9c2-8d3a-4c7b-9a35-2e6d4f1b8c96',
    '首都歴史博物館「古代エジプト展」優先入場権',
    '通常入場より1時間早く入場できる優先入場権。',
    0,
    1500,
    200,
    5600,
    NOW () - INTERVAL '7 days',
    NOW () + INTERVAL '4 days',
    NOW () + INTERVAL '4 days 18 hours',
    '美術館・博物館',
    3200
  ),
  (
    'a3c6e8d1-2f4b-4a1c-9b47-5d8e3c6f1a07',
    'フロンティアリーグ 優勝セレモニー ピッチサイド最前列',
    '優勝チームのセレモニーをピッチサイド最前列で観戦できる招待権。',
    0,
    9800,
    30,
    18900,
    NOW () - INTERVAL '7 days',
    NOW () + INTERVAL '1 day 8 hours',
    NOW () + INTERVAL '1 day 10 hours',
    'スポーツ観戦',
    3020
  ),
  (
    'c7d1a4e9-3b8f-4c2a-9d58-6f2e4b7c3a18',
    '大河川花火大会 屋形船 乗船権',
    '大河川花火大会を屋形船から鑑賞できる特別乗船権。',
    0,
    12000,
    20,
    31000,
    NOW () - INTERVAL '7 days',
    NOW () + INTERVAL '6 days',
    NOW () + INTERVAL '7 days',
    '季節・祭りイベント',
    2840
  ),
  (
    'e2b5d8c3-1f7a-4e3b-9c69-4a7d2e5f1b29',
    'CoreBox 6 先行体験会 参加権',
    '次世代ゲーム機「CoreBox 6」の正式発表前の先行体験会参加権。',
    0,
    1000,
    50,
    95000,
    NOW () + INTERVAL '6 hours',
    NOW () + INTERVAL '2 days 6 hours',
    NOW () + INTERVAL '3 days',
    'ゲーム体験会',
    2660
  ),
  (
    'b9c3e6a2-4d1f-4a8b-9d71-3f5e2c8a4b30',
    'マジカルキャッスル 新エリア グランドオープン前プレビュー',
    '大型テーマパーク「マジカルキャッスル」の新エリアを一般公開の1週間前に体験できるプレビュー参加権。',
    0,
    4000,
    300,
    120000,
    NOW () + INTERVAL '2 days',
    NOW () + INTERVAL '8 days',
    NOW () + INTERVAL '9 days',
    'テーマパーク',
    2480
  ),
  (
    'd4e7a1c5-9b3f-4c2a-8e82-5a6f3d1c7e41',
    'MOONWAVE 非公開スタジオライブ 招待',
    '音楽ユニット「MOONWAVE」の非公開スタジオライブ招待。現在抽選中。',
    0,
    9000,
    30,
    68000,
    NOW () - INTERVAL '7 days',
    NOW () - INTERVAL '2 hours',
    NOW () + INTERVAL '10 hours',
    'ライブ・コンサート',
    2300
  ),
  (
    'a8c2e5d9-1f4b-4a7c-9b93-6d7e4f2a8c52',
    '「炎獄の守護者」展覧会 VIP鑑賞会 参加権',
    '人気アニメ「炎獄の守護者」展のVIP鑑賞会参加権。',
    0,
    3500,
    50,
    41500,
    NOW () - INTERVAL '7 days',
    NOW () - INTERVAL '5 hours',
    NOW () + INTERVAL '3 hours',
    'アニメ・展覧会',
    2120
  ),
  (
    'c5d8b2e6-3a7f-4c1b-9d14-7e5a3f6c2b63',
    'THUNDER CROWS 全国アリーナツアー 大阪公演',
    'バンド「THUNDER CROWS」のアリーナツアー大阪公演。',
    8500,
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
    'e1f4c7d3-9b2a-4e8b-8c25-4f6d1a9e3c74',
    '限定カラービニール盤「ボイスノイドクラシックス Vol.1」',
    'バーチャルシンガー「ボイスノイド」の人気楽曲をアナログレコード化。',
    6800,
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
    'b6c9d3e7-2f5a-4c1b-9a36-5d8e4f2a7c85',
    '首都国際スポーツ大会 公式記念品 特別抽選',
    '首都国際スポーツ大会関連の公式記念品特別抽選キャンペーン。',
    0,
    5000,
    500,
    280000,
    NOW () - INTERVAL '30 days',
    NOW () - INTERVAL '20 days',
    NOW () - INTERVAL '15 days',
    'スポーツ記念品',
    1580
  ),
  (
    'd3e6a9c1-7b4f-4a2c-9b47-6f1e5c3d8a96',
    'つきしろ空 直筆サイン入り歌詞カード 抽選',
    'シンガーソングライター「つきしろ空」の直筆歌詞カードプレゼントキャンペーン。',
    0,
    2000,
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
    'f1a2c3b4-5d6e-4f7a-8b91-2c3d4e5f6a07',
    '9744da98-5011-70f4-36dc-f619e87e5ce2',
    '21e7f4a9-5c2b-4d8e-9a13-6f0b2c1d4e51',
    12000,
    'PAID',
    NOW () - INTERVAL '2 days',
    NOW () + INTERVAL '15 minutes',
    NOW () - INTERVAL '2 days'
  ),
  (
    'a7b8c9d1-2e3f-4a4b-9c52-3d4e5f6a7b18',
    '9744da98-5011-70f4-36dc-f619e87e5ce2',
    '3a6f8c12-9b4d-4e7a-8f35-2d1c9b6e4a95',
    29800,
    'UNPAID',
    NULL,
    NOW () + INTERVAL '5 minutes',
    NOW () - INTERVAL '10 minutes'
  ),
  (
    'b2c3d4e5-6f7a-4b8c-9d13-4e5f6a7b8c29',
    '9744da98-5011-70f4-36dc-f619e87e5ce2',
    '4c8a1f63-2d5e-4b9a-8c07-3f6e2a9d1b73',
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
    'd1e2f3a4-5b6c-4c7d-8e94-5f6a7b8c9d30',
    '9744da98-5011-70f4-36dc-f619e87e5ce2',
    'a1c9e3b7-4d8f-4a2b-9c16-7e5d3f1a8b41',
    0,
    1200,
    NOW () - INTERVAL '1 day',
    'WAITING',
    NULL,
    NULL
  ),
  (
    'e5f6a7b8-9c0d-4d1e-9f25-6a7b8c9d0e41',
    '9744da98-5011-70f4-36dc-f619e87e5ce2',
    'c5d8b2e6-3a7f-4c1b-9d14-7e5a3f6c2b63',
    0,
    1200,
    NOW () - INTERVAL '5 days',
    'UNPAID',
    NOW () + INTERVAL '2 days',
    NULL
  ),
  (
    'f9a0b1c2-3d4e-4e5f-9a36-7b8c9d0e1f52',
    '9744da98-5011-70f4-36dc-f619e87e5ce2',
    'c7d1a4e9-3b8f-4c2a-9d58-6f2e4b7c3a18',
    0,
    1200,
    NOW () - INTERVAL '10 days',
    'LOST',
    NULL,
    NULL
  ),
  (
    'a3b4c5d6-7e8f-4f1a-9b47-8c9d0e1f2a63',
    '9744da98-5011-70f4-36dc-f619e87e5ce2',
    'b6c9d3e7-2f5a-4c1b-9a36-5d8e4f2a7c85',
    0,
    1200,
    NOW () - INTERVAL '12 days',
    'PAID',
    NOW () - INTERVAL '1 day',
    NOW () - INTERVAL '2 days'
  );