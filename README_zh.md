# 🏗️ FlashBuy — 高并发秒杀与抽签售卖平台

[日本語](README.md) | [中文]

> **项目概述**：本项目是一个针对高并发、高负载场景设计的抢购（Flash）与公平抽签（Lottery）综合售卖平台。项目重点展示基于 Redis 的原子库存扣减、SQS 异步解耦订单处理、以及基于 Terraform 的 AWS 自动化基础设施搭建，旨在进行分布式系统架构设计与工程权衡的技术验证（PoC）。

---

## 1. 系统整体架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                              客户端 (Client)                        │
├─────────────────────────────────────────────────────────────────────┤
│   🌐 Web App (React + TS)      🔧 管理后台 (React)                  │
│         │                              │                             │
│         └──────────────┬───────────────┘                             │
└────────────────────────┼──────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   网络与接入层 (Network / Ingress)                   │
├─────────────────────────────────────────────────────────────────────┤
│   Route53 (DNS) → ACM (SSL) → ALB (L7 负载均衡, 跨可用区)            │
└────────────────────────┼──────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          认证层 (Auth)                              │
├─────────────────────────────────────────────────────────────────────┤
│   Amazon Cognito — User Pool / JWT 签发                             │
└────────────────────────┼──────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          业务逻辑层 (Business)                       │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  主 API 服务 (Go + Gin)                                      │    │
│  │  部署: ECS Fargate Spot (固定2实例)                          │    │
│  │                                                              │    │
│  │  商品模块 / 秒杀模块 / 抽签模块                              │    │
│  │  核心功能：限流器 / 恶意请求检测 / Redis Lua 原子扣减        │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  异步 Worker (Go) — 部署: AWS Lambda                         │    │
│  │  Order Creator / Lottery Drawer / Stock Recoverer /          │    │
│  │  Order Timeout Canceller                                     │    │
│  └──────────────────────────────────────────────────────────────┘    │
└────────────────────────┼──────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          消息中间件层 (Messaging)                   │
├─────────────────────────────────────────────────────────────────────┤
│  SQS Standard:  order-create-queue / stock-recover-queue /           │
│                 dead-letter-queue (DLQ)                             │
│  SNS Standard:  order-created / lottery-drawn / system-alert        │
│  EventBridge:   定时活动触发 / 抽签截止触发 / 超时订单扫描          │
└────────────────────────┼──────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          数据层 (Data)                              │
├─────────────────────────────────────────────────────────────────────┤
│  Aurora Serverless v2 (PostgreSQL 15)                                │
│    数据表: flash_items / flash_orders / lottery_items /             │
│            lottery_orders / users                                   │
│                                                                        │
│  ElastiCache Redis — 单节点模式（主/从）                             │
│    库存 (String) / 商品详情 (Hash) / 限流器 / 分布式锁               │
│                                                                        │
│  S3:  前端 SPA 静态托管 / 商品图片 / 静态详情 Payload JSON /          │
│       Glacier 归档 (支持 6m / 1y / 3y 时间轴存储阶梯搜索)            │
└────────────────────────┼──────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          可观测性层 (Observability)                 │
├─────────────────────────────────────────────────────────────────────┤
│  Grafana (ECS Fargate) — 数据源: CloudWatch                         │
│  CloudWatch: Metrics / Logs / Alarms                                │
└────────────────────────┼──────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       CI/CD & IaC                                   │
├─────────────────────────────────────────────────────────────────────┤
│  GitHub Actions + Terraform (S3 Remote State + DynamoDB 锁机制)      │
│  AWS CodeDeploy（ECS 蓝绿部署）                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. 技术栈清单

### 2.1 前端

- **Core**: React 19, TypeScript, Vite
- **Styling**: Vanilla CSS, Tailwind CSS
- **State & Data**: Zustand, TanStack Query (React Query)
- **Utilities**: Day.js, Axios

### 2.2 后端 (Go)

