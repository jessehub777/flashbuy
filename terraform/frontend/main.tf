data "aws_caller_identity" "current" {}

# API（ECS/ALB）の接続先。/api/* をCloudFrontからALBへ転送するために使う。
# compute を apply してから frontend を apply すること。
# state が無いと remote state の読み込みでエラーになる
data "terraform_remote_state" "compute" {
  backend = "s3"
  config = {
    bucket = "flashbuy-terraform-state"
    key    = "compute/terraform.tfstate"
    region = "ap-northeast-1"
  }
}

# ==============================================================================
# DEV 環境
# ==============================================================================
module "dev_hosting" {
  source = "./modules/frontend-hosting"

  env               = "dev"
  bucket_name       = "flashbuy-frontend-dev-${data.aws_caller_identity.current.account_id}"
  enable_versioning = false
  force_destroy     = true

  # CloudFront の /api/* を ALB（devのAPI）へ転送する
  api_origin_domain = data.terraform_remote_state.compute.outputs.alb_dns_name
}

# ==============================================================================
# PROD 環境
# ==============================================================================
module "prod_hosting" {
  source = "./modules/frontend-hosting"

  env               = "prod"
  bucket_name       = "flashbuy-frontend-prod-${data.aws_caller_identity.current.account_id}"
  enable_versioning = true
  force_destroy     = false
}
