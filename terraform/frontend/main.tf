data "aws_caller_identity" "current" {}

# ==============================================================================
# DEV 環境
# ==============================================================================
module "dev_hosting" {
  source = "./modules/frontend-hosting"

  env               = "dev"
  bucket_name       = "flashbuy-frontend-dev-${data.aws_caller_identity.current.account_id}"
  enable_versioning = false
  force_destroy     = true
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
