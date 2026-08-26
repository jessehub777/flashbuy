# 🏗️ FlashBuy — 大量同時アクセス対応 フラッシュセール・抽選販売プラットフォーム

[日本語] | [中文](README_zh.md)

> **プロジェクト概要**：本プロジェクトは、大量同時アクセス（高負荷）環境を想定して設計された、フラッシュセール（先着購入）および抽選販売を統合したシステムです。主要な技術検証ポイントは、Redis Lua スクリプトによるアトミック在庫減算（超売り防止）、抽選開票の Lambda 定期バッチ処理、Terraform によるモジュール化 AWS インフラ管理です。

---

## 1. システム全体アーキテクチャ図

```mermaid
flowchart TB
    %% レイヤー配色
    classDef client fill:#e8f4fd,stroke:#4a90d9
    classDef net    fill:#f0f7f0,stroke:#5aa85a
    classDef auth   fill:#fdf3e7,stroke:#d98a3d
    classDef biz    fill:#fdeeee,stroke:#d94a4a
    classDef msg    fill:#f5f0fd,stroke:#8a5ad9
    classDef data   fill:#eef7f0,stroke:#4a9d5a
    classDef obs    fill:#f0f0f0,stroke:#888
    classDef cicd   fill:#f0f0f0,stroke:#888

    subgraph CL["クライアント層"]
        Web["Web App (React + TS)"]
        Console["管理コンソール (React)"]
    end

    subgraph NW["ネットワーク・アクセス層"]
        Ingress["Route53 → ACM → ALB"]
    end

    subgraph AU["認証層"]
        Cognito["Amazon Cognito<br/>User Pool / JWT"]
    end

    subgraph BI["ビジネスロジック層"]
        API["メイン API サービス (Go + Gin)<br/>ECS Fargate Spot"]
        Worker["非同期ワーカー (Go)<br/>AWS Lambda"]
    end

    subgraph MG["メッセージング層"]
        EB["EventBridge Scheduler"]
        SNS["SNS"]
    end

    subgraph DT["データ層"]
        Aurora["Aurora PostgreSQL 15"]
        Redis["ElastiCache Redis"]
        S3["S3"]
    end

    subgraph OB["可観測性"]
        CW["Grafana + CloudWatch"]
    end

    subgraph CICD["CI/CD & IaC"]
        GH["GitHub Actions + Terraform"]
    end

    %% メインリクエスト経路（実線）
    Web --> Ingress
    Console --> Ingress
    Ingress --> API
    API <-->|認証（SDK 呼び出し / JWT 検証）| Cognito
    API ==> Aurora
    API ==> Redis
    Web -. 商品画像 .-> S3

    %% 非同期経路
    API --> EB
    EB --> Worker
    Worker --> SNS
    Worker ==> Aurora
    Worker ==> Redis

    %% 監視 / デプロイ
    API -. ログ .-> CW
    Worker -. ログ .-> CW
    GH -. デプロイ .-> API
    GH -. デプロイ .-> Worker

    class Web,Console client
    class Ingress net
    class Cognito auth
    class API,Worker biz
    class EB,SNS msg
    class Aurora,Redis,S3 data
    class CW obs
    class GH cicd
```

> 注：上図は**目標アーキテクチャ**。
>
> データベース：図中の Aurora は**本番進化の目標**。現在は **RDS PostgreSQL（provisioned）** を採用（選定理由は §5.1）。非同期ワーカー（Lambda）は抽選開票・注文タイムアウト等のバッチ処理を担う（設計は §6）。S3 は商品画像・詳細データの保存に使用する。

---

## 2. 技術スタック

### 2.1 フロントエンド

- **Core**: React 19, TypeScript, Vite
- **Styling**: Vanilla CSS, Tailwind CSS
- **State & Data**: Zustand, TanStack Query (React Query)
- **Utilities**: Day.js, Axios

### 2.2 バックエンド (Go)

- **Framework**: Go 1.26, Gin
- **Database Access**: sqlx, PostgreSQL（現在は RDS PostgreSQL / 本番進化は Aurora、§5.1 参照）
- **Cache & Storage**: go-redis/v9 (Redis Lua Scripting)
- **AWS Integration**: aws-sdk-go-v2
- **Logging & Validation**: Zap, go-playground/validator

### 2.3 クラウド・インフラ (AWS)

- **Compute**: ECS Fargate Spot, AWS Lambda (Go Runtime)
- **Database & Cache**: PostgreSQL（**現在: RDS provisioned** / 本番進化: Aurora Serverless v2、§5.1 参照）, ElastiCache Redis
- **Storage & Lifecycle**: S3 Standard, S3 Standard-IA, S3 Glacier / Deep Archive（ライフサイクル階層ストレージ；商品画像・詳細データ）
- **Messaging & Event**: SNS Standard, EventBridge Scheduler
- **Network & Security**: ALB, Route53, ACM, Amazon Cognito
- **Deployment & Monitoring**: CodeDeploy, CloudWatch, Grafana

