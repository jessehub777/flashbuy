# ==============================================================================
# GitHub Actions 用 IAM Role（Terraform CI / terraform.yml が使用）
#
# 役割: PR ごとに terraform plan を実行するための読み取り専用ロール。
#       apply は人が手動で実行する（CI からは apply しない方針）。
#
# 注意: このロールは state バケットも読める（tfstate に平文パスワードが入っている）。
#       そのためフォークからの PR では認証を渡さない制御を workflow 側に入れている
#       （terraform.yml の plan ジョブの if を参照。公開リポジトリでは必須）。
# ==============================================================================

# このモジュール自身が OIDC Provider を作る（main.tf）ため、data source ではなく
# その resource を直接参照する。data source にすると新規アカウントでの初回 apply 時に
# 「まだ存在しない」を読もうとして plan が失敗するため

resource "aws_iam_role" "github_actions_terraform_plan" {
  name = "github-actions-terraform-plan-dev-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRoleWithWebIdentity"
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
            # PR から実行される Job のみに限定（front の deploy Role と同じ書き方）
            "token.actions.githubusercontent.com:sub" = "repo:jessehub777@28582598/flashbuy@1317326878:pull_request"
          }
        }
      }
    ]
  })
}

# 読み取りは AWS 管理ポリシーに任せる（自分で書くと管理が大変なため）
resource "aws_iam_role_policy_attachment" "github_actions_terraform_plan_readonly" {
  role       = aws_iam_role.github_actions_terraform_plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

# plan は S3 のロックファイル（*.tflock）を書くため、state バケットだけ書き込みを許可する
resource "aws_iam_role_policy" "github_actions_terraform_plan_state" {
  name = "github-actions-terraform-plan-state-policy"
  role = aws_iam_role.github_actions_terraform_plan.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["s3:ListBucket"]
        Resource = [
          # state バケットは state モジュール（local backend）で作ったものなので固定名で指定
          "arn:aws:s3:::flashbuy-terraform-state"
        ]
      },
      {
        # state の読み取り（remote_state 参照を含む）
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = ["arn:aws:s3:::flashbuy-terraform-state/*"]
      },
      {
        # plan 時のロック取得・解放。ロックファイル（*.tflock）に限定する。
        # バケット全体に DeleteObject を許すと state 本体を消せてしまうため
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:DeleteObject"]
        Resource = ["arn:aws:s3:::flashbuy-terraform-state/*.tflock"]
      }
    ]
  })
}
