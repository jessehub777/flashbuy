# ==============================================================================
# GitHub Actions 用 IAM Role（Lambda デプロイ / lambdas.yml が使用）
#
# 役割: 2つの Lambda 関数のコード更新のみ。
#       設定（メモリやVPC等）の変更は含めない（Terraform 側で管理するため）。
# ==============================================================================

data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_role" "github_actions_lambda_dev" {
  name = "github-actions-lambda-dev-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRoleWithWebIdentity"
        Effect = "Allow"
        Principal = {
          Federated = data.aws_iam_openid_connect_provider.github.arn
        }
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
            # development environment の Job のみに限定（front と同じ書き方）
            "token.actions.githubusercontent.com:sub" = "repo:jessehub777@28582598/flashbuy@1317326878:environment:development"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "github_actions_lambda_dev" {
  name = "github-actions-lambda-dev-policy"
  role = aws_iam_role.github_actions_lambda_dev.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "lambda:UpdateFunctionCode", # zip のアップロード
          "lambda:GetFunction"         # 更新結果の確認
        ]
        Resource = [
          aws_lambda_function.lottery_drawer.arn,
          aws_lambda_function.order_expirer.arn
        ]
      }
    ]
  })
}
