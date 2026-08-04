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
    
    # 使用 Cache Policy 替代过时的 forwarded_values
    cache_policy_id = data.aws_cloudfront_cache_policy.caching_optimized.id
    
    viewer_protocol_policy = "redirect-to-https"
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
