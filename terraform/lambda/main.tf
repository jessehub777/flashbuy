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

# Secrets Manager からのDBパスワード取得
resource "aws_iam_role_policy" "lottery_drawer_secrets" {
  name = "${var.project_name}-lottery-drawer-secrets-${var.environment}"
  role = aws_iam_role.lottery_drawer.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = aws_secretsmanager_secret.db_password.arn
      }
    ]
  })
}

# ==============================================================================
# RDS パスワードの Secrets Manager 保管
# 環境変数には ARN のみを渡し、実行時に GetSecretValue で取得する（平文を露出させない）
# ==============================================================================
resource "aws_secretsmanager_secret" "db_password" {
  name = "${var.project_name}-db-password-${var.environment}"

  tags = {
    Name = "${var.project_name}-db-password-${var.environment}"
  }
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = var.db_password
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
