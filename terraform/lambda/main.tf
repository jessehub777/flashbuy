# ==============================================================================
# FlashBuy Lambda（LotteryDrawer 抽選開票）
# terraform/lambda/ は独立したtfstateを持ち、data/ のremote stateを参照する
#
# 事前に lambdas/lottery_drawer/build.sh で dist/lottery_drawer.zip を作成しておくこと
# ==============================================================================

# データ基盤（VPC / RDS）の情報をremote stateから取得
data "terraform_remote_state" "data" {
  backend = "s3"
  config = {
    bucket = "flashbuy-terraform-state"
    key    = "data/terraform.tfstate"
    region = "ap-northeast-1"
  }
}

locals {
  region = "ap-northeast-1"
}

# ==============================================================================
# SNS トピック（開票結果イベント lottery.drawn）
# ==============================================================================
resource "aws_sns_topic" "lottery_drawn" {
  name = "${var.project_name}-lottery-drawn-${var.environment}"

  tags = {
    Name = "${var.project_name}-lottery-drawn-${var.environment}"
  }
}

# ==============================================================================
# Lambda 実行ロール
# ==============================================================================
resource "aws_iam_role" "lottery_drawer" {
  name = "${var.project_name}-lottery-drawer-role-${var.environment}"

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
    Name = "${var.project_name}-lottery-drawer-role-${var.environment}"
  }
}

# CloudWatch Logs への出力
resource "aws_iam_role_policy_attachment" "lottery_drawer_logs" {
  role       = aws_iam_role.lottery_drawer.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# VPC内配置（ENI作成）に必要な権限
resource "aws_iam_role_policy" "lottery_drawer_vpc" {
  name = "${var.project_name}-lottery-drawer-vpc-${var.environment}"
  role = aws_iam_role.lottery_drawer.id

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

# SNS 発行（lottery.drawn）
resource "aws_iam_role_policy" "lottery_drawer_sns" {
  name = "${var.project_name}-lottery-drawer-sns-${var.environment}"
  role = aws_iam_role.lottery_drawer.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["sns:Publish"]
        Resource = aws_sns_topic.lottery_drawn.arn
      }
    ]
  })
}

# ==============================================================================
# Lambda 用セキュリティグループ（RDSへのアウトバウンドのみ）
# ==============================================================================
resource "aws_security_group" "lottery_drawer" {
  name        = "${var.project_name}-lambda-drawer-${var.environment}"
  description = "LotteryDrawer Lambda (egress only)"
  vpc_id      = data.terraform_remote_state.data.outputs.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-lambda-drawer-${var.environment}"
  }
}

# ==============================================================================
# Lambda 関数（provided.al2023 / arm64、VPC内でRDSに接続）
# ==============================================================================
resource "aws_lambda_function" "lottery_drawer" {
  function_name = "${var.project_name}-lottery-drawer-${var.environment}"
  role          = aws_iam_role.lottery_drawer.arn

  filename         = var.lambda_zip_path
  source_code_hash = filebase64sha256(var.lambda_zip_path)
  handler          = "bootstrap"
  runtime          = "provided.al2023"
  architectures    = ["arm64"]

  timeout = 60
  memory_size = 256

  # プライベートサブネットに配置し、RDS（VPC CIDRからの5432を許可するSG）へ接続する
  vpc_config {
    subnet_ids         = data.terraform_remote_state.data.outputs.private_subnet_ids
    security_group_ids = [aws_security_group.lottery_drawer.id]
  }

  environment {
    variables = {
      DB_HOST     = data.terraform_remote_state.data.outputs.rds_host
      DB_PORT     = tostring(data.terraform_remote_state.data.outputs.rds_port)
      DB_NAME     = data.terraform_remote_state.data.outputs.db_name
      DB_USER     = data.terraform_remote_state.data.outputs.db_username
      # PoC: パスワードは環境変数で直接渡す（VPC内LambdaからはSecrets Managerへ到達できないため。
      # 本番移行時はNAT/VPC Endpointを用意し、DB_SECRET_ARN + Secrets Manager方式に戻す）
      DB_PASSWORD = var.db_password
      DB_SSLMODE  = "require"
      SNS_TOPIC_ARN = aws_sns_topic.lottery_drawn.arn
    }
  }

  tags = {
    Name = "${var.project_name}-lottery-drawer-${var.environment}"
  }
}

