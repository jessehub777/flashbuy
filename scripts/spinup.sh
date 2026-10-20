#!/usr/bin/env bash
# ==============================================================================
# spinup.sh — spindown.sh で削除したリソースを再構築する
#
# 再開の順序は依存関係で決まる（変えると apply が失敗する）:
#
#   data                    VPC / サブネット / RDS / ElastiCache
#     ↓
#   lambda                  data の private_subnet_ids・rds_host を参照
#     ↓
#   compute（ECR のみ）      ECS が pull するイメージの置き場を先に作る
#     ↓
#   API イメージを build & push
#     ↓
#   compute（全体）          ALB + ECS サービス
#     ↓
#   DB に api/init_db.sql を流す（テーブル作成 + シードデータ）
#     ↓
#   frontend                compute の alb_dns_name を origin に使う
#     ↓
#   monitoring              data source で ALB/RDS/Redis/Lambda を名前引き
#
# 注意:
#   - ALB を作り直すと DNS 名が変わる。frontend を apply し直すのはそのため。
#   - RDS は作り直しなので init_db.sql の再投入が必須。
#   - シードデータはすべて NOW() 基準なので、いつ実行しても有効な期間になる。
#
# 使い方: bash scripts/spinup.sh
# ==============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF="$ROOT/terraform"
REGION="ap-northeast-1"
IMAGE_TAG="latest"

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m[o] %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }

tf() {
  local d="$1"
  shift
  terraform -chdir="$TF/$d" "$@"
}

# init は冪等（初期化済みなら数秒で終わる）。.terraform が消えている環境でも
# 動くように、apply の前に必ず実行する。
#
# さらに apply は一時的なネットワーク障害で落ちることがある（spindown.sh 側の
# コメント参照）。再実行しても壊れないので、失敗したら少し待ってやり直す。
tf_run() {
  local d="$1" op="$2" attempt
  shift 2
  for attempt in 1 2 3; do
    tf "$d" init -input=false || true
    if terraform -chdir="$TF/$d" "$op" -auto-approve -input=false "$@"; then
      return 0
    fi
    if [[ $attempt -lt 3 ]]; then
      warn "$d の $op が失敗しました。一時的なネットワーク障害の可能性があります。10 秒後に再試行します（$attempt/3）"
      sleep 10
    fi
  done
  return 1
}

tf_apply() {
  local d="$1"
  shift
  tf_run "$d" apply "$@"
}

# ------------------------------------------------------------------------------
# 0. 前提チェック
# ------------------------------------------------------------------------------
command -v terraform >/dev/null || die "terraform が見つかりません"
command -v aws       >/dev/null || die "aws CLI が見つかりません"
command -v docker    >/dev/null || die "docker が見つかりません（API イメージの build/push に必要）"

for d in data lambda compute monitoring; do
  [[ -f "$TF/$d/terraform.tfvars" ]] || die "$TF/$d/terraform.tfvars がありません"
done

log "対象の AWS アカウント"
aws sts get-caller-identity --query 'Account' --output text

# ------------------------------------------------------------------------------
# 1. allowed_admin_cidrs の確認
#
# RDS / Redis の SG は開発端末のグローバルIP（/32）だけを許可している。
# IP が変わっていると、下の init_db.sql 投入（ローカルから psql）が接続できない。
# ------------------------------------------------------------------------------
log "グローバルIP と allowed_admin_cidrs の整合を確認"
MY_IP="$(curl -fsS --noproxy '*' --max-time 10 https://checkip.amazonaws.com 2>/dev/null | tr -d '\n' || true)"
if [[ -z "$MY_IP" ]]; then
  warn "グローバルIP を取得できませんでした（スキップ）"
elif grep -qF "$MY_IP" "$TF/data/terraform.tfvars"; then
  ok "現在のIP $MY_IP は allowed_admin_cidrs に含まれています"
