# Admin API の設定（config-dev.yaml）に転記する値
output "lottery_drawer_function_arn" {
  description = "LotteryDrawer Lambda の ARN（Admin API の scheduler 設定に使う）"
  value       = aws_lambda_function.lottery_drawer.arn
}

output "lottery_schedule_group_name" {
  description = "抽選Schedule Group 名（Admin API の scheduler 設定に使う）"
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
  value       = aws_lambda_function.order_expirer.arn
}

output "order_expirer_schedule_group_name" {
  description = "注文期限切れ用 Schedule Group 名（抽選と同じグループを共有）"
  value       = aws_scheduler_schedule_group.lottery.name
}
