output "AWS_ROLE_ARN_DEV" {
  value       = aws_iam_role.github_actions_dev.arn
  description = "DEV環境用の IAM Role ARN (GitHub Secret: AWS_ROLE_ARN_DEV)"
}

output "AWS_ROLE_ARN_PROD" {
  value       = aws_iam_role.github_actions_prod.arn
  description = "PROD環境用の IAM Role ARN (GitHub Secret: AWS_ROLE_ARN_PROD)"
}

output "S3_BUCKET_DEV" {
  value       = module.dev_hosting.bucket_name
  description = "DEV環境用の S3 バケット名 (GitHub Secret: S3_BUCKET_DEV)"
}

output "S3_BUCKET_PROD" {
  value       = module.prod_hosting.bucket_name
  description = "PROD環境用の S3 バケット名 (GitHub Secret: S3_BUCKET_PROD)"
}

output "CLOUDFRONT_DISTRIBUTION_ID_DEV" {
  value       = module.dev_hosting.cloudfront_distribution_id
  description = "DEV環境用の CloudFront ID (GitHub Secret: CLOUDFRONT_DISTRIBUTION_ID_DEV)"
}

output "CLOUDFRONT_DISTRIBUTION_ID_PROD" {
  value       = module.prod_hosting.cloudfront_distribution_id
  description = "PROD環境用の CloudFront ID (GitHub Secret: CLOUDFRONT_DISTRIBUTION_ID_PROD)"
}
