variable "project_name" {
  type        = string
  description = "プロジェクト名（リソース名のプレフィックス）"
  default     = "flashbuy"
}

variable "environment" {
  type        = string
  description = "環境名 (dev / prod)"
  default     = "dev"
}

variable "alert_emails" {
  type        = list(string)
  description = "アラーム通知先メールアドレス。空なら購読を作らない（アラーム自体は作成される）"
  default     = []
}

# ------------------------------------------------------------------------------
# しきい値。まずは「明らかにおかしい時だけ鳴る」緩めの値にしておく。
# 運用しながら調整する前提（PoC で細かく詰めても意味がない）
# ------------------------------------------------------------------------------
variable "alb_5xx_threshold" {
  type        = number
  description = "ALB 5xx のしきい値（5分間の合計）"
  default     = 5
}

variable "response_time_threshold_seconds" {
  type        = number
  description = "ALB 応答時間のしきい値（秒、5分平均）"
  default     = 2
}

variable "ecs_cpu_threshold" {
  type        = number
  description = "ECS CPU 使用率のしきい値（%、5分平均）"
  default     = 80
}

variable "ecs_memory_threshold" {
  type        = number
  description = "ECS メモリ使用率のしきい値（%、5分平均）"
  default     = 80
}

variable "rds_cpu_threshold" {
  type        = number
  description = "RDS CPU 使用率のしきい値（%、5分平均）"
  default     = 80
}

variable "rds_free_storage_bytes" {
  type        = number
  description = "RDS 空き容量のしきい値（バイト。2GB を下回ったら警告）"
  default     = 2147483648
}

variable "rds_connections_threshold" {
  type        = number
  description = "RDS 接続数のしきい値（db.t4g.micro の上限は目安 80 前後）"
  default     = 60
}

variable "redis_cpu_threshold" {
  type        = number
  description = "ElastiCache CPU 使用率のしきい値（%）"
  default     = 80
}
