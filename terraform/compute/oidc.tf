# ==============================================================================
# GitHub Actions 用 IAM Role（API デプロイ / api.yml が使用）
#
# 役割: ECR へのイメージ push + ECS サービスの再デプロイのみ。
#       タスク定義や IAM の変更は含めない（Terraform 側で管理するため）。
# ==============================================================================

data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_role" "github_actions_api_dev" {
  name = "github-actions-api-dev-role"
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

resource "aws_iam_role_policy" "github_actions_api_dev" {
  name = "github-actions-api-dev-policy"
  role = aws_iam_role.github_actions_api_dev.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # ログイン用トークンの取得はリソース指定ができないため *
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = ["*"]
      },
      {
        # docker push に必要な操作（対象は API 用リポジトリのみ）
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:CompleteLayerUpload",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage"
        ]
        Resource = [aws_ecr_repository.api.arn]
      },
      {
        # デプロイ = 新イメージでのタスク入れ替え。安定待ちの Describe も許可
        Effect = "Allow"
        Action = [
          "ecs:UpdateService",
          "ecs:DescribeServices"
        ]
        Resource = [aws_ecs_service.api.arn]
      }
    ]
  })
}
