terraform {
  required_version = ">= 1.11.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
  # bootstrap用: 一度だけ local backend で apply する
  backend "local" {}
}

provider "aws" {
  region = "ap-northeast-1"
}
