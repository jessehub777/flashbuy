# ==============================================================================
# Terraform State バックエンド基盤（S3 + DynamoDB ロック）
# このスタックだけは local backend で一度 apply する（bootstrap）。
# その後、各スタック（auth / frontend / data）の backend を S3 に切り替える。
# ==============================================================================

resource "aws_s3_bucket" "terraform_state" {
  bucket = "flashbuy-terraform-state"

  tags = {
    Name        = "flashbuy-terraform-state"
    Project     = "FlashBuy"
    ManagedBy   = "Terraform"
  }
}

# 誤削除防止
resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

# パブリックアクセス完全ブロック
resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# サーバーサイド暗号化
resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# DynamoDB ロックテーブル
resource "aws_dynamodb_table" "terraform_lock" {
  name         = "flashbuy-terraform-lock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = {
    Name        = "flashbuy-terraform-lock"
    Project     = "FlashBuy"
    ManagedBy   = "Terraform"
  }
}