### 2.4 IaC & CI/CD

- **Terraform** (モジュール化構成, S3 Remote State + DynamoDB Lock)
- **GitHub Actions** (ビルド、テスト、ECRプッシュ、CodeDeploy ブルー/グリーンデプロイ、Terraform反映)

---

## 3. コアデータフロー

### 3.1 フラッシュセール（先着購入）フロー

```
[ユーザー] 「今すぐ購入」をクリック
   ↓
[フロントエンド] リクエスト送信（処理中はボタンを無効化）
   ↓ POST /api/v1/flash/buy
[API - Gin]
   ① Cognito JWT 認証チェック
   ② Redis Lua によるアトミック在庫減算（同期・超売り防止）
      ├─ 在庫なし → 「売り切れ」を返却
      └─ 成功 → 継続
   ③ トランザクションで注文作成 (UNPAID, expires_at = now + 15min)
   ④ レスポンス { orderId, status: "QUEUED" } を返却
```

> **同期設計の根拠**：購入パスは同期で完了する。在庫減算は Redis の単一スレッド原子性（超売り防止の基盤）に依存するため、メッセージキューによる遅延処理には置き換えられない。また、ユーザーは購入結果を即座に知る必要があり、非同期化はポーリングやプッシュの複雑さを招くだけである。注文タイムアウト取消と在庫復元は独立したバッチ処理であり、デプロイ形態は §6 参照。

### 3.2 抽選フロー

```
[EventBridge Scheduler] draw_at 到達時にトリガー（抽選作成時に一回限りの Schedule を自動登録）
   ↓
[Lambda - LotteryDrawer]
   ① 応募者リストを取得
   ② crypto/rand による安全な乱数生成
   ③ Fisher-Yates アルゴリズムによるシャッフル
   ④ 当選者の抽出と DB へのバッチ書き込み (status: UNPAID / LOST に統一更新)
   ⑤ SNS トピック発行 (lottery.drawn)
```

---

## 4. プロジェクト構造

```
flashbuy/
├── frontend/                       # React + TypeScript フロントエンド
│   ├── src/
│   │   ├── components/             # 共通コンポーネント (Countdown, TicketCard, PaymentMockModal, OrderStatusModal)
│   │   ├── hooks/                  # カスタムフック (useCountdown)
│   │   ├── pages/                  # 画面 (Home, FlashList, Flash, LotteryList, Lottery, Search, MyPage, Admin)
│   │   ├── services/               # API 通信層 (api.ts, request.ts)
│   │   ├── stores/                 # Zustand 状態管理 (authStore, orderStore)
│   │   └── types/                  # TypeScript 型定義 (index.ts)
├── api/                            # Go API メインサービス (Gin)
│   ├── cmd/server/                 # エントリポイント (main.go)
│   ├── config/                     # 設定読み込み (viper)
│   ├── controllers/                # HTTP コントローラー (auth / flash / lottery / payment / admin / my / search / home)
│   ├── middleware/                 # ミドルウェア (AuthRequired / RequireRole)
│   ├── models/                     # データモデル (db/json tag)
│   ├── pkg/                        # 共通パッケージ (cache / database / logger / response / auth / task)
│   ├── router/                     # ルーティング定義
│   └── config-local.yaml           # ローカル開発用設定
├── lambdas/                        # AWS Lambda 非同期ワーカー (LotteryDrawer 等)
├── terraform/                      # Terraform インフラ定義
│   ├── state/                      # Terraform State 基盤（S3バケット + DynamoDB ロックテーブル）
│   ├── data/                       # データ層（VPC + RDS PostgreSQL + ElastiCache Redis）
│   ├── auth/                       # 認証層（Cognito User Pool + App Client）
│   └── frontend/                   # フロントホスティング（S3 + CloudFront）
├── data_design.md                  # データ構造・バックエンド設計ドキュメント
└── README.md
```

---

## 5. 設計上の考慮事項とトレードオフ

