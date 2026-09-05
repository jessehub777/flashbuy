# ==============================================================================
# S3 Bucket
# ==============================================================================
resource "aws_s3_bucket" "this" {
  bucket        = var.bucket_name
  force_destroy = var.force_destroy

  tags = {
    Environment = var.env
  }
}

resource "aws_s3_bucket_versioning" "this" {
  count  = var.enable_versioning ? 1 : 0
  bucket = aws_s3_bucket.this.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "this" {
  bucket                  = aws_s3_bucket.this.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ==============================================================================
# CloudFront OAC
# ==============================================================================
resource "aws_cloudfront_origin_access_control" "this" {
  name                              = "${var.bucket_name}-oac"
  description                       = "OAC for ${var.env} frontend S3"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ==============================================================================
# CloudFront Distribution
# ==============================================================================
# AWS Managed Cache Policy for Optimized Caching
data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

# APIは毎回最新の結果を返したいので、キャッシュを無効にする（在庫・価格が古くなるため）
data "aws_cloudfront_cache_policy" "caching_disabled" {
  count = var.api_origin_domain != "" ? 1 : 0
  name  = "Managed-CachingDisabled"
}

# クエリ・ヘッダー（Authorization含む）・Cookieを、そのままALBへ転送する
data "aws_cloudfront_origin_request_policy" "all_viewer" {
  count = var.api_origin_domain != "" ? 1 : 0
  name  = "Managed-AllViewer"
}

resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  is_ipv6_enabled     = true
  price_class         = "PriceClass_200"
  default_root_object = "index.html"

  origin {
    domain_name              = aws_s3_bucket.this.bucket_regional_domain_name
    origin_id                = "S3Origin-${var.env}"
    origin_access_control_id = aws_cloudfront_origin_access_control.this.id
  }

  # API（ECSのALB）を同じドメインの配下に置く。
  # フロントは /api/v1/* を相対パスで呼ぶため、別ドメイン直アクセスにすると
  # CORS と mixed content（HTTPS画面→HTTP API）の両方で詰む。
  # CloudFront で転送すれば同じドメインのままなので、どちらも起きない
  dynamic "origin" {
    for_each = var.api_origin_domain != "" ? [1] : []

    content {
      domain_name = var.api_origin_domain
      origin_id   = "ApiOrigin-${var.env}"

      custom_origin_config {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "http-only" # ALBはHTTPのみ（ACM証明書は後続で追加）
        origin_ssl_protocols   = ["TLSv1.2"]
        origin_read_timeout    = 60
      }
    }
  }

  # SPA 路由 404/403 重定向到 index.html
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3Origin-${var.env}"
    compress         = true

    # 非推奨の forwarded_values の代わりに Cache Policy を使う
    cache_policy_id = data.aws_cloudfront_cache_policy.caching_optimized.id

    viewer_protocol_policy = "redirect-to-https"
  }

  # /api/* だけ ALB へ流す（default_cache_behavior より優先される）
  #
  # 注意: 403/404 を index.html に差し替える設定（SPA用）はパスで絞れない。
  # API は存在しないパスも含めて HTTP 200 + body の code で返す設計
  # （api/pkg/response + router の NoRoute）のため、アプリの誤りは差し替わらない。
  # ただし ALB 側の 5xx（デプロイ直後の起動待ちなど）は対象外。JSON 解析に失敗したら
  # 少し待って再試行すること。完全に分けたい場合は API を別ドメインに切り出す
  dynamic "ordered_cache_behavior" {
    for_each = var.api_origin_domain != "" ? [1] : []

    content {
      path_pattern     = "/api/*"
      allowed_methods  = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods   = ["GET", "HEAD"]
      target_origin_id = "ApiOrigin-${var.env}"
      compress         = true

      cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled[0].id
      origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer[0].id

      # POSTをリダイレクトでGETに変えないため redirect-to-https は使わない
      viewer_protocol_policy = "https-only"
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Environment = var.env
  }
}

# ==============================================================================
# S3 Bucket Policy
# ==============================================================================
resource "aws_s3_bucket_policy" "this" {
  bucket = aws_s3_bucket.this.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action    = "s3:GetObject"
        Effect    = "Allow"
        Resource  = "${aws_s3_bucket.this.arn}/*"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.this.arn
          }
        }
      }
    ]
  })
}
