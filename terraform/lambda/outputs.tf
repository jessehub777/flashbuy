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
