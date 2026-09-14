# ==============================================================================
# 運用ダッシュボード（1枚だけ）
#
# 「障害のとき、まずこれを開く」を作るのが目的。
# ウィジェットを増やすより、ECS / ALB / RDS / Lambda の 4 系統を
# 1 画面に収めることを優先する。
# ==============================================================================
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.project_name}-${var.environment}"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "text"
        x      = 0
        y      = 0
        width  = 24
        height = 2
        properties = {
          markdown = "# FlashBuy (${var.environment})\nECS / ALB / RDS / Lambda の主要メトリクス。アラームは SNS トピック `${aws_sns_topic.alarm.name}` に通知される。"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 2
        width  = 12
        height = 6
        properties = {
          title  = "ALB リクエストと 5xx"
          region = "ap-northeast-1"
          view   = "timeSeries"
          stat   = "Sum"
          period = 300
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", local.alb_suffix],
            ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", local.alb_suffix],
            ["AWS/ApplicationELB", "HTTPCode_Target_4XX_Count", "LoadBalancer", local.alb_suffix],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 2
        width  = 12
        height = 6
        properties = {
          title  = "ALB 応答時間と異常ターゲット"
          region = "ap-northeast-1"
          view   = "timeSeries"
          period = 300
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", local.alb_suffix, { stat = "Average" }],
            ["AWS/ApplicationELB", "UnHealthyHostCount", "LoadBalancer", local.alb_suffix, "TargetGroup", local.tg_suffix, { stat = "Maximum" }],
          ]
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 8
        width  = 12
        height = 6
        properties = {
          title  = "ECS タスクの CPU / メモリ"
          region = "ap-northeast-1"
          view   = "timeSeries"
          period = 300
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ClusterName", local.cluster_name, "ServiceName", local.service_name, { stat = "Average" }],
            ["AWS/ECS", "MemoryUtilization", "ClusterName", local.cluster_name, "ServiceName", local.service_name, { stat = "Average" }],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 8
        width  = 12
        height = 6
        properties = {
          title  = "RDS CPU / 接続数"
          region = "ap-northeast-1"
          view   = "timeSeries"
          period = 300
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", data.aws_db_instance.postgres.db_instance_identifier, { stat = "Average" }],
            ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", data.aws_db_instance.postgres.db_instance_identifier, { stat = "Average" }],
          ]
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 14
        width  = 12
        height = 6
        properties = {
          title  = "Lambda 実行回数とエラー"
          region = "ap-northeast-1"
          view   = "timeSeries"
          stat   = "Sum"
          period = 300
          metrics = [
            ["AWS/Lambda", "Invocations", "FunctionName", data.aws_lambda_function.lottery_drawer.function_name],
            ["AWS/Lambda", "Errors", "FunctionName", data.aws_lambda_function.lottery_drawer.function_name],
            ["AWS/Lambda", "Invocations", "FunctionName", data.aws_lambda_function.order_expirer.function_name],
            ["AWS/Lambda", "Errors", "FunctionName", data.aws_lambda_function.order_expirer.function_name],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 14
        width  = 12
        height = 6
        properties = {
          title  = "ElastiCache CPU（在庫ロックの要）"
          region = "ap-northeast-1"
          view   = "timeSeries"
          period = 300
          metrics = [
            ["AWS/ElastiCache", "CPUUtilization", "CacheClusterId", data.aws_elasticache_cluster.redis.cluster_id, { stat = "Average" }],
            ["AWS/ElastiCache", "Evictions", "CacheClusterId", data.aws_elasticache_cluster.redis.cluster_id, { stat = "Sum" }],
          ]
        }
      },
      {
        type   = "alarm"
        x      = 0
        y      = 20
        width  = 24
        height = 4
        properties = {
          title = "アラーム状態"
          alarms = [
            aws_cloudwatch_metric_alarm.alb_unhealthy_host.arn,
            aws_cloudwatch_metric_alarm.alb_5xx.arn,
            aws_cloudwatch_metric_alarm.alb_response_time.arn,
            aws_cloudwatch_metric_alarm.ecs_cpu.arn,
            aws_cloudwatch_metric_alarm.ecs_memory.arn,
            aws_cloudwatch_metric_alarm.rds_cpu.arn,
            aws_cloudwatch_metric_alarm.rds_free_storage.arn,
            aws_cloudwatch_metric_alarm.rds_connections.arn,
            aws_cloudwatch_metric_alarm.redis_cpu.arn,
            aws_cloudwatch_metric_alarm.lottery_drawer_errors.arn,
            aws_cloudwatch_metric_alarm.lottery_drawer_throttles.arn,
            aws_cloudwatch_metric_alarm.order_expirer_errors.arn,
          ]
        }
      },
    ]
  })
}
