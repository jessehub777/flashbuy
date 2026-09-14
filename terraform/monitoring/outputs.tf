output "alarm_topic_arn" {
  description = "アラーム通知先 SNS トピック ARN（メール購読は alert_emails で指定）"
  value       = aws_sns_topic.alarm.arn
}

output "dashboard_name" {
  description = "CloudWatch ダッシュボード名（コンソールで開く）"
  value       = aws_cloudwatch_dashboard.main.dashboard_name
}
