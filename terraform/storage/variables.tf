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

variable "allowed_origins" {
  type        = list(string)
  description = "ブラウザからの直接PUTを許可するオリジン（開発: localhost:5173 / 本番: CloudFront）"
  default     = ["http://localhost:5173"]
}
