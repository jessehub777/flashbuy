# CloudFront のオリジン向けIP帯のマネージドプレフィックスリスト。
# IP帯はAWSが自動更新するため、自分でIPを管理する必要がない
data "aws_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

# ALB: 80 番は CloudFront からのみ受ける（インターネット全体には開けない）
# HTTPS（443 + ACM証明書）はドメイン取得後の課題
resource "aws_security_group" "alb" {
  name        = "${var.project_name}-alb-${var.environment}"
  description = "ALB for FlashBuy API"
  vpc_id      = data.terraform_remote_state.data.outputs.vpc_id

  ingress {
    description     = "HTTP from CloudFront only"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    prefix_list_ids = [data.aws_prefix_list.cloudfront.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# タスク: ALB からの 8080 だけ受ける。外への通信は RDS / Redis / AWS 用に全開
resource "aws_security_group" "api" {
  name        = "${var.project_name}-api-task-${var.environment}"
  description = "FlashBuy API ECS tasks"
  vpc_id      = data.terraform_remote_state.data.outputs.vpc_id

  ingress {
    description     = "HTTP from ALB only"
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_lb" "api" {
  name               = "${var.project_name}-api-${var.environment}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = data.terraform_remote_state.data.outputs.public_subnet_ids
}

# 行き先は1つ。/ping で健康確認する
resource "aws_lb_target_group" "api" {
  name        = "${var.project_name}-api-${var.environment}"
  port        = 8080
  protocol    = "HTTP"
  vpc_id      = data.terraform_remote_state.data.outputs.vpc_id
  target_type = "ip"

  health_check {
    path                = "/ping"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  deregistration_delay = 30
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}
