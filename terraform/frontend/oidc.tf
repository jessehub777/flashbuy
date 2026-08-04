# ==============================================================================
# 1. GitHub OIDC Provider 参照 (shared スタックから取得)
# ==============================================================================
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

# ==============================================================================
# 2. IAM Roles for GitHub Actions (DEV & PROD)
# ==============================================================================

# DEV 用 Role
resource "aws_iam_role" "github_actions_dev" {
  name = "github-actions-frontend-dev-role"
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
          # dev role
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
            "token.actions.githubusercontent.com:sub" = "repo:jessehub777@28582598/flashbuy@1317326878:environment:development"          }
        }
      }
    ]
  })
}

# DEV 用 Policy
resource "aws_iam_role_policy" "github_actions_dev_policy" {
  name = "github-actions-frontend-dev-policy"
  role = aws_iam_role.github_actions_dev.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action   = "s3:ListBucket"
        Effect   = "Allow"
        Resource = [module.dev_hosting.bucket_arn]
      },
      {
        Action   = ["s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload"]
        Effect   = "Allow"
        Resource = ["${module.dev_hosting.bucket_arn}/*"]
      },
      {
        Action   = ["cloudfront:CreateInvalidation"]
        Effect   = "Allow"
        Resource = [module.dev_hosting.cloudfront_distribution_arn]
      }
    ]
  })
}

# PROD 用 Role
resource "aws_iam_role" "github_actions_prod" {
  name = "github-actions-frontend-prod-role"
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
          # prod role
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
            "token.actions.githubusercontent.com:sub" = "repo:jessehub777@28582598/flashbuy@1317326878:environment:production"          }
        }
      }
    ]
  })
}

# PROD 用 Policy
resource "aws_iam_role_policy" "github_actions_prod_policy" {
  name = "github-actions-frontend-prod-policy"
  role = aws_iam_role.github_actions_prod.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action   = "s3:ListBucket"
        Effect   = "Allow"
        Resource = [module.prod_hosting.bucket_arn]
      },
      {
        Action   = ["s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload"]
        Effect   = "Allow"
        Resource = ["${module.prod_hosting.bucket_arn}/*"]
      },
      {
        Action   = ["cloudfront:CreateInvalidation"]
        Effect   = "Allow"
        Resource = [module.prod_hosting.cloudfront_distribution_arn]
      }
    ]
  })
}