else
  warn "現在のIP $MY_IP が terraform/data/terraform.tfvars の allowed_admin_cidrs にありません"
  warn "このままだと手元から RDS に接続できず、DB の初期化ができません。"
  warn "  allowed_admin_cidrs = [\"$MY_IP/32\"]  ← のように追記してください"
  read -r -p "  修正せずこのまま続行しますか? (y/N): " A || die "入力を受け取れませんでした"
  [[ "$A" == "y" ]] || die "中止しました（tfvars を直してから再実行してください）"
fi

# ------------------------------------------------------------------------------
# 2. Lambda の zip を作る
#    terraform/lambda は source_code_hash で zip を参照するため、apply の前に必要。
#    build.sh の中で go test も走る。
# ------------------------------------------------------------------------------
log "Lambda の zip をビルド（go test 込み）"
bash "$ROOT/lambdas/lottery_drawer/build.sh"
bash "$ROOT/lambdas/order_expirer/build.sh"
ok "zip をビルドしました"

# ------------------------------------------------------------------------------
# 3. data（VPC / RDS / ElastiCache）— RDS 作成に 8〜10 分かかる
# ------------------------------------------------------------------------------
log "apply: data（VPC / RDS / ElastiCache — 数分かかります）"
tf_apply data
ok "data 完了"

# ------------------------------------------------------------------------------
# 4. lambda（data の private subnet と RDS ホストを参照する）
# ------------------------------------------------------------------------------
log "apply: lambda"
tf_apply lambda
ok "lambda 完了"

# ------------------------------------------------------------------------------
# 5. compute のうち ECR だけ先に作る
#    ECS サービスはイメージが無いと起動できないため、先にリポジトリを作って push する。
#    （-target はこの用途のための一時的な部分適用。直後の全体 apply で整合する）
# ------------------------------------------------------------------------------
log "apply: compute（ECR リポジトリのみ）"
tf_apply compute -target=aws_ecr_repository.api

ECR_URL="$(tf compute output -raw ecr_repository_url)"
REGISTRY="${ECR_URL%%/*}"
ok "ECR: $ECR_URL"

# ------------------------------------------------------------------------------
# 6. API イメージを build して push（linux/arm64 / Fargate ARM64 用）
# ------------------------------------------------------------------------------
log "API イメージを build して push（${IMAGE_TAG}）"
# Dockerfile は config-prod.yaml を COPY する。中身はタスク定義の環境変数で上書きされるため
# 雛形（.example）を無条件でコピーする。既存ファイルをそのまま使うと、実値が入っていた場合に
# イメージへ焼き込まれてしまう（api/Dockerfile の注意書きと同じ理由）。
# CI（api-ci.yml / api-cd.yml）も同じく無条件でコピーしている。
cp "$ROOT/api/config-prod.yaml.example" "$ROOT/api/config-prod.yaml"
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY"
docker build --platform linux/arm64 -t "$ECR_URL:$IMAGE_TAG" "$ROOT/api"
docker push "$ECR_URL:$IMAGE_TAG"
ok "イメージを push しました"

# ------------------------------------------------------------------------------
# 7. compute の全体を適用（ALB / ECS サービス）
# ------------------------------------------------------------------------------
log "apply: compute（ALB / ECS サービス）"
tf_apply compute

CLUSTER="$(tf compute output -raw ecs_cluster_name)"
SERVICE="$(tf compute output -raw ecs_service_name)"

log "ECS サービスが安定するまで待機（最大 10 分）"
if ! aws ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICE"; then
  warn "安定しませんでした。--force-new-deployment で再試行します"
  aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" --force-new-deployment >/dev/null
  aws ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICE" \
    || die "ECS サービスが起動しません。CloudWatch Logs /ecs/flashbuy-api-dev を確認してください"
fi
ok "ECS サービスが安定しました"

