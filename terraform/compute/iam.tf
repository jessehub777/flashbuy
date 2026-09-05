# タスク実行ロール。イメージ取得・ログ・Secret読み取りはここ
resource "aws_iam_role" "execution" {
  name = "${var.project_name}-api-execution-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "ecs-tasks.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secret" {
  name = "${var.project_name}-api-execution-secret-${var.environment}"
  role = aws_iam_role.execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "secretsmanager:GetSecretValue"
        Resource = aws_secretsmanager_secret.db_password.arn
      }
    ]
  })
}

# タスクロール。アプリ本体が使う権限だけここ
resource "aws_iam_role" "task" {
  name = "${var.project_name}-api-task-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "ecs-tasks.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy" "task" {
  name = "${var.project_name}-api-task-permissions-${var.environment}"
  role = aws_iam_role.task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # 開票・期限切れの Schedule 登録。同じ名前で作り直すので Create だけでは足りない
        Effect = "Allow"
        Action = [
          "scheduler:CreateSchedule",
          "scheduler:UpdateSchedule",
          "scheduler:DeleteSchedule",
          "scheduler:GetSchedule",
        ]
        Resource = "arn:aws:scheduler:${var.aws_region}:${data.aws_caller_identity.current.account_id}:schedule-group/${data.terraform_remote_state.lambda.outputs.lottery_schedule_group_name}"
      },
      {
        # Schedule に実行ロールを渡すために必要
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = data.terraform_remote_state.lambda.outputs.scheduler_execution_role_arn
      },
      {
        # 画像の直PUT用 Presigned URL の署名者になるため Put が要る。
        # 署名自体はローカル計算だが、PUT時に S3 側が署名者の権限を見る
        Effect   = "Allow"
        Action   = "s3:PutObject"
        Resource = "arn:aws:s3:::${data.terraform_remote_state.storage.outputs.images_bucket_name}/*"
      },
      {
        # 会員登録・ログインで使う。タスクの資格情報で署名するので、拒否されると全滅する
        # 確認スキップは PoC 用。生産では外す
        Effect = "Allow"
        Action = [
          "cognito-idp:SignUp",
          "cognito-idp:InitiateAuth",
          "cognito-idp:AdminConfirmSignUp",
        ]
        Resource = data.terraform_remote_state.auth.outputs.user_pool_arn
      }
    ]
  })
}
