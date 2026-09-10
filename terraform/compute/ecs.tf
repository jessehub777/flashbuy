resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster-${var.environment}"
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
}

# 設定は config-prod.yaml（雛形）+ FLASHBUY_* 環境変数の上書きで渡す。
# 空白の値も必ず書く。無いキーは環境変数で上書きできない（viperの仕様）
resource "aws_ecs_task_definition" "api" {
  family                   = "${var.project_name}-api-${var.environment}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = "${aws_ecr_repository.api.repository_url}:latest"
      essential = true

      portMappings = [
        { containerPort = 8080, hostPort = 8080, protocol = "tcp" }
      ]

      environment = [
        # APP_ENV=prod は「クラウド用の設定ファイルを使う」の意味。本番環境の意味ではない
        { name = "APP_ENV", value = "prod" },
        { name = "FLASHBUY_DATABASE_HOST", value = data.terraform_remote_state.data.outputs.rds_host },
        { name = "FLASHBUY_REDIS_HOST", value = data.terraform_remote_state.data.outputs.redis_host },
        { name = "FLASHBUY_AWS_REGION", value = var.aws_region },
        { name = "FLASHBUY_AWS_S3_BUCKET_NAME", value = data.terraform_remote_state.storage.outputs.images_bucket_name },
        { name = "FLASHBUY_COGNITO_REGION", value = var.aws_region },
        { name = "FLASHBUY_COGNITO_USER_POOL_ID", value = data.terraform_remote_state.auth.outputs.user_pool_id },
        { name = "FLASHBUY_COGNITO_APP_CLIENT_ID", value = data.terraform_remote_state.auth.outputs.app_client_id },
        { name = "FLASHBUY_SCHEDULER_REGION", value = var.aws_region },
        { name = "FLASHBUY_SCHEDULER_SCHEDULE_GROUP_NAME", value = data.terraform_remote_state.lambda.outputs.lottery_schedule_group_name },
        { name = "FLASHBUY_SCHEDULER_DRAWER_FUNCTION_ARN", value = data.terraform_remote_state.lambda.outputs.lottery_drawer_function_arn },
        { name = "FLASHBUY_SCHEDULER_EXPIRER_FUNCTION_ARN", value = data.terraform_remote_state.lambda.outputs.order_expirer_function_arn },
        { name = "FLASHBUY_SCHEDULER_EXECUTION_ROLE_ARN", value = data.terraform_remote_state.lambda.outputs.scheduler_execution_role_arn },
      ]

      # パスワードだけは平文で置かず Secrets Manager から入れる
      secrets = [
        { name = "FLASHBUY_DATABASE_PASSWORD", valueFrom = aws_secretsmanager_secret.db_password.arn }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.api.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "api"
        }
      }
    }
  ])
}

# 台数は1台（PoC）。期限切れ処理は Lambda がやるので、API内の goroutine は動かない
resource "aws_ecs_service" "api" {
  name            = "${var.project_name}-api-${var.environment}"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 1

  # ECS標準の入れ替え。100% を切らさず、一時的に2台まで増やしてよい
  # ブルーグリーン（READMEの形）にするときは CODE_DEPLOY に変える
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  # 1台目は通常料金で安定させ、増えた分だけ Spot に寄せる。1台の間は Spot に乗らない
  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    base              = 1
    weight            = 1
  }
  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 1
  }

  network_configuration {
    # 公有サブネット + 公開IP。NATが無いのでこうしないと AWS の API を呼べない
    subnets          = data.terraform_remote_state.data.outputs.public_subnet_ids
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 8080
  }

  health_check_grace_period_seconds = 30
}
