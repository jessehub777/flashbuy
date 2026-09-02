# 🏗️ FlashBuy — 高并发秒杀与抽签售卖平台

[日本語](README.md) | [中文]

> **项目概述**：本项目是一个针对高并发、高负载场景设计的抢购（Flash）与公平抽签（Lottery）综合售卖平台。核心技术验证点包括：基于 Redis Lua 脚本的原子库存扣减（防超卖）、抽签开奖的 Lambda 定时批处理、以及 Terraform 模块化 AWS 基础设施管理。

---

## 1. 系统整体架构图

```mermaid
flowchart TB
    %% 层配色
    classDef client fill:#e8f4fd,stroke:#4a90d9
    classDef net    fill:#f0f7f0,stroke:#5aa85a
    classDef auth   fill:#fdf3e7,stroke:#d98a3d
    classDef biz    fill:#fdeeee,stroke:#d94a4a
    classDef msg    fill:#f5f0fd,stroke:#8a5ad9
    classDef data   fill:#eef7f0,stroke:#4a9d5a
    classDef obs    fill:#f0f0f0,stroke:#888
    classDef cicd   fill:#f0f0f0,stroke:#888

    subgraph CL["客户端"]
        Web["Web App (React + TS)"]
        Console["管理后台 (React)"]
    end

    subgraph NW["网络与接入层"]
        Ingress["Route53 → ACM → ALB"]
    end

    subgraph AU["认证层"]
        Cognito["Amazon Cognito<br/>User Pool / JWT"]
    end

    subgraph BI["业务逻辑层"]
        API["主 API 服务 (Go + Gin)<br/>ECS Fargate Spot"]
        Worker["异步 Worker (Go)<br/>AWS Lambda"]
    end

    subgraph MG["消息中间件层"]
        EB["EventBridge Scheduler"]
        SNS["SNS"]
    end

    subgraph DT["数据层"]
        Aurora["Aurora PostgreSQL 15"]
        Redis["ElastiCache Redis"]
        S3["S3"]
    end

    subgraph OB["可观测性"]
        CW["Grafana + CloudWatch"]
    end

    subgraph CICD["CI/CD & IaC"]
        GH["GitHub Actions + Terraform"]
    end

    %% 主请求链路（实线）
    Web --> Ingress
    Console --> Ingress
    Ingress --> API
    API <-->|认证（SDK 调用 / JWT 验证）| Cognito
    API ==> Aurora
    API ==> Redis
    Web -. 商品图片 .-> S3

    %% 异步链路
    API --> EB
    EB --> Worker
    Worker --> SNS
    Worker ==> Aurora
    Worker ==> Redis

    %% 观测 / 部署
    API -. 日志 .-> CW
    Worker -. 日志 .-> CW
    GH -. 部署 .-> API
    GH -. 部署 .-> Worker

    class Web,Console client
    class Ingress net
    class Cognito auth
    class API,Worker biz
    class EB,SNS msg
    class Aurora,Redis,S3 data
    class CW obs
    class GH cicd
```

> 注：上图为**目标架构**。
>
> 数据库：上图中的 Aurora 为**生产演进目标**；当前采用 **RDS PostgreSQL（provisioned）**，选型理由见 §5.1。异步 Worker（Lambda）承担抽选开奖、订单超时等批处理任务（设计见 §6）。S3 用于商品图片与详情数据的存储。

---

## 2. 技术栈清单

### 2.1 前端

- **Core**: React 19, TypeScript, Vite
- **Styling**: Vanilla CSS, Tailwind CSS
- **State & Data**: Zustand, TanStack Query (React Query)
- **Utilities**: Day.js, Axios

### 2.2 后端 (Go)

- **Framework**: Go 1.26, Gin
- **Database Access**: sqlx, PostgreSQL（当前 RDS PostgreSQL / 生产演进 Aurora，见 §5.1）
- **Cache & Storage**: go-redis/v9 (Redis Lua 脚本原子操作)
- **AWS Integration**: aws-sdk-go-v2
- **Logging & Validation**: Zap, go-playground/validator

### 2.3 云服务与基础设施 (AWS)