- **Framework**: Go 1.26, Gin
- **Database Access**: sqlx, PostgreSQL (Aurora)
- **Cache & Storage**: go-redis/v9 (Redis Lua 脚本原子操作)
- **AWS Integration**: aws-sdk-go-v2
- **Logging & Validation**: Zap, go-playground/validator

### 2.3 云服务与基础设施 (AWS)

- **Compute**: ECS Fargate Spot, AWS Lambda (Go Runtime)
- **Database & Cache**: Aurora Serverless v2 (PostgreSQL 15), ElastiCache Redis
- **Storage & Lifecycle**: S3 Standard, S3 Standard-IA, S3 Glacier / Deep Archive (时间轴存储阶梯搜索)
- **Messaging & Event**: SQS Standard, SNS Standard, EventBridge
- **Network & Security**: ALB, Route53, ACM, Amazon Cognito
- **Deployment & Monitoring**: CodeDeploy, CloudWatch, Grafana

### 2.4 IaC & CI/CD

- **Terraform** (模块化设计, S3 Remote State + DynamoDB 锁机制)
- **GitHub Actions** (构建、测试、ECR 镜像推送、Terraform 部署)

---

## 3. 核心数据流

### 3.1 秒杀（抢购）链路

```
[用户] 点击“立即购买”
   ↓
[前端] 防抖处理 + 请求发送
   ↓ POST /api/flash/buy
[API - Gin]
   ① 限流器 (Token Bucket)
   ② Cognito JWT 身份校验
   ③ 恶意请求检测（IP / 用户维度）
   ④ Redis Lua 原子扣减库存
      ├─ 库存不足 → 返回“已售罄”
      └─ 成功 → 继续
   ⑤ SQS 发送消息 (order-create-queue)
   ⑥ 返回响应 { status: "QUEUED" }
   ↓ 异步处理
[Lambda - OrderCreator]
   ⑦ 消费 SQS 消息
   ⑧ Aurora 事务写入 (UNPAID 状态订单)
   ⑨ 发布 SNS 事件 (order.created)
```

### 3.2 抽签链路

```
[管理员/EventBridge] 触发抽签
   ↓
[Lambda - LotteryDrawer]
   ① 从 Aurora 读取报名列表
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
│   │   ├── components/             # 通用组件 (Countdown, TicketCard, PaymentMockModal)
│   │   ├── pages/                  # 页面 (Home, FlashList, Flash, LotteryList, Lottery, Search, MyPage, Admin)
│   │   ├── services/               # API 服务与 Mock 数据 (api.ts)
│   │   ├── stores/                 # Zustand 状态管理 (authStore, orderStore)
│   │   └── types/                  # TypeScript 类型定义 (index.ts)
├── api/                            # Go API 主服务
├── lambdas/                        # AWS Lambda 异步任务
├── terraform/                      # Terraform 基础设施定义
├── data_design_analysis.md         # 数据结构与后端设计分析文档
└── README.md
```

---

## 5. 架构决策与权衡（Trade-offs）

在项目验证阶段，基于实际可验证性与成本/复杂度的合理平衡，采取了以下工程权衡：

| 模块 | 本环境 (PoC) | 生产环境 (Production) | 权衡考量                                                   |
| :--- | :--- | :--- |:-----------------------------------------------------------|
| **CDN / WAF** | 未引入 | CloudFront + AWS WAF | PoC 阶段无真实边缘流量，省略以简化网络架构                 |
| **可观测性** | CloudWatch + Grafana | + AWS X-Ray | 单人维护项目，基于 CloudWatch 结构化日志已具备足够追踪能力 |
| **SQS / SNS** | Standard 模式 | 视场景引入 FIFO | 优先保证高吞吐，场景不要求强顺序性                         |
| **Redis** | 单节点模式（主/从） | Cluster 多节点集群 | PoC 规模下单节点已足够支撑逻辑与性能验证                   |
| **支付流程** | 状态机 Mock 模拟 | 真实第三方支付 API | 聚焦于支付状态机（UNPAID → PAID → TIMEOUT）的链路逻辑验证  |

---

## 6. 开源协议

[MIT License](LICENSE)
