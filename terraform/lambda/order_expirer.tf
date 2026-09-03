# ==============================================================================
# OrderExpirer — 支払期限切れの未払い注文を取り消す Lambda
#
# 2系統のトリガーを持つ（詳細は lambdas/order_expirer/main.go のコメント参照）:
#   1. at()   — APIが注文作成時に expires_at 時刻でワンタイムSchedule登録（本線・遅延なし）
#   2. cron   — EventBridge Rules による定期スキャン（兜底・登録漏れ/失敗の回収）
#
# いずれもSQL側で status='UNPAID' + 期限超過 を条件にしており冪等。
# ==============================================================================

# ==============================================================================
# Lambda 実行ロール
# ==============================================================================
resource "aws_iam_role" "order_expirer" {
  name = "${var.project_name}-order-expirer-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-order-expirer-role-${var.environment}"
  }
}

# CloudWatch Logs への出力
resource "aws_iam_role_policy_attachment" "order_expirer_logs" {
  role       = aws_iam_role.order_expirer.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# VPC内配置（ENI作成）に必要な権限
resource "aws_iam_role_policy" "order_expirer_vpc" {
  name = "${var.project_name}-order-expirer-vpc-${var.environment}"
  role = aws_iam_role.order_expirer.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ec2:CreateNetworkInterface", "ec2:DescribeNetworkInterfaces", "ec2:DeleteNetworkInterface"]
        Resource = "*"
      }
    ]
  })
}

# ==============================================================================
# セキュリティグループ（RDS 5432 / ElastiCache 6379 へのアウトバウンド）
# ==============================================================================
# 在庫戻しでRedis（ElastiCache）を使うためRDSだけでなくRedisへの到達も必要。
# data モジュールの redis SG は VPC CIDR からの6379を許可済み。
resource "aws_security_group" "order_expirer" {
  name        = "${var.project_name}-lambda-expirer-${var.environment}"
  description = "OrderExpirer Lambda (egress only)"
  vpc_id      = data.terraform_remote_state.data.outputs.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-lambda-expirer-${var.environment}"
  }
}

# ==============================================================================
# Lambda 関数（provided.al2023 / arm64、VPC内でRDS+Redisに接続）
# ==============================================================================
resource "aws_lambda_function" "order_expirer" {
  function_name = "${var.project_name}-order-expirer-${var.environment}"
  role          = aws_iam_role.order_expirer.arn

  filename         = var.order_expirer_zip_path
  source_code_hash = filebase64sha256(var.order_expirer_zip_path)
  handler          = "bootstrap"
  runtime          = "provided.al2023"
  architectures    = ["arm64"]

  timeout     = 60
  memory_size = 256

  # RDSとElastiCacheは同じVPC内のため、プライベートサブネットから到達できる
  vpc_config {
    subnet_ids         = data.terraform_remote_state.data.outputs.private_subnet_ids
    security_group_ids = [aws_security_group.order_expirer.id]
  }

  environment {
    variables = {
      DB_HOST     = data.terraform_remote_state.data.outputs.rds_host
      DB_PORT     = tostring(data.terraform_remote_state.data.outputs.rds_port)
      DB_NAME     = data.terraform_remote_state.data.outputs.db_name
      DB_USER     = data.terraform_remote_state.data.outputs.db_username
      DB_PASSWORD = var.db_password
      DB_SSLMODE  = "require"

      # 在庫の戻し先（Redis未設定でもDB取消は継続する設計）
      REDIS_HOST = data.terraform_remote_state.data.outputs.redis_host
      REDIS_PORT = tostring(data.terraform_remote_state.data.outputs.redis_port)
    }
  }

  tags = {
    Name = "${var.project_name}-order-expirer-${var.environment}"
  }
}

# ==============================================================================
# 注: LotteryDrawer には Scheduler 登録権限を与えない
# ==============================================================================
# 開票Lambdaは private_subnet に配置されており、このVPCにはNAT Gatewayも
# EventBridge Scheduler の VPC Endpoint も無い。そのため Lambda 内から
# scheduler.*.amazonaws.com を呼ぶとSYNがドロップされ、Lambdaタイムアウト(60s)
# までハングして開票処理そのものが失敗する（Secrets Manager で過去に同事故あり）。
# 当選者の期限切れ取消は order_expirer の cron スキャンで十分カバーできる
# （抽選の支払期限は72時間あり、1分程度の遅延は問題にならない）。

# ==============================================================================
# ② スキャン（兜底）— EventBridge Rules の cron で定期実行
# ==============================================================================
resource "aws_cloudwatch_event_rule" "order_expirer_scan" {
  name                = "${var.project_name}-order-expirer-scan-${var.environment}"
  description         = "Scan for expired unpaid orders (fallback safety net)"
  schedule_expression = "rate(${var.expirer_scan_minutes} minute${var.expirer_scan_minutes > 1 ? "s" : ""})"

  tags = {
    Name = "${var.project_name}-order-expirer-scan-${var.environment}"
  }
}

resource "aws_cloudwatch_event_target" "order_expirer_scan" {
  rule      = aws_cloudwatch_event_rule.order_expirer_scan.name
  target_id = "order-expirer-scan"
  arn       = aws_lambda_function.order_expirer.arn

  # mode="scan" を渡してハンドラ側でスキャン処理に振り分ける
  input = jsonencode({ mode = "scan" })
}

# EventBridge Rules が Lambda を呼び出す許可
resource "aws_lambda_permission" "order_expirer_scan" {
  statement_id  = "AllowExecutionFromEventBridgeScan"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.order_expirer.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.order_expirer_scan.arn
}

# ==============================================================================
# ① at() 用 — Scheduler 実行ロールに「order_expirer の invoke」を追加
# ==============================================================================
# Scheduler は Target の RoleArn（= scheduler_invoke）を引き受けて Lambda を呼ぶ。
# lottery_drawer はこの IAM 経路のみで動作している（Lambda 側の resource policy 不要）ため、
# order_expirer も同様に IAM 経路だけで揃える。
# 注意: Schedule は実行時に動的生成される（expire-{orderId}）ため、terraform では
#       resource policy の source_arn（Schedule ARN）を静的に指定できない。IAM 経路が正。
resource "aws_iam_role_policy" "scheduler_invoke_expirer" {
  name = "${var.project_name}-scheduler-invoke-expirer-${var.environment}"
  role = aws_iam_role.scheduler_invoke.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = aws_lambda_function.order_expirer.arn
      }
    ]
  })
}
