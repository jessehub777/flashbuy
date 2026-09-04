terraform {
  required_version = ">= 1.11.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # S3 Remote State（他モジュールと同じ。既存のlocal stateからの移行は
  # terraform init -migrate-state で行う）
  backend "s3" {
    bucket       = "flashbuy-terraform-state"
    key          = "auth/terraform.tfstate"
    region       = "ap-northeast-1"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = "ap-northeast-1"

  default_tags {
    tags = {
      Project   = "FlashBuy"
      ManagedBy = "Terraform"
    }
  }
}
