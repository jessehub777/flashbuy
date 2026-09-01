# ==============================================================================
# FlashBuy 商品画像用 S3 バケット
# ブラウザが署名付きURL（Presigned URL）で直接 PUT し、公開URLで参照する。
# 画像はAPIサーバーを経由しないため、バケット側にCORS設定が必要。
# ==============================================================================

resource "aws_s3_bucket" "images" {
  bucket = "${var.project_name}-images-${var.environment}"

  tags = {
    Name = "${var.project_name}-images-${var.environment}"
  }
}

# 公開読み取りを許可するため、Block Public Access の該当項目を無効化する
# （商品画像は公開情報のため。プライベートにする場合はCloudFront経由に変更する）
resource "aws_s3_bucket_public_access_block" "images" {
  bucket = aws_s3_bucket.images.id

  block_public_acls       = true
  block_public_policy     = false # バケットポリシーによる公開を許可
  ignore_public_acls      = true
  restrict_public_buckets = false
}

# 誰でも画像を取得できる（商品画像は公開情報のため）
resource "aws_s3_bucket_policy" "images" {
  bucket = aws_s3_bucket.images.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicRead"
        Effect    = "Allow"
        Principal = "*"
        Action    = ["s3:GetObject"]
        Resource  = "${aws_s3_bucket.images.arn}/*"
      }
    ]
  })

  # ポリシー設定前に Public Access Block の反映を待つ
  depends_on = [aws_s3_bucket_public_access_block.images]
}

# ブラウザからの直接PUTを許可するCORS設定
# （これがないと Presigned URL への PUT がブラウザのCORS制限でブロックされる）
resource "aws_s3_bucket_cors_configuration" "images" {
  bucket = aws_s3_bucket.images.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "GET", "HEAD"]
    allowed_origins = var.allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}