# ------------------------------------------------------------------------------
# 8. DB を初期化する（テーブル作成 + シードデータ）
#
# RDS は作り直したので中身は空。api/init_db.sql がテーブル作成から
# シード投入まで全部やる（中に TRUNCATE があるので再実行しても同じ結果になる）。
#
# psql が無い環境向けに docker の postgres イメージで代用する。
# ------------------------------------------------------------------------------
log "DB を初期化します（api/init_db.sql）"
DB_HOST="$(tf data output -raw rds_host)"
DB_PORT="$(tf data output -raw rds_port)"
DB_NAME="$(tf data output -raw db_name)"
DB_USER="$(tf data output -raw db_username)"
DB_PASS="$(grep -E '^[[:space:]]*db_password' "$TF/data/terraform.tfvars" | head -1 | sed -E 's/.*"([^"]*)".*/\1/')"

[[ -n "$DB_PASS" ]] || die "terraform/data/terraform.tfvars から db_password を読めませんでした"
printf '  %s@%s:%s/%s\n' "$DB_USER" "$DB_HOST" "$DB_PORT" "$DB_NAME"

if command -v psql >/dev/null; then
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -v ON_ERROR_STOP=1 -f "$ROOT/api/init_db.sql"
else
  warn "psql が無いため docker 経由で流します"
  docker run --rm -i -e PGPASSWORD="$DB_PASS" postgres:15-alpine \
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f - \
    < "$ROOT/api/init_db.sql"
fi
ok "DB を初期化しました"

# ------------------------------------------------------------------------------
# 9. frontend（ALB を作り直すと DNS 名が変わるので origin を貼り直す）
# ------------------------------------------------------------------------------
log "apply: frontend（CloudFront の /api/* origin を新しい ALB に向ける）"

# spindown で frontend を残した場合、CloudFront は作り直されない（ID・URL とも不変）。
# apply の前に state を見て判定しておき、最後の案内を出し分ける。
FRONTEND_KEPT=0
if tf frontend state list 2>/dev/null | grep -q 'aws_cloudfront_distribution'; then
  FRONTEND_KEPT=1
fi

tf_apply frontend

BUCKET="$(tf frontend output -raw S3_BUCKET_DEV)"
DIST_ID="$(tf frontend output -raw CLOUDFRONT_DISTRIBUTION_ID_DEV)"
CF_DOMAIN_DEV="$(tf frontend output -raw CLOUDFRONT_DOMAIN_DEV 2>/dev/null || echo '')"

log "フロントを S3 にデプロイ"
if command -v pnpm >/dev/null; then
  PNPM="pnpm"
elif command -v corepack >/dev/null; then
  PNPM="corepack pnpm"
else
  die "pnpm も corepack も見つかりません（frontend のビルドに必要）"
fi
( cd "$ROOT/frontend" && $PNPM install --frozen-lockfile && $PNPM build )
[[ -d "$ROOT/frontend/dist" ]] || die "frontend/dist が生成されませんでした"

# アセットを先に上げ、index.html を後で上書きし、最後に古いアセットを消す
aws s3 sync "$ROOT/frontend/dist" "s3://$BUCKET" \
  --exclude "index.html" --cache-control "max-age=31536000,immutable"
aws s3 cp "$ROOT/frontend/dist/index.html" "s3://$BUCKET/index.html" --cache-control "no-cache"
aws s3 sync "$ROOT/frontend/dist" "s3://$BUCKET" --delete --exclude "index.html"
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/index.html" >/dev/null
ok "フロントをデプロイしました"

# ------------------------------------------------------------------------------
# 10. monitoring（ALB/RDS/Redis/Lambda を名前引きするので最後）
# ------------------------------------------------------------------------------
log "apply: monitoring"
tf_apply monitoring
ok "monitoring 完了"

# ------------------------------------------------------------------------------
# 10.5 作り直しで「値が変わるもの」の案内
#
# spindown.sh は既定で frontend を残すため、その場合は CloudFront の ID も
# URL も変わらない（GitHub Secret の更新は不要）。DESTROY_FRONTEND=1 で消した
# 場合だけ ID が変わるので、そのときは Secret を更新する必要がある。
# monitoring の SNS トピックは毎回作り直しになるため、メール購読の確認が再度必要。
# ------------------------------------------------------------------------------
CF_PROD="$(tf frontend output -raw CLOUDFRONT_DISTRIBUTION_ID_PROD 2>/dev/null || echo '(取得できませんでした)')"
if [[ "$FRONTEND_KEPT" == "1" ]]; then
  ok "CloudFront は spindown で残したものをそのまま使っています（URL / ID とも変化なし）"
  printf '    CLOUDFRONT_DISTRIBUTION_ID_DEV  = %s\n' "$DIST_ID"
  printf '    CLOUDFRONT_DISTRIBUTION_ID_PROD = %s\n' "$CF_PROD"
  printf '    S3_BUCKET_DEV                   = %s\n' "$BUCKET"
  printf '    → GitHub Secret の更新は不要です\n'
else
  warn "CloudFront の ID は作り直しで変わっています。GitHub Secret を確認してください:"
  printf '    CLOUDFRONT_DISTRIBUTION_ID_DEV  = %s\n' "$DIST_ID"
  printf '    CLOUDFRONT_DISTRIBUTION_ID_PROD = %s\n' "$CF_PROD"
  printf '    S3_BUCKET_DEV                   = %s（アカウントID由来なので変化なし）\n' "$BUCKET"
fi
warn "monitoring のアラーム通知先 SNS は再購読になります。確認メールのリンクを再度クリックしてください"

# ------------------------------------------------------------------------------
# 11. 動作確認
#
# ALB の SG は CloudFront のプレフィックスリストのみ許可しているため、
# 手元から ALB を直接叩くと必ずタイムアウトする（設定どおりの挙動で、故障ではない）。
# そのため「ターゲットのヘルス」と「CloudFront 経由の API」で確認する。
# curl には --noproxy を付ける（環境に http_proxy があると誤判定するため）。
# ------------------------------------------------------------------------------
ALB_DNS="$(tf compute output -raw alb_dns_name)"

log "ターゲットのヘルス確認（${SERVICE}）"
TG_ARN="$(aws elbv2 describe-target-groups --names "$SERVICE" \
  --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || true)"
if [[ -n "$TG_ARN" && "$TG_ARN" != "None" ]]; then
  HEALTH="$(aws elbv2 describe-target-health --target-group-arn "$TG_ARN" \
    --query 'TargetHealthDescriptions[0].TargetHealth.State' --output text 2>/dev/null || true)"
  if [[ "$HEALTH" == "healthy" ]]; then
    ok "ターゲットは healthy です"
  else
    warn "ターゲットの状態: ${HEALTH:-取得できませんでした}。CloudWatch Logs /ecs/flashbuy-api-dev を確認してください"
  fi
else
  warn "ターゲットグループ $SERVICE が見つかりませんでした"
fi

log "疎通確認: https://$CF_DOMAIN_DEV/api/v1/home/top10（CloudFront 経由）"
if curl -fsS --noproxy '*' --max-time 20 "https://$CF_DOMAIN_DEV/api/v1/home/top10" >/dev/null; then
  ok "CloudFront 経由で API が応答しました"
else
  warn "CloudFront 経由の API が応答しません。ECS のタスク状態と CloudWatch Logs を確認してください"
fi

cat <<EOS

==============================================================================
再開しました。

  Frontend: https://$CF_DOMAIN_DEV
  API     : https://$CF_DOMAIN_DEV/api/v1/home/top10
            （ALB は CloudFront からのみ許可しているため、$ALB_DNS の直叩きは不可）
  ECR     : $ECR_URL
  ECS     : $CLUSTER / $SERVICE
  S3      : s3://$BUCKET
  Login   : admin@flashbuy.demo / user@flashbuy.demo（パスワード Demo1234!）

api/config-dev.yaml（ローカルから API を起動する場合）に転記する値:
  database.host  = $DB_HOST
  redis.host     = $(tf data output -raw redis_host)

次に停止するとき: bash scripts/spindown.sh
==============================================================================
EOS
