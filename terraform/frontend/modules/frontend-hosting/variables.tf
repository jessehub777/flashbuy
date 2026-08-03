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