- **Compute**: ECS Fargate Spot, AWS Lambda (Go Runtime)
- **Database & Cache**: PostgreSQL（**当前: RDS provisioned** / 生产演进: Aurora Serverless v2, 见 §5.1）, ElastiCache Redis
- **Storage & Lifecycle**: S3 Standard, S3 Standard-IA, S3 Glacier / Deep Archive（生命周期分级存储；商品图片与详情数据）
- **Messaging & Event**: SNS Standard, EventBridge Scheduler
- **Network & Security**: ALB, Route53, ACM, Amazon Cognito
- **Deployment & Monitoring**: CodeDeploy, CloudWatch, Grafana

### 2.4 IaC & CI/CD

- **Terraform** (模块化设计, S3 Remote State + DynamoDB 锁机制)
- **GitHub Actions** (构建、测试、ECR 镜像推送、CodeDeploy 蓝绿部署、Terraform 部署)

---

## 3. 核心数据流

### 3.1 秒杀（抢购）链路

```
[用户] 点击“立即购买”
   ↓
[前端] 请求发送（按钮在处理中置为禁用）
   ↓ POST /api/v1/flash/buy
[API - Gin]
   ① Cognito JWT 身份校验
   ② Redis Lua 原子扣减库存（同步、防超卖）
      ├─ 库存不足 → 返回“已售罄”
      └─ 成功 → 继续
   ③ 事务写入订单 (UNPAID, expires_at = now + 15min)
   ④ 返回响应 { orderId, status: "QUEUED" }
```

> **同步设计依据**：下单链路保持同步完成，因为库存扣减必须依赖 Redis 单线程原子性（超卖防护的根基），无法通过消息队列延迟处理；且用户需要立即得知抢购结果，异步化只会引入轮询/推送的复杂度。订单超时取消与库存回补是独立的批处理任务，部署形态见 §6。

### 3.2 抽签链路

```
[EventBridge Scheduler] draw_at 到达时触发（创建抽选时自动注册一次性 Schedule）
   ↓
[Lambda - LotteryDrawer]
   ① 读取报名列表
   ② 使用 crypto/rand 生成安全随机数
   ③ Fisher-Yates 洗牌算法
   ④ 抽取中签者并批量写入 DB (统一更新 status: UNPAID / LOST)
   ⑤ 发布 SNS 事件 (lottery.drawn)
```

---

## 4. 项目目录结构

```
flashbuy/
├── frontend/                       # React + TypeScript 前端
│   ├── src/
│   │   ├── components/             # 通用组件 (Countdown, TicketCard, PaymentMockModal, OrderStatusModal)
│   │   ├── hooks/                  # 自定义 Hook (useCountdown)
│   │   ├── pages/                  # 页面 (Home, FlashList, Flash, LotteryList, Lottery, Search, MyPage, Admin)
│   │   ├── services/               # API 通信层 (api.ts, request.ts)
│   │   ├── stores/                 # Zustand 状态管理 (authStore, orderStore)
│   │   └── types/                  # TypeScript 类型定义 (index.ts)
├── api/                            # Go API 主服务 (Gin)
│   ├── cmd/server/                 # 入口 (main.go)
│   ├── config/                     # 配置加载 (viper)
│   ├── controllers/                # HTTP 控制器 (auth / flash / lottery / payment / admin / my / search / home)
│   ├── middleware/                 # 中间件 (AuthRequired / RequireRole)
│   ├── models/                     # 数据模型 (db/json tag)
│   ├── pkg/                        # 公共包 (cache / database / logger / response / auth / task)
│   ├── router/                     # 路由定义
│   └── config-local.yaml           # 本地开发配置
├── lambdas/                        # AWS Lambda 异步任务 (LotteryDrawer 等)
├── terraform/                      # Terraform 基础设施定义
│   ├── state/                      # Terraform State 后端（S3 bucket + DynamoDB 锁表）
│   ├── data/                       # 数据层（VPC + RDS PostgreSQL + ElastiCache Redis）
│   ├── auth/                       # 认证层（Cognito User Pool + App Client）
│   └── frontend/                   # 前端托管（S3 + CloudFront）
├── data_design.md                  # 数据结构与后端设计文档
└── README.md
```

---

## 5. 架构决策与权衡（Trade-offs）

