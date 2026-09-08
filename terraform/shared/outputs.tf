# terraform.yml（Terraform CI）の OIDC Role。GitHub の Secret に登録して使う
output "github_actions_terraform_plan_role_arn" {
  description = "PR で terraform plan を実行する GitHub Actions 用 Role ARN"
  value       = aws_iam_role.github_actions_terraform_plan.arn
}
