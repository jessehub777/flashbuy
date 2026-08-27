terraform {
  required_version = ">= 1.11.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
  # S3 Remote State（terraform/state で作成したバケットを使用）
  backend "s3" {
    bucket       = "flashbuy-terraform-state"
    key          = "lambda/terraform.tfstate"
    region       = "ap-northeast-1"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = "ap-northeast-1"

  default_tags {
    tags = {
      Project     = "FlashBuy"
      Environment = "Lambda"
      ManagedBy   = "Terraform"
    }
  }
}
