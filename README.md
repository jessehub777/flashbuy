# 🏗️ FlashBuy — 大量同時アクセス対応 フラッシュセール・抽選販売プラットフォーム

[日本語] | [中文](README_zh.md)

> **プロジェクト概要**：本プロジェクトは、大量同時アクセス（高負荷）環境を想定して設計された、フラッシュセール（先着購入）および抽選販売を統合したシステムです。Redisによるリアルタイム在庫制御、SQSメッセージキューを用いた非同期注文処理、TerraformによるAWSインフラの自動化など、分散システムの技術検証（PoC）およびアーキテクチャ設計のベストプラクティスを実証することを目的としています。

---

## 1. システム全体アーキテクチャ図

```
┌─────────────────────────────────────────────────────────────────────┐
│                           クライアント層 (Client)                   │
├─────────────────────────────────────────────────────────────────────┤
│   🌐 Web App (React + TS)      🔧 管理コンソール (React)            │
│         │                              │                             │
│         └──────────────┬───────────────┘                             │
└────────────────────────┼──────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   ネットワーク・アクセス層 (Network / Ingress)       │
├─────────────────────────────────────────────────────────────────────┤
│   Route53 (DNS) → ACM (SSL) → ALB (L7 Load Balancer, Cross-AZ)       │
└────────────────────────┼──────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          認証層 (Auth)                              │
├─────────────────────────────────────────────────────────────────────┤
│   Amazon Cognito — User Pool / JWT 発行                             │
└────────────────────────┼──────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         ビジネスロジック層 (Business)                 │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  メイン API サービス (Go + Gin)                              │    │
│  │  デプロイ: ECS Fargate Spot (固定2インスタンス)              │    │
│  │                                                              │    │
│  │  商品モジュール / フラッシュセールモジュール / 抽選モジュール│    │
│  │  コア機能：レートリミッター / 不正リクエスト検知 / Redis Lua在庫減算│    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  非同期ワーカー (Go) — デプロイ: AWS Lambda                   │    │
│  │  Order Creator / Lottery Drawer / Stock Recoverer /          │    │
│  │  Order Timeout Canceller                                     │    │
│  └──────────────────────────────────────────────────────────────┘    │
└────────────────────────┼──────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     メッセージング層 (Messaging)                     │
├─────────────────────────────────────────────────────────────────────┤
│  SQS Standard:  order-create-queue / stock-recover-queue /           │
│                 dead-letter-queue (DLQ)                             │
│  SNS Standard:  order-created / lottery-drawn / system-alert        │
│  EventBridge:   タイムセール開始 / 抽選締め切り / 注文タイムアウト監視  │
└────────────────────────┼──────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          データ層 (Data)                             │
├─────────────────────────────────────────────────────────────────────┤
│  Aurora Serverless v2 (PostgreSQL 15)                                │
│    テーブル: flash_sales / flash_orders / lottery_records / users    │
│                                                                        │
│  ElastiCache Redis — シングルノード構成（プライマリ/レプリカ）        │
│    在庫 (String) / 商品詳細 (Hash) / レートリミット / 分散ロック      │
│                                                                        │
│  S3:  フロントエンドSPAホスティング / 静的画像 / バックアップデータ   │
└────────────────────────┼──────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     可観測性層 (Observability)                       │
├─────────────────────────────────────────────────────────────────────┤
│  Grafana (ECS Fargate) — データソース: CloudWatch                   │
│  CloudWatch: Metrics / Logs / Alarms                                │
└────────────────────────┼──────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       CI/CD & IaC                                   │
├─────────────────────────────────────────────────────────────────────┤
│  GitHub Actions + Terraform (S3 Remote State + DynamoDB Lock)        │
│  AWS CodeDeploy（ECS ブルー/グリーンデプロイ）                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. 技術スタック

### 2.1 フロントエンド
- **Core**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS
- **State & Data**: Zustand, TanStack Query (React Query)
- **Utilities**: Day.js, Axios

### 2.2 バックエンド (Go)
- **Framework**: Go 1.26, Gin
- **Database Access**: sqlx, PostgreSQL (Aurora)
- **Cache & Storage**: go-redis/v9 (Redis Lua Scripting)
- **AWS Integration**: aws-sdk-go-v2
- **Logging & Validation**: Zap, go-playground/validator

### 2.3 クラウド・インフラ (AWS)
- **Compute**: ECS Fargate Spot, AWS Lambda (Go Runtime)
- **Database & Cache**: Aurora Serverless v2 (PostgreSQL 15), ElastiCache Redis
- **Messaging & Event**: SQS Standard, SNS Standard, EventBridge
- **Network & Security**: ALB, Route53, ACM, Amazon Cognito
- **Deployment & Monitoring**: CodeDeploy, CloudWatch, Grafana

### 2.4 IaC & CI/CD
- **Terraform** (モジュール化構成, S3 Remote State + DynamoDB Lock)
- **GitHub Actions** (ビルド、テスト、ECRプッシュ、Terraform反映)

---

## 3. コアデータフロー

### 3.1 フラッシュセール（先着購入）フロー
```
[ユーザー] 「今すぐ購入」をクリック
   ↓
