output "images_bucket_name" {
  description = "商品画像用S3バケット名（api/config-*.yaml の aws.s3_bucket_name に設定する）"
  value       = aws_s3_bucket.images.id
}

output "images_bucket_region" {
  description = "バケットのリージョン"
  value        = "ap-northeast-1"
}

output "images_bucket_public_base" {
  description = "公開URLのベース（商品画像の参照に使用）"
  value       = "https://${aws_s3_bucket.images.id}.s3.ap-northeast-1.amazonaws.com"
}
