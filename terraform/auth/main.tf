# Cognitoユーザープール（ユーザー管理）
resource "aws_cognito_user_pool" "main" {
  name = "${var.project_name}-user-pool-${var.environment}"

  # Eメールでログインできるようにする
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # パスワードのルール設定
  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_uppercase = true
    require_symbols   = false
  }

  # Eメールを必須にする
  schema {
    attribute_data_type = "String"
    name                = "email"
    required            = true
    mutable             = true
  }

  # アカウント復旧方法の設定
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # 管理者以外もユーザー作成（サインアップ）できるようにする
  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# アプリクライアント（APIからのアクセス用）
resource "aws_cognito_user_pool_client" "client" {
  name         = "${var.project_name}-api-client-${var.environment}"
  user_pool_id = aws_cognito_user_pool.main.id

  # 認証フローの設定
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_ADMIN_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]

  generate_secret = false

  # トークンの有効期限
  access_token_validity  = 24
  id_token_validity      = 24
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }
}

# テスト用ユーザー（一般ユーザー）
resource "aws_cognito_user" "demo_user" {
  user_pool_id = aws_cognito_user_pool.main.id
  username     = "user@flashbuy.demo"
  password     = "Demo1234!"

  attributes = {
    email          = "user@flashbuy.demo"
    email_verified = "true"
  }

  # Eメールを送信しない
  message_action = "SUPPRESS"

  # パスワードの変更を無視する
  lifecycle {
    ignore_changes = [password]
  }
}

# テスト用ユーザー（管理者）
resource "aws_cognito_user" "demo_admin" {
  user_pool_id = aws_cognito_user_pool.main.id
  username     = "admin@flashbuy.demo"
  password     = "Demo1234!"

  attributes = {
    email          = "admin@flashbuy.demo"
    email_verified = "true"
  }

  # Eメールを送信しない
  message_action = "SUPPRESS"

  # パスワードの変更を無視する
  lifecycle {
    ignore_changes = [password]
  }
}
