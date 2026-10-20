output "bucket_name" {
  value = aws_s3_bucket.this.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.this.arn
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.this.id
}

# 公開 URL（*.cloudfront.net）。独自ドメインを設定していないため、
# ディストリビューションを作り直すとこの値は変わる。
output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.this.domain_name
}

output "cloudfront_distribution_arn" {
  value = aws_cloudfront_distribution.this.arn
}
