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

variable "order_expirer_zip_path" {
  type        = string
  description = "OrderExpirerのデプロイzipパス（lambdas/order_expirer/build.sh で生成）"
  default     = "../../lambdas/order_expirer/dist/order_expirer.zip"
}

variable "expirer_scan_minutes" {
  type        = number
  description = "OrderExpirerのバックアップ用スキャン実行間隔（分）。at()による個別取消が本線で、これは登録漏れ・失敗時の保険"
  default     = 1

  validation {
    condition     = var.expirer_scan_minutes >= 1 && var.expirer_scan_minutes <= 60
    error_message = "スキャン間隔は1〜60分の範囲で指定してください。"
  }
}

variable "drawer_scan_minutes" {
  type        = number
  description = "LotteryDrawerのバックアップ用スキャン実行間隔（分）。at(draw_at)による開票が本線で、これはSchedule登録漏れ・失敗時の保険"
  default     = 1

  validation {
    condition     = var.drawer_scan_minutes >= 1 && var.drawer_scan_minutes <= 60
    error_message = "スキャン間隔は1〜60分の範囲で指定してください。"
  }
}
