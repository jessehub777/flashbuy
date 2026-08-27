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

variable "db_password" {
  type        = string
  description = "RDSのマスターパスワード（Lambda環境変数に渡す。terraform.tfvarsで指定）"
  sensitive   = true
}

variable "lambda_zip_path" {
  type        = string
  description = "LotteryDrawerのデプロイzipパス（lambdas/lottery_drawer/build.sh で生成）"
  default     = "../../lambdas/lottery_drawer/dist/lottery_drawer.zip"
}
