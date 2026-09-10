# 他モジュールの値を読む。先に data / auth / storage / lambda を apply しておくこと
data "terraform_remote_state" "data" {
  backend = "s3"
  config = {
    bucket = "flashbuy-terraform-state"
    key    = "data/terraform.tfstate"
    region = "ap-northeast-1"
  }
}

data "terraform_remote_state" "auth" {
  backend = "s3"
  config = {
    bucket = "flashbuy-terraform-state"
    key    = "auth/terraform.tfstate"
    region = "ap-northeast-1"
  }
}

data "terraform_remote_state" "storage" {
  backend = "s3"
  config = {
    bucket = "flashbuy-terraform-state"
    key    = "storage/terraform.tfstate"
    region = "ap-northeast-1"
  }
}

data "terraform_remote_state" "lambda" {
  backend = "s3"
  config = {
    bucket = "flashbuy-terraform-state"
    key    = "lambda/terraform.tfstate"
    region = "ap-northeast-1"
  }
}

data "aws_caller_identity" "current" {}

# APIイメージの置き場所
resource "aws_ecr_repository" "api" {
  name                 = "${var.project_name}-api-${var.environment}"
  image_tag_mutability = "MUTABLE" # :latest を上書きする（PoC）
  force_delete         = true      # PoC: 中身があっても消せる

  image_scanning_configuration {
    scan_on_push = true
  }
}

# 古いイメージは最新10個だけ残す
resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = { type = "expire" }
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.project_name}-api-${var.environment}"
  retention_in_days = 7
}

# DBパスワードの置き場所。タスク定義の secrets から環境変数として渡す
resource "aws_secretsmanager_secret" "db_password" {
  name                    = "${var.project_name}/db-password/${var.environment}"
  recovery_window_in_days = 0 # PoC: すぐ同じ名前で作り直せる
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = var.db_password

  # RDS側も password 変更を無視する運用なので、ここも連動させない。
  # 変えるときは値を手で更新する（TODO.md §1.1）
  lifecycle {
    ignore_changes = [secret_string]
  }
}
