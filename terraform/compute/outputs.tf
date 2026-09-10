# frontend モジュールが /api 転送先として読む
output "alb_dns_name" {
  description = "API の公開URL（http://<この値>/ping で確認。HTTPSは後続）"
  value       = aws_lb.api.dns_name
}

# イメージの push 先
output "ecr_repository_url" {
  description = "docker push に使うURL"
  value       = aws_ecr_repository.api.repository_url
}

output "task_definition_arn" {
  description = "現在のタスク定義ARN"
  value       = aws_ecs_task_definition.api.arn
}

output "ecs_cluster_name" {
  description = "ECSクラスタ名（運用時の参照用）"
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "ECSサービス名（運用時の参照用）"
  value       = aws_ecs_service.api.name
}

# API のリリースで使う OIDC Role。GitHub の Secret に登録して使う
#（api-ci.yml のイメージ push と api-cd.yml のデプロイの両方が使う）
output "github_actions_api_role_arn" {
  description = "API デプロイ用 GitHub Actions Role ARN（ECR push + ECS 再デプロイのみ）"
  value       = aws_iam_role.github_actions_api_dev.arn
}
