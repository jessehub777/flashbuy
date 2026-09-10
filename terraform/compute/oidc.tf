# ==============================================================================
# GitHub Actions 用 IAM Role（API のイメージ push とリリース / api-ci.yml・api-cd.yml が使用）
#
# 役割: ECR へのイメージ push と、「v* タグの push」で起動するリリース
#       （新しいタスク定義リビジョンの登録 → サービスの差し替え）のみ。
#       terraform apply やインフラの変更権限は与えない。
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
        # タグリリース時に新しいリビジョンを登録する。対象は API のタスク定義のみ
        #（:リビジョン無しの ARN と :* の両方を書くのは、ファミリー名だけの
        #  Describe と、リビジョン指定の Register の両方に一致させるため）
        Effect = "Allow"
        Action = [
          "ecs:RegisterTaskDefinition",
          "ecs:DescribeTaskDefinition"
        ]
        Resource = [
          "arn:aws:ecs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:task-definition/${var.project_name}-api-${var.environment}",
          "arn:aws:ecs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:task-definition/${var.project_name}-api-${var.environment}:*"
        ]
      },
      {
        # サービスを新リビジョンに差し替える（対象は API サービスのみ）
        Effect = "Allow"
        Action = [
          "ecs:UpdateService",
          "ecs:DescribeServices"
        ]
        Resource = [aws_ecs_service.api.arn]
      },
      {
        # 登録するリビジョンに既存のタスクロールを渡すため（PassRole）。
        # ECS タスクにしか渡せないよう条件を付ける
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = [aws_iam_role.execution.arn, aws_iam_role.task.arn]
        Condition = {
          StringEquals = {
            "iam:PassedToService" = "ecs-tasks.amazonaws.com"
          }
        }
      }
    ]
  })
}
