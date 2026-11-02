#!/usr/bin/env bash
# ==============================================================================
# db-run.sh — SQL を VPC 内で 1 回だけ実行する
#
# RDS はプライベートサブネットにあり、開発端末から psql で直接接続できない。
# このスクリプトはパブリックサブネットに Fargate タスクを 1 つ起動し、
# S3 に置いた SQL を取得して psql で流す。終了後にタスクと S3 オブジェクトは残らない。
#
# 使い方:
#   bash scripts/db-run.sh api/init_db.sql
#   2 つ目以降の引数はそのまま psql に渡る（-v 変数=値 など）
#
# SQL は init_db.sql のように 20KB を超えるものがあり、ECS の overrides（8KB 上限）
# には収まらない。そのため S3 経由で渡している。
# ==============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF="$ROOT/terraform"
REGION="ap-northeast-1"
FAMILY="flashbuy-dbinit-dev"

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m[o] %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }

SQL_FILE="${1:-}"
[[ -n "$SQL_FILE" ]] || die "SQL ファイルを指定してください: bash scripts/db-run.sh <file.sql> [psql 引数...]"
shift || true
EXTRA_ARGS="$*"
[[ -f "$SQL_FILE" ]] || die "ファイルがありません: $SQL_FILE"

tfout() { terraform -chdir="$TF/$1" output -raw "$2"; }

DB_HOST="$(tfout data rds_host)"
DB_PORT="$(tfout data rds_port)"
DB_NAME="$(tfout data db_name)"
DB_USER="$(tfout data db_username)"
DB_PASS="$(grep -E '^[[:space:]]*db_password' "$TF/data/terraform.tfvars" | head -1 | sed -E 's/.*"([^"]*)".*/\1/')"
[[ -n "$DB_PASS" ]] || die "terraform/data/terraform.tfvars から db_password を読めませんでした"

CLUSTER="$(tfout compute ecs_cluster_name)"
SERVICE="$(tfout compute ecs_service_name)"
BUCKET="$(tfout frontend S3_BUCKET_DEV)"

# ------------------------------------------------------------------------------
# SQL を S3 に置き、短命の署名付き URL を発行する
# ------------------------------------------------------------------------------
KEY="_dbinit/$(basename "$SQL_FILE")"
log "SQL を S3 に転送（s3://$BUCKET/$KEY）"
aws s3 cp "$SQL_FILE" "s3://$BUCKET/$KEY" --region "$REGION" --only-show-errors
SQL_URL="$(aws s3 presign "s3://$BUCKET/$KEY" --expires-in 900 --region "$REGION")"

cleanup() {
  aws s3 rm "s3://$BUCKET/$KEY" --region "$REGION" --only-show-errors >/dev/null 2>&1 || true
}
trap cleanup EXIT

# ------------------------------------------------------------------------------
# 実行環境を ECS サービスから引き継ぐ
#
# タスクはサービスと同じサブネット・セキュリティグループで起動する。
# RDS の SG は VPC の CIDR からの 5432 を許可しているため、これで到達できる。
# ------------------------------------------------------------------------------
log "ECS サービスのネットワーク構成と実行ロールを取得"
NET_JSON="$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
  --region "$REGION" --query 'services[0].networkConfiguration.awsvpcConfiguration' --output json)"
SUBNETS="$(printf '%s' "$NET_JSON" | python3 -c 'import json,sys;print(",".join(json.load(sys.stdin)["subnets"]))')"
SGS="$(printf '%s' "$NET_JSON" | python3 -c 'import json,sys;print(",".join(json.load(sys.stdin)["securityGroups"]))')"

TD_ARN="$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
  --region "$REGION" --query 'services[0].taskDefinition' --output text)"
EXEC_ROLE="$(aws ecs describe-task-definition --task-definition "$TD_ARN" \
  --region "$REGION" --query 'taskDefinition.executionRoleArn' --output text)"
LOG_GROUP="$(aws ecs describe-task-definition --task-definition "$TD_ARN" \
  --region "$REGION" --query 'taskDefinition.containerDefinitions[0].logConfiguration.options.awslogs-group' --output text)"

# ------------------------------------------------------------------------------
# 使い捨てのタスク定義を登録する
# ------------------------------------------------------------------------------
log "タスク定義を登録（$FAMILY）"
TD_FILE="$(mktemp)"
export FAMILY DB_HOST DB_PORT DB_NAME DB_USER DB_PASS SQL_URL EXTRA_ARGS EXEC_ROLE LOG_GROUP REGION
python3 - "$TD_FILE" <<'PY'
import json, os, sys

td = {
    "family": os.environ["FAMILY"],
    "networkMode": "awsvpc",
    "requiresCompatibilities": ["FARGATE"],
    "cpu": "256",
    "memory": "512",
    "executionRoleArn": os.environ["EXEC_ROLE"],
    "containerDefinitions": [{
        "name": "psql",
        "image": "postgres:15-alpine",
        "essential": True,
        "environment": [
            {"name": "PGHOST", "value": os.environ["DB_HOST"]},
            {"name": "PGPORT", "value": os.environ["DB_PORT"]},
            {"name": "PGDATABASE", "value": os.environ["DB_NAME"]},
            {"name": "PGUSER", "value": os.environ["DB_USER"]},
            {"name": "PGPASSWORD", "value": os.environ["DB_PASS"]},
            {"name": "PSQL_ARGS", "value": os.environ["EXTRA_ARGS"]},
        ],
        # $PSQL_ARGS はコンテナ内で展開させる（シェル変数として渡す）
        "command": ["sh", "-c",
                    "wget -qO /tmp/run.sql '" + os.environ["SQL_URL"] + "' && "
                    "psql -v ON_ERROR_STOP=1 $PSQL_ARGS -f /tmp/run.sql"],
        "logConfiguration": {
            "logDriver": "awslogs",
            "options": {
                "awslogs-group": os.environ["LOG_GROUP"],
                "awslogs-region": os.environ["REGION"],
                "awslogs-stream-prefix": "dbinit",
            },
        },
    }],
}
with open(sys.argv[1], "w") as f:
    json.dump(td, f)
PY

aws ecs register-task-definition --region "$REGION" --cli-input-json "file://$TD_FILE" >/dev/null
rm -f "$TD_FILE"
ok "登録しました"

# ------------------------------------------------------------------------------
# 実行して終了を待つ
# ------------------------------------------------------------------------------
log "psql を実行（${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}）"
TASK_ARN="$(aws ecs run-task --cluster "$CLUSTER" --task-definition "$FAMILY" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SGS],assignPublicIp=ENABLED}" \
  --region "$REGION" --query 'tasks[0].taskArn' --output text)"
[[ -n "$TASK_ARN" && "$TASK_ARN" != "None" ]] || die "タスクを起動できませんでした"

aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TASK_ARN" --region "$REGION"

EXIT_CODE="$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN" \
  --region "$REGION" --query 'tasks[0].containers[0].exitCode' --output text)"
STREAM="$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN" \
  --region "$REGION" --query 'tasks[0].containers[0].logStreamName' --output text)"

if [[ "$EXIT_CODE" != "0" ]]; then
  printf '\n--- CloudWatch Logs (%s / %s) ---\n' "$LOG_GROUP" "$STREAM"
  aws logs get-log-events --log-group-name "$LOG_GROUP" --log-stream-name "$STREAM" \
    --region "$REGION" --query 'events[].message' --output text || true
  die "psql が失敗しました（exit=$EXIT_CODE）"
fi

ok "完了しました（exit=0）"
