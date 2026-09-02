terraform {
  required_version = ">= 1.11.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "local" {}
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
