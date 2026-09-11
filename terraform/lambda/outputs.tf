# Admin API の設定（config-dev.yaml）に転記する値
output "lottery_drawer_function_arn" {
  description = "LotteryDrawer Lambda の ARN（Admin API の scheduler 設定に使う）"
  value       = aws_lambda_alias.lottery_drawer.arn
}

# 注: この Schedule Group は「抽選の開票」と「注文の期限切れ取消」の両方で使い回している。
# 名前が lottery なのは、最初に抽選だけを作ったときの名残。
# グループを分けると IAM 側の ARN も増えるため、PoC では共有のままにしている
#（分ける場合は aws_scheduler_schedule_group を追加し、両方の output を付け替える）。
output "lottery_schedule_group_name" {
  description = "Schedule Group 名（抽選の開票と注文の期限切れ取消で共用。Admin API の scheduler 設定に使う）"
  value       = aws_scheduler_schedule_group.lottery.name
}

output "scheduler_execution_role_arn" {
  description = "EventBridge Scheduler の実行ロール ARN（Admin API の scheduler 設定に使う）"
  value       = aws_iam_role.scheduler_invoke.arn
}

output "lottery_drawn_topic_arn" {
  description = "開票結果イベント (lottery.drawn) の SNS トピック ARN"
  value       = aws_sns_topic.lottery_drawn.arn
}

# ===== OrderExpirer（期限切れ注文の取消）=====
output "order_expirer_function_arn" {
  description = "OrderExpirer Lambda の ARN（API が at() Schedule を登録する際のターゲット）"
  value       = aws_lambda_alias.order_expirer.arn
}

output "order_expirer_schedule_group_name" {
  description = "注文期限切れ用 Schedule Group 名（抽選と同じグループを共有）"
  # lottery_schedule_group_name と同じグループを指している（上の上の注釈を参照）
  value = aws_scheduler_schedule_group.lottery.name
}

# lambda-cd.yml（Lambda CD）の OIDC Role。GitHub の Secret に登録して使う
output "github_actions_lambda_role_arn" {
  description = "Lambda デプロイ用 GitHub Actions Role ARN（関数コードの更新のみ）"
  value       = aws_iam_role.github_actions_lambda_dev.arn
}