[フロントエンド] 防振（Debounce）処理 + リクエスト送信
   ↓ POST /api/flash/buy
[API - Gin]
   ① レートリミッター（Token Bucket）
   ② Cognito JWT 認証チェック
   ③ 不正リクエスト検知（IP / ユーザー単位制限）
   ④ Redis Lua によるアトミック在庫減算
      ├─ 在庫なし → 「売り切れ」を返却
      └─ 成功 → 継続
   ⑤ SQS メッセージ送信 (order-create-queue)
   ⑥ レスポンス { orderNo, status: "QUEUED" } を返却
   ↓ 非同期処理
[Lambda - OrderCreator]
   ⑦ SQS メッセージを受信・処理
   ⑧ Aurora トランザクション処理 (PENDING 状態で注文作成)
   ⑨ SNS トピック発行 (order.created)
```

### 3.2 抽選フロー
```
[管理者/EventBridge] 抽選開始トリガー
   ↓
[Lambda - LotteryDrawer]
   ① Aurora から応募者リストを取得
   ② crypto/rand による安全な乱数生成
   ③ Fisher-Yates アルゴリズムによるシャッフル
   ④ 当選者の抽出と DB へのバッチ書き込み
   ⑤ SNS トピック発行 (lottery.drawn)
```

---

## 4. プロジェクト構造

```
flashbuy/
├── api/                            # Go API メインサービス
├── lambdas/                        # AWS Lambda 非同期ワーカー
├── frontend/                       # React + TypeScript フロントエンド
├── terraform/                      # Terraform インフラ定義
│   ├── modules/                    # 共通モジュール
│   └── environments/               # dev / prod 環境構成
├── scripts/                        # プレウォーム / テスト用スクリプト
├── docs/                           # 詳細ドキュメント
├── docker-compose.yml              # ローカル開発環境配置
└── README.md
```

---

## 5. 設計上の考慮事項とトレードオフ

プロトタイプ開発において、実効性の高い検証と運用の実現可能性を考慮し、以下のトレードオフを選択しています：

| 項目 | 本構成 (PoC) | 本番環境 (Production) | 採用理由・トレードオフ |
| --- | --- | --- | --- |
| **CDN / WAF** | 未導入 | CloudFront + AWS WAF | 本環境ではエッジキャッシュ検証用トラフィックがないため省略 |
| **可観測性** | CloudWatch + Grafana | + AWS X-Ray | 単一運用者のためログ集約と構造化ログで十分な追跡性を確保 |
| **SQS / SNS** | Standard モード | 状況に応じ FIFO | スループット優先のため、厳密な順序制御を省略 |
| **Redis** | シングルノード構成 | Cluster 3ノード以上 | ロジック検証において単一ノードで十分なスループットを維持できるため |
| **決済処理** | ステートマシン Mock | 外部決済 API | 決済状態遷移（PENDING → PAID → TIMEOUT）のロジック検証に特化 |

---

## 6. ライセンス

[MIT License](LICENSE)