# ==============================================================================
# EventBridge Scheduler
# ==============================================================================
# Schedule Group（抽選ごとのワンタイムScheduleはAdmin APIがここに登録する）
resource "aws_scheduler_schedule_group" "lottery" {
  name = "${var.project_name}-lottery-${var.environment}"
}

# Scheduler が Lambda を呼び出すための実行ロール
# Admin API が Schedule を作る際に RoleArn として指定する
resource "aws_iam_role" "scheduler_invoke" {
  name = "${var.project_name}-scheduler-invoke-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "scheduler.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-scheduler-invoke-role-${var.environment}"
  }
}

resource "aws_iam_role_policy" "scheduler_invoke" {
  name = "${var.project_name}-scheduler-invoke-${var.environment}"
  role = aws_iam_role.scheduler_invoke.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = aws_lambda_function.lottery_drawer.arn
      }
    ]
  })
}

# ==============================================================================
# ② スキャン（バックアップ）— EventBridge Rules の cron で定期実行
# ==============================================================================
# なぜ必要か:
#   本線の at(draw_at) は「Admin API が Schedule を登録する」→「EventBridge が配信する」
#   の2段階になっており、どちらかが失敗するとその抽選は永久に開票されない。
#   実際に IAM 権限の ARN 誤り（schedule-group/<group> と書いていた）で
#   全件の Schedule 登録が失敗し、開票が一切行われない事故が起きている。
#   その際 API は warn ログだけで 200 を返すため管理画面からは気づけず、
#   ユーザーには「開票待ち」が表示され続けた。
#
# なぜ EventBridge Rules（この仕組み）で、Scheduler ではないか:
#   Lambda は private_subnet にあり NAT も VPC Endpoint も無いため、
#   Lambda 側から AWS の API を呼ぶとハングする（Secrets Manager で過去に同事故）。
#   Rules なら EventBridge 側が Lambda を呼びに来る形なので、Lambda からの
#   外向き通信は不要。OrderExpirer のスキャンと同じ方式に揃えている。
#
# 冪等性:
#   対象は「draw_at を過ぎても WAITING が残っている抽選」だけ。
#   通常は0件なので何もしない。二重起動しても開票結果は変わらない
#   （詳細は lambdas/lottery_drawer/main.go のコメント参照）。
resource "aws_cloudwatch_event_rule" "lottery_drawer_scan" {
  name                = "${var.project_name}-lottery-drawer-scan-${var.environment}"
  description         = "Scan for undrawn lotteries past draw_at (fallback safety net)"
  schedule_expression = "rate(${var.drawer_scan_minutes} minute${var.drawer_scan_minutes > 1 ? "s" : ""})"

  tags = {
    Name = "${var.project_name}-lottery-drawer-scan-${var.environment}"
  }
}

resource "aws_cloudwatch_event_target" "lottery_drawer_scan" {
  rule      = aws_cloudwatch_event_rule.lottery_drawer_scan.name
  target_id = "lottery-drawer-scan"
  arn       = aws_lambda_function.lottery_drawer.arn

  # mode="scan" を渡してハンドラ側でスキャン処理に振り分ける
  input = jsonencode({ mode = "scan" })
}

# EventBridge Rules が Lambda を呼び出す許可
resource "aws_lambda_permission" "lottery_drawer_scan" {
  statement_id  = "AllowExecutionFromEventBridgeScan"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.lottery_drawer.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.lottery_drawer_scan.arn
}
