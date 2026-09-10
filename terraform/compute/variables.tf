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

variable "aws_region" {
  type        = string
  description = "リージョン"
  default     = "ap-northeast-1"
}

variable "image_tag" {
  type        = string
  description = "terraform がタスク定義を登録するとき（初回・環境変数の変更時）に使うイメージタグ。通常のリリースは api-cd.yml がタグ名（v1.2.3 など）付きのリビジョンを登録するため、ここは変更しない"
  default     = "latest"
}

variable "db_password" {
  type        = string
  description = "RDSのパスワード（data モジュールと同じ値。Secrets Managerに入れてタスクへ渡す）"
  sensitive   = true
}

variable "api_cpu" {
  type        = number
  description = "タスクのCPU（256 = 0.25vCPU）"
  default     = 256
}

variable "api_memory" {
  type        = number
  description = "タスクのメモリ（MB）"
  default     = 512
}
