# ==============================================================================
# 1. GitHub OIDC Provider (アカウント単位のグローバルリソース)
# ==============================================================================
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  # AWS Provider v6 以降では thumbprint_list は必須ではなく、AWS の信頼済み CA リストに依存します。
}