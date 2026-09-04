# ALB: 外からは 80 番だけ受ける（HTTPSは証明書を取ってから）
resource "aws_security_group" "alb" {
  name        = "${var.project_name}-alb-${var.environment}"
  description = "ALB for FlashBuy API"
  vpc_id      = data.terraform_remote_state.data.outputs.vpc_id

  ingress {
    description = "HTTP from internet"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
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
