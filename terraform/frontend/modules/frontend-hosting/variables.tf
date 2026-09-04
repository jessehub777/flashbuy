variable "env" {
  type        = string
  description = "Environment name (e.g., dev, prod)"
}

variable "bucket_name" {
  type        = string
  description = "Name of the S3 bucket"
}

variable "enable_versioning" {
  type        = bool
  default     = false
  description = "Enable S3 versioning"
}

variable "force_destroy" {
  type        = bool
  default     = true
  description = "Force destroy S3 bucket even if it has contents"
}

# API（ECSのALB）のDNS名。terraform/compute の output "alb_dns_name" を渡す。
# 空の場合は /api/* の転送設定を作らない（compute がまだ無い prod でも動くようにするため）
variable "api_origin_domain" {
  type        = string
  default     = ""
  description = "ALB DNS name for /api/* forwarding (empty = disabled)"
}
