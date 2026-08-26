variable "aws_region" {
  type        = string
  description = "AWSリージョン"
  default     = "ap-northeast-1"
}

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

variable "vpc_cidr" {
  type        = string
  description = "VPCのCIDRブロック"
  default     = "10.0.0.0/16"
}

variable "allowed_admin_cidrs" {
  type        = list(string)
  description = "開発者端末からRDS/Redisへ直接接続を許可するCIDR（ローカル開発の踏み台用）"
  default     = []
}

variable "db_username" {
  type        = string
  description = "RDSのマスターユーザー名"
  default     = "flashbuy"
}

variable "db_password" {
  type        = string
  description = "RDSのマスターパスワード（terraform.tfvarsで指定）"
  sensitive   = true
}

variable "db_instance_class" {
  type        = string
  description = "RDSインスタンスクラス（実務派: 小規模でコスト重視）"
  default     = "db.t4g.small"
}

variable "redis_node_type" {
  type        = string
  description = "ElastiCache Redisノードタイプ（PoCは単ノード最小構成）"
  default     = "cache.t4g.micro"
}
