# ==============================================================================
# ロググループ（保持期間）
# ==============================================================================
# Lambda は初回実行時にロググループを自動生成する。このときの保持期間は
# 「無期限」（retentionInDays = null）で、ログは永久に溜まり続ける。
# 障害調査に必要なのは直近だけでよいため、明示的に作成して保持期間を設定する。
#
# ECS（/ecs/...）は compute モジュールで 7 日を設定済み。ここは Lambda 用。
#
# ⚠️ 初回の apply は注意:
#   ロググループは既に自動生成されているため、そのまま apply すると
#   ResourceAlreadyExistsException で失敗する。先に 1 度だけ import する:
#
#     terraform import aws_cloudwatch_log_group.lottery_drawer \
#       /aws/lambda/${project_name}-lottery-drawer-${environment}
#     terraform import aws_cloudwatch_log_group.order_expirer \
#       /aws/lambda/${project_name}-order-expirer-${environment}
#
#   import 後は plan が「retention_in_days の追加のみ」になる（ログ自体は消えない）。
# ==============================================================================

resource "aws_cloudwatch_log_group" "lottery_drawer" {
  name              = "/aws/lambda/${var.project_name}-lottery-drawer-${var.environment}"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "order_expirer" {
  name              = "/aws/lambda/${var.project_name}-order-expirer-${var.environment}"
  retention_in_days = 14
}