| 項目 | 現在採用 | 本番進化 | 採用理由・トレードオフ                                             |
| :--- | :--- | :--- |:-------------------------------------------------------------------|
| **CDN / WAF** | 未導入 | CloudFront + AWS WAF | 本環境ではエッジキャッシュ検証用トラフィックがないため省略         |
| **可観測性** | CloudWatch + Grafana | + AWS X-Ray | 現段階では構造化ログで追跡要件を満たせるため、分散トレーシングは未導入 |
| **SNS** | 開票結果イベント通知（lottery.drawn） | 状況に応じ FIFO | 非同期ワーカー（開票 Lambda）が SNS でビジネスイベントを発行 |
| **データベース** | **RDS PostgreSQL（provisioned）** | Aurora Serverless v2 | §5.1「データベース選定のトレードオフ」参照                |
| **Redis** | シングルノード構成 | Cluster 3ノード以上 | ロジック検証において単一ノードで十分なスループットを維持できるため |
| **決済処理** | ステートマシン Mock | 外部決済 API | 決済状態遷移（UNPAID → PAID → TIMEOUT）のロジック検証に特化            |

### 5.1 データベース選定のトレードオフ：RDS vs Aurora Serverless v2

| 観点 | Aurora Serverless v2 | RDS PostgreSQL（現在採用） |
| :--- | :--- | :--- |
| **スケーラビリティ** | 0.5〜N ACU で自動スケール。フラッシュセールのピークに最適 | 固定インスタンス。手動・定期スケールが必要 |
| **高可用性** | ネイティブなマルチAZ + リードレプリカ | Multi-AZ を明示的に有効化する必要あり |
| **互換性** | Aurora PostgreSQL 方言で一部差異 | 完全な標準 PostgreSQL。移行・運用情報が最多 |
| **コスト** | 最低 0.5 ACU から（約$44/月）、アイドルでも課金 | `db.t4g.micro` 等の小規模がコントロールしやすく、**無トラフィックでも低コスト** |
| **運用成熟度** | 新しいため運用ノウハウの蓄積が浅い | 完全な標準 PostgreSQL。運用情報・ツールチェーンが最も豊富 |
| **適用シーン** | 負荷変動が激しい、AWSネイティブの新規案件 | 負荷予測が容易、予算重視、安定性を重視する一般的な案件 |

**選定理由**：**RDS PostgreSQL（provisioned）** を採用：
- 現在のインスタンス負荷はほぼゼロ。Aurora Serverless v2 の最低 0.5 ACU 常駐課金（約$44/月）は不要なコスト
- RDS は標準 PostgreSQL 形態であり、既存の運用体系（監視・バックアップ・移行ツール）との親和性が最も高く、ツールチェーンと運用ノウハウが最も成熟
- フラッシュセールのピークによる負荷急増は**予約インスタンス + 手動/定期スケール**で対応可能。将来、予測不能なトラフィック尖峰が発生する場合は、自動スケール能力を持つ Aurora Serverless v2（アーキテクチャ図の本番進化目標）への移行を再評価する

---

## 6. 非同期タスクのデプロイ形態（Lambda の位置づけ）

### 6.1 注文タイムアウト取消 + 在庫復元

注文作成時に `expires_at`（注文 + 15分）を設定する。本タスクは期限切れの未払い注文を定期的にスキャンし、在庫を復元する：

| 設計ポイント | 説明 |
| :--- | :--- |
| デプロイ | EventBridge Scheduler による定期トリガー。API ライフサイクルから独立し、水平スケール時も重複スキャン競合が発生しない |
| 冪等性 | `WHERE status='UNPAID'` + `RowsAffected` で検証し、複数インスタンス・複数回トリガーでも二重取消が発生しない |
| 在庫復元 | Redis INCR と DB stock を同期して復元 |

### 6.2 抽選開票（Lottery Drawer）

| 特徴 | 説明 |
| :--- | :--- |
| トリガー時期が明確 | 各抽選商品の `draw_at` 時点に EventBridge Scheduler がトリガー |
| リアルタイム応答不要 | ユーザーは待たない。純粋なバッチ処理 |
| 実行時間が短い | `lottery_orders` から N件をランダム抽出するだけ。数秒で完了し、Lambda 15分上限に余裕 |
| 商品ごとに独立スケジュール | 抽選商品を作成するたびに一回限りの Schedule を登録し、互いに干渉しない |

```
抽選商品の作成（Admin API）
    → 同時に EventBridge Scheduler CreateSchedule を呼ぶ
    → draw_at 時刻に一回だけトリガー
    → Lambda 実行: winner_count 件の lottery_orders を UNPAID に、残りを LOST に更新
    → トリガー後、Schedule を自動削除
```

### 6.3 デプロイ形態まとめ

| タスク | デプロイ形態 | 説明 |
| :--- | :--- | :--- |
| 注文タイムアウト取消 + 在庫復元 | **EventBridge Scheduler + Lambda** | API ライフサイクルから独立し、水平スケール時も重複スキャンなし |
| 抽選開票 | **EventBridge Scheduler + Lambda** | draw_at に一回限りトリガー、バッチ処理、常駐プロセス不要 |

---

## 7. ライセンス

[MIT License](LICENSE)