| 模块 | 当前采用 | 生产演进 | 权衡考量                                                   |
| :--- | :--- | :--- |:-----------------------------------------------------------|
| **CDN / WAF** | 未引入 | CloudFront + AWS WAF | 当前无真实边缘流量，省略以简化网络架构                 |
| **可观测性** | CloudWatch + Grafana | + AWS X-Ray | 当前结构化日志已满足追踪需求，暂不引入分布式追踪 |
| **SNS** | 开奖结果事件通知（lottery.drawn） | 视场景引入 FIFO | 异步 Worker（开奖 Lambda）通过 SNS 发布业务事件 |
| **数据库** | **RDS PostgreSQL（provisioned）** | Aurora Serverless v2 | 见 §5.1「数据库选型取舍」                                  |
| **Redis** | 单节点模式（主/从） | Cluster 多节点集群 | 当前规模下单节点已足够支撑逻辑与性能验证                   |
| **支付流程** | 状态机 Mock 模拟 | 真实第三方支付 API | 聚焦于支付状态机（UNPAID → PAID → TIMEOUT）的链路逻辑验证  |

### 5.1 数据库选型取舍：RDS vs Aurora Serverless v2

| 维度 | Aurora Serverless v2 | RDS PostgreSQL（当前采用） |
| :--- | :--- | :--- |
| **伸缩性** | 0.5~N ACU 自动扩缩，适配秒杀波峰 | 固定实例规格，需手动/定时扩缩 |
| **高可用** | 原生多可用区 + 读副本 | 需显式开启 Multi-AZ |
| **兼容性** | Aurora PostgreSQL 方言，个别差异 | 完全标准 PostgreSQL，迁移/运维资料最多 |
| **成本** | 最低 0.5 ACU 起步（约 $44/月），闲置也计费 | `db.t4g.micro` 等小规格更可控，**无流量也低费** |
| **运维成熟度** | 较新，运维经验积累尚浅 | 完全标准 PostgreSQL，运维资料与工具链最丰富 |
| **适用场景** | 负载剧烈波动、AWS 原生新项目 | 负载可预测、预算敏感、追求稳定性的常规项目 |

**选型依据**：采用 **RDS PostgreSQL（provisioned）**：
- 当前实例负载接近零，Aurora Serverless v2 最低 0.5 ACU 的常驻计费（约 $44/月）带来不必要的成本开销
- RDS 为标准 PostgreSQL 形态，与既有运维体系（监控、备份、迁移工具）兼容性最好，工具链与运维方案最成熟
- 秒杀波峰场景的负载骤增可通过**预留实例 + 手动/定时扩缩**应对；若未来出现不可预测的流量尖峰，再评估 Aurora Serverless v2 的自动扩缩能力（其架构价值在于此场景）

---

## 6. 异步任务部署形态（Lambda 定位）

### 6.1 订单超时取消 + 库存回补

订单创建时写入 `expires_at`（下单 + 15 分钟）。本任务定时扫描过期未支付订单并回补库存：

| 设计点 | 说明 |
| :--- | :--- |
| 部署 | EventBridge Scheduler 定时触发，独立于 API 生命周期；API 水平扩展时不会产生重复扫描竞争 |
| 幂等 | `WHERE status='UNPAID'` + `RowsAffected` 校验，多实例/多轮触发不会重复取消 |
| 库存回补 | Redis INCR 与 DB stock 同步恢复 |

### 6.2 抽选开奖（Lottery Drawer）

| 特征 | 说明 |
| :--- | :--- |
| 触发时机明确 | 每个抽选商品的 `draw_at` 时间点，由 EventBridge Scheduler 触发 |
| 无实时响应需求 | 用户不等待，纯后台批处理 |
| 运行时间有限 | 从 `lottery_orders` 随机抽 N 条，几秒内完成，远低于 Lambda 15min 上限 |
| 按商品独立调度 | 每创建一个抽选商品就注册一个一次性 Schedule，互不干扰 |

```
创建抽选商品（Admin API）
    → 同时调用 EventBridge Scheduler CreateSchedule
    → 指定 draw_at 时间一次性触发
    → Lambda 执行: 随机选 winner_count 条 lottery_orders 改为 UNPAID，其余改 LOST
    → 触发后自动删除 Schedule
```

### 6.3 部署形态汇总

| 任务 | 部署形态 | 说明 |
| :--- | :--- | :--- |
| 订单超时取消 + 库存回补 | **EventBridge Scheduler + Lambda** | 独立于 API 生命周期，水平扩展无重复扫描 |
| 抽选开奖 | **EventBridge Scheduler + Lambda** | 按 draw_at 一次性触发，批处理，无常驻进程 |

---

## 7. 开源协议

[MIT License](LICENSE)
