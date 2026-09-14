# ==============================================================================
# 監視（CloudWatch ネイティブ）
#
# 方針: 追加のミドルウェアを入れず、CloudWatch のメトリクス / アラーム /
#       ダッシュボードだけで「異常に気づける」状態を作る。
#       Datadog / Mackerel / Grafana は日本でもよく使われるが、
#       PoC の規模では常駐コストと構成の複雑さに見合わない。
#
# 監視対象は「名前から引く」方式にしている（他モジュールの remote state を参照しない）。
# 理由: monitoring 単体で apply できるようにするため。
# remote state を参照すると、他モジュールに output を足して apply する順番待ちが発生し、
# 監視の追加・変更のたびに他モジュールを触ることになる。
# ==============================================================================

data "aws_lb" "api" {
  name = "${var.project_name}-api-${var.environment}"
}

data "aws_lb_target_group" "api" {
  name = "${var.project_name}-api-${var.environment}"
}

data "aws_db_instance" "postgres" {
  db_instance_identifier = "${var.project_name}-postgres-${var.environment}"
}

data "aws_elasticache_cluster" "redis" {
  cluster_id = "${var.project_name}-redis-${var.environment}"
}

data "aws_lambda_function" "lottery_drawer" {
  function_name = "${var.project_name}-lottery-drawer-${var.environment}"
}

data "aws_lambda_function" "order_expirer" {
  function_name = "${var.project_name}-order-expirer-${var.environment}"
}

# ------------------------------------------------------------------------------
# 通知先。アラームは全部このトピックに飛ばす
# ------------------------------------------------------------------------------
resource "aws_sns_topic" "alarm" {
  name = "${var.project_name}-alarm-${var.environment}"
}

resource "aws_sns_topic_subscription" "alarm_email" {
  for_each = toset(var.alert_emails)

  topic_arn = aws_sns_topic.alarm.arn
  protocol  = "email"
  endpoint  = each.value
}

locals {
  alarm_actions = [aws_sns_topic.alarm.arn]

  # CloudWatch の dimensions は ARN 全体ではなく suffix / 識別子 / 名前を要求する
  alb_suffix   = data.aws_lb.api.arn_suffix
  tg_suffix    = data.aws_lb_target_group.api.arn_suffix
  cluster_name = "${var.project_name}-cluster-${var.environment}"
  service_name = "${var.project_name}-api-${var.environment}"
}

# ==============================================================================
# ALB — 利用者に直接影響する層。ここが一番早く気づきたい
# ==============================================================================

# ヘルスチェックに落ちたタスクが 1 台でもあれば通知（1台構成なので即影響）
resource "aws_cloudwatch_metric_alarm" "alb_unhealthy_host" {
  alarm_name          = "${var.project_name}-alb-unhealthy-${var.environment}"
  alarm_description   = "ALB の配下に異常なターゲットが 1 台以上ある（1台構成のため即影響）"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "UnHealthyHostCount"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = local.alb_suffix
    TargetGroup  = local.tg_suffix
  }

  alarm_actions = local.alarm_actions
}

# 5xx はアプリのバグ・DB 障害・デプロイ失敗のいずれでも出る
resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "${var.project_name}-alb-5xx-${var.environment}"
  alarm_description   = "ALB の 5xx が増えている（アプリ / DB / デプロイ失敗の疑い）"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = var.alb_5xx_threshold
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = local.alb_suffix
  }

  alarm_actions = local.alarm_actions
}

# 秒殺のピークで遅くなっていないかを見る（在庫ロック待ちの劣化の検知）
resource "aws_cloudwatch_metric_alarm" "alb_response_time" {
  alarm_name          = "${var.project_name}-alb-latency-${var.environment}"
  alarm_description   = "ALB の応答時間が平均でしきい値を超えている"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "TargetResponseTime"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 1
  threshold           = var.response_time_threshold_seconds
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = local.alb_suffix
  }

  alarm_actions = local.alarm_actions
}

# ==============================================================================
# ECS — タスクが苦しくなっていないか（CPU/メモリ）
# ==============================================================================
resource "aws_cloudwatch_metric_alarm" "ecs_cpu" {
  alarm_name          = "${var.project_name}-ecs-cpu-${var.environment}"
  alarm_description   = "ECS タスクの CPU 使用率が高い"
  namespace           = "AWS/ECS"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = var.ecs_cpu_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = local.cluster_name
    ServiceName = local.service_name
  }

  alarm_actions = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "ecs_memory" {
  alarm_name          = "${var.project_name}-ecs-memory-${var.environment}"
  alarm_description   = "ECS タスクのメモリ使用率が高い（OOM でタスクが落ちる前兆）"
  namespace           = "AWS/ECS"
  metric_name         = "MemoryUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = var.ecs_memory_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = local.cluster_name
    ServiceName = local.service_name
  }

  alarm_actions = local.alarm_actions
}

# ==============================================================================
# RDS — 落ちると全機能が止まる
# ==============================================================================
resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${var.project_name}-rds-cpu-${var.environment}"
  alarm_description   = "RDS の CPU 使用率が高い"
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = var.rds_cpu_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = data.aws_db_instance.postgres.db_instance_identifier
  }

  alarm_actions = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "rds_free_storage" {
  alarm_name          = "${var.project_name}-rds-storage-${var.environment}"
  alarm_description   = "RDS の空き容量が少ない（このまま増えると書き込み不能）"
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 1
  threshold           = var.rds_free_storage_bytes
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = data.aws_db_instance.postgres.db_instance_identifier
  }

  alarm_actions = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "rds_connections" {
  alarm_name          = "${var.project_name}-rds-connections-${var.environment}"
  alarm_description   = "RDS の接続数が多い（コネクション枯渇の前兆）"
  namespace           = "AWS/RDS"
  metric_name         = "DatabaseConnections"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = var.rds_connections_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = data.aws_db_instance.postgres.db_instance_identifier
  }

  alarm_actions = local.alarm_actions
}

# ==============================================================================
# ElastiCache — 在庫のロックを担うので、止まると購入が即失敗する
# ==============================================================================
resource "aws_cloudwatch_metric_alarm" "redis_cpu" {
  alarm_name          = "${var.project_name}-redis-cpu-${var.environment}"
  alarm_description   = "ElastiCache の CPU 使用率が高い"
  namespace           = "AWS/ElastiCache"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = var.redis_cpu_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    CacheClusterId = data.aws_elasticache_cluster.redis.cluster_id
  }

  alarm_actions = local.alarm_actions
}

# ==============================================================================
# Lambda — 開票・期限切れ取消が止まると気づきにくい（画面は静かなまま）
# ==============================================================================
resource "aws_cloudwatch_metric_alarm" "lottery_drawer_errors" {
  alarm_name          = "${var.project_name}-lottery-drawer-errors-${var.environment}"
  alarm_description   = "開票 Lambda がエラーを出している（抽選が開票されない可能性）"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = data.aws_lambda_function.lottery_drawer.function_name
  }

  alarm_actions = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "lottery_drawer_throttles" {
  alarm_name          = "${var.project_name}-lottery-drawer-throttles-${var.environment}"
  alarm_description   = "開票 Lambda がスロットリングされている"
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = data.aws_lambda_function.lottery_drawer.function_name
  }

  alarm_actions = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "order_expirer_errors" {
  alarm_name          = "${var.project_name}-order-expirer-errors-${var.environment}"
  alarm_description   = "期限切れ取消 Lambda がエラーを出している（在庫が戻らず売り切れのまま残る可能性）"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = data.aws_lambda_function.order_expirer.function_name
  }

  alarm_actions = local.alarm_actions
}
