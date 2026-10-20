#!/usr/bin/env bash
# ==============================================================================
# spindown.sh — FlashBuy の常駐リソースを停止（削除）する
#
# 目的: 月 約 $76 のランニングコストを 約 $1 まで落とす。
#
# 削除するもの（月額の目安）:
#   data        RDS + ElastiCache + VPC（パブリックIP 4本を含む）  約 $54
#   compute     ALB + ECS Fargate + ECR                            約 $23
#   lambda      2 × Lambda + EventBridge Scheduler/Rules + SNS     約 $0
#   monitoring  CloudWatch アラーム 12 本 + ダッシュボード          約 $0.2
#
# 残すもの（ほぼ無料で、再開を楽にするため）:
#   frontend    CloudFront ×2 + S3 ×2                              約 $0
#               → 既定で残す。公開 URL（*.cloudfront.net）が変わらないため。
#                 消したい場合だけ DESTROY_FRONTEND=1 を付ける。
#   state / shared / auth / storage
#
# なぜ lambda / monitoring も消すのか（どちらも月額 約 $0 だが、残せない）:
#   lambda      data の private subnet に ENI を持つ。関数を残したまま VPC を
#               削除すると、サブネットが ENI 残存で削除できず data が失敗する。
#               さらに DB が無い状態で 1 分ごとの cron が走り、毎回エラーになる。
#   monitoring  ALB / RDS / Redis / Lambda を data source で名前引きしている。
#               参照先を先に消すと、次に monitoring を destroy しようとしたとき
#               plan の時点で参照解決に失敗して削除できなくなる。
#
#   ※ auth は必ず残すこと。Cognito の sub が変わると api/init_db.sql に
#     ハードコードされた固定 UUID と一致しなくなり、デモユーザーで
#     ログインできなくなる（＝再開時に DB を作り直しても使えない）。
#
# 使い方:
#   bash scripts/spindown.sh                       # 確認プロンプトあり
#   bash scripts/spindown.sh --yes                 # プロンプトなし
#   DESTROY_FRONTEND=1 bash scripts/spindown.sh    # CloudFront / S3 も削除する
#
# 元に戻す: bash scripts/spinup.sh
# ==============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF="$ROOT/terraform"
DATA_TF="$TF/data/main.tf"
DATA_TF_BAK="$TF/data/main.tf.spindown.bak"
REGION="ap-northeast-1"

# terraform/frontend のバケット名は ${project_name}-frontend-${environment}-${account_id}。
# terraform/frontend 側の project_name と一致させること（不一致だと空にすべき
# バケットを拾えず、destroy が BucketNotEmpty で失敗する）。
PROJECT_NAME="flashbuy"
BUCKET_PREFIX="${PROJECT_NAME}-frontend-"

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m[o] %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }

# terraform -chdir ラッパ（各ディレクトリが独立した state を持つ）
tf() {
  local d="$1"
  shift
  terraform -chdir="$TF/$d" "$@"
}

# init は冪等（初期化済みなら数秒で終わる）。.terraform が消えている環境でも
# 動くように、apply / destroy の前に必ず実行する。
#
# さらに apply / destroy は一時的なネットワーク障害で落ちることがある。実際に
# lambda の plan が以下で失敗した事例がある（DNS が一時的に引けなかっただけ）:
#   dial tcp: lookup sns.ap-northeast-1.amazonaws.com: no such host
# terraform の apply / destroy は再実行しても壊れない（冪等）ため、
# 失敗したら少し待ってやり直す。
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

tf_destroy() {
  local d="$1"
  shift
  tf_run "$d" destroy "$@"
}

# ------------------------------------------------------------------------------
# 行単位のコメントアウト（外部コマンドに依存しない）
#
# sed -i は実装によって挙動が違うため使わない。macOS 標準の BSD sed は
# `-i ''`（サフィックス無し）で動くが、PATH 上に別の sed（ラッパー等）が
# あると空の引数をスクリプト名と誤解して失敗する。
# 破壊的操作の直前なので、bash 組み込みだけで完結させる。
#
# 対象は「行全体がちょうど pattern と一致する行」のみ。行頭の空白は保持する。
# 見つからなければ 1 を返し、ファイルは一切変更しない。
# ------------------------------------------------------------------------------
comment_out_line() {
  local file="$1" pattern="$2" tmp="$1.spindown.tmp" found=0 line
  : > "$tmp"
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" =~ ^([[:space:]]*)(${pattern})[[:space:]]*$ ]]; then
      printf '%s# %s  # spindown: 一時的に無効化\n' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" >> "$tmp"
      found=1
    else
      printf '%s\n' "$line" >> "$tmp"
    fi
  done < "$file"
  if [[ "$found" != "1" ]]; then
    rm -f "$tmp"
    return 1
  fi
  mv "$tmp" "$file"
  return 0
}

# pattern の行が「コメントされずに残っていないか」を確認する
has_active_line() {
  local file="$1" pattern="$2" line
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" =~ ^([[:space:]]*)(${pattern})[[:space:]]*$ ]]; then
      return 0
    fi
  done < "$file"
  return 1
}

# ------------------------------------------------------------------------------
# S3 バケットを完全に空にする
#
# terraform/frontend の prod バケットは force_destroy = false かつ、バージョニングは
# 「有効」または「一時停止」で使われている。どちらの場合も、中身（現行オブジェクト・
# 旧バージョン・削除マーカー）が1つでも残っていると terraform destroy が
# BucketNotEmpty で失敗する。
# dev バケットは force_destroy = true なので本来は不要だが、同じ処理で問題ない。
# ------------------------------------------------------------------------------
# list-object-versions の 1 ページ分を削除し、削除件数を stdout に返す。
# 1 件ずつ消しているのは、キーに含まれる記号で delete-objects の JSON を
# 組み立てるのが壊れやすいため（このバケットには Vite の生成物しか入らない）。
purge_one_page() {
  local bucket="$1" query="$2" key version n=0
  while IFS=$'\t' read -r key version; do
    # バージョンIDが取れない行は触らない。この 1 行で 2 つのものを弾いている:
    #   1. AWS CLI が空のリストに対して返す "None" という 1 行（フィールドが 1 つだけなので
    #      version が空になる。キー名が "None" のオブジェクトではない）
    #   2. 何らかの理由で version が空の行
    # どちらもここで弾かないと、下の「--version-id を省いた delete-object」=
    # 削除マーカーの新規挿入を呼んでしまい、"None" という名前の削除マーカーが
    # 実際に作られた（踏んだ）。
    #
    # 注意: キー名で "None" を弾いてはいけない。既に出来てしまった
    # "None" というキーの削除マーカーは version に "null" を持つので、
    # キー名で弾くと永久に消せずループが止まらなくなる。
    [[ -n "$version" ]] || continue

    # バージョン管理が Suspended のバケットでは、バージョンID が文字列 "null" になる。
    # この場合も --version-id null を「明示して渡す」のが正しい。
    # 省くと Suspended バケットでは削除マーカーを新しく挿入するだけになり、
    # null の削除マーカーが永久に消えず 100 回ループして失敗する（実際に踏んだ）。
    aws s3api delete-object --bucket "$bucket" --key "$key" --version-id "$version" >/dev/null 2>&1 || true
    n=$((n + 1))
  done < <(aws s3api list-object-versions --bucket "$bucket" \
            --query "$query" --output text 2>/dev/null || true)
  printf '%s' "$n"
}

empty_bucket() {
  local bucket="$1" count guard=0

  # 1. 現行オブジェクト（バージョニング無効ならこれだけで空になる）
  aws s3 rm "s3://$bucket" --recursive --quiet >/dev/null 2>&1 || true

  # 2. 旧バージョンと削除マーカー（バージョニング有効なバケット向け）
  #    list-object-versions は 1 回 1000 件までなので、減らなくなるまで繰り返す。
  while :; do
    guard=$((guard + 1))
    if [[ $guard -gt 100 ]]; then
      warn "$bucket を空にできませんでした（繰り返し上限に達しました）"
      warn "  残っているものを確認するには:"
      warn "    aws s3api list-object-versions --bucket $bucket --query 'DeleteMarkers[].[Key,VersionId]' --output text"
      return 1
    fi

    count=$(( $(purge_one_page "$bucket" 'Versions[].[Key,VersionId]') + $(purge_one_page "$bucket" 'DeleteMarkers[].[Key,VersionId]') ))

    [[ $count -gt 0 ]] || break
  done
  return 0
}

# バケットが存在するか（存在しないバケットを「空でない」と誤判定しないため）
bucket_exists() {
  aws s3api head-bucket --bucket "$1" >/dev/null 2>&1
}

# バケットが完全に空かどうか（オブジェクト・旧バージョン・削除マーカーすべて）
#
# 注意: JMESPath に + 演算子は無い（--query に + を書くと "Unknown token +" になる）。
# 比較演算子と && で判定する。判定自体に失敗した場合は「空でない」扱いにして、
# destroy を始めない安全側に倒す。
is_empty_bucket() {
  local bucket="$1" out
  if ! out="$(aws s3api list-object-versions --bucket "$bucket" \
                --query 'length(Versions || `[]`) == `0` && length(DeleteMarkers || `[]`) == `0`' \
                --output text 2>/dev/null)"; then
    return 1
  fi
  [[ "$out" == "True" ]]
}

# ------------------------------------------------------------------------------
# VPC の中に terraform 管理外のセキュリティグループが残っていると、
# DeleteVpc が DependencyViolation で失敗する。
#
# 実際に data の destroy がこれで失敗した: ElastiCache の「CloudShell から接続」機能が
#   cloudshell-elasticache-<cluster> / elasticache-cloudshell-<cluster>
# という 2 つの SG を作っており、それが残っていた。両者は 6379 で相互参照しているため、
# ルールを先に剥がしてからでないと削除できない。
#
# terraform が管理している SG は terraform 自身が消すので、ここでは
# 上記の AWS 生成 SG（名前で判別できる）だけを対象にして誤爆を避ける。
# ------------------------------------------------------------------------------
cleanup_cloudshell_sgs() {
  local vpc="$1" ids sg perms
  [[ -n "$vpc" ]] || return 0

  ids="$(aws ec2 describe-security-groups --filters "Name=vpc-id,Values=$vpc" \
    --query "SecurityGroups[?GroupName!='default' && (starts_with(GroupName,'cloudshell-elasticache-') || starts_with(GroupName,'elasticache-cloudshell-'))].GroupId" \
    --output text 2>/dev/null | tr '\t' '\n' || true)"
  [[ -n "$ids" ]] || return 0

  warn "ElastiCache/CloudShell が作った terraform 管理外の SG を削除します（VPC 削除を妨げるため）"

  # 相互参照しているので、先に全ルールを剥がす
  for sg in $ids; do
    perms="$(aws ec2 describe-security-groups --group-ids "$sg" \
      --query 'SecurityGroups[0].IpPermissions' --output json 2>/dev/null || true)"
    if [[ -n "$perms" && "$perms" != "[]" ]]; then
      aws ec2 revoke-security-group-ingress --group-id "$sg" \
        --ip-permissions "$perms" >/dev/null 2>&1 || true
    fi
    perms="$(aws ec2 describe-security-groups --group-ids "$sg" \
      --query 'SecurityGroups[0].IpPermissionsEgress' --output json 2>/dev/null || true)"
    if [[ -n "$perms" && "$perms" != "[]" ]]; then
      aws ec2 revoke-security-group-egress --group-id "$sg" \
        --ip-permissions "$perms" >/dev/null 2>&1 || true
    fi
  done

  for sg in $ids; do
    if aws ec2 delete-security-group --group-id "$sg" >/dev/null 2>&1; then
      ok "削除: $sg"
    else
      warn "削除できませんでした（手動で削除してください）: $sg"
    fi
  done
  return 0
}

# ------------------------------------------------------------------------------
# 失敗しても削除保護の設定を必ず元に戻す
# ------------------------------------------------------------------------------
restore_protection() {
  if [[ -f "$DATA_TF_BAK" ]]; then
    cp "$DATA_TF_BAK" "$DATA_TF"
    rm -f "$DATA_TF_BAK"
    warn "terraform/data/main.tf の削除保護設定を元に戻しました"
  fi
}
trap restore_protection EXIT

# ------------------------------------------------------------------------------
# 0. 前提チェック
# ------------------------------------------------------------------------------
command -v terraform >/dev/null || die "terraform が見つかりません"
command -v aws       >/dev/null || die "aws CLI が見つかりません"

for d in data lambda compute monitoring; do
  [[ -f "$TF/$d/terraform.tfvars" ]] \
    || die "$TF/$d/terraform.tfvars がありません（destroy に db_password 等が必要です）"
done

# Lambda zip は source_code_hash = filebase64sha256(...) として plan 時に評価されるため、
# destroy であっても zip が無いと plan の時点で失敗する。
for f in lambdas/lottery_drawer/dist/lottery_drawer.zip \
         lambdas/order_expirer/dist/order_expirer.zip; do
  [[ -f "$ROOT/$f" ]] \
    || die "$f がありません。先に lambdas/*/build.sh を実行してください"
done

log "対象の AWS アカウント"
aws sts get-caller-identity --query 'Account' --output text
printf '  リージョン: %s\n' "$REGION"

# ------------------------------------------------------------------------------
# 0.1 最終確認
# ------------------------------------------------------------------------------
if [[ "${1:-}" != "--yes" ]]; then
  printf '\n\033[1;31mこの操作は RDS のデータを削除します（最終スナップショットは取られません）。\033[0m\n'
  printf 'データは再開時に api/init_db.sql で作り直せます。\n'
  read -r -p "続行するには 'flashbuy' と入力してください: " ANS \
    || die "入力を受け取れませんでした（プロンプトを出さない場合は --yes を付けてください）"
  [[ "$ANS" == "flashbuy" ]] || die "中止しました"
fi

# ------------------------------------------------------------------------------
# 0.2 何かを壊す前に、S3 バケットの中身を空にする
#
# prod バケットは force_destroy = false なので、中身が残っていると destroy が
# BucketNotEmpty で失敗する。バージョニングが有効でも一時停止でも、
# 旧バージョンと削除マーカーまで消さないとバケットは空にならない。
# 手前のモジュールを消した後にここで失敗すると中途半端になるため、最初に検証して
# 問題があれば何も削除しないうちに中止する。
# ------------------------------------------------------------------------------
DESTROY_FRONTEND="${DESTROY_FRONTEND:-0}"
# 後方互換: 以前の KEEP_FRONTEND=1（残す）は既定と同じなので、そのまま受け付ける
if [[ "${KEEP_FRONTEND:-0}" == "1" ]]; then
  DESTROY_FRONTEND=0
fi

if [[ "$DESTROY_FRONTEND" == "1" ]]; then
  warn "DESTROY_FRONTEND=1 のため frontend（CloudFront / S3）も削除します"
else
  warn "frontend（CloudFront / S3）は残します（約 $0。公開 URL を維持）"
fi

if [[ "$DESTROY_FRONTEND" == "1" ]]; then
  log "frontend の S3 バケットを空にします"

  # バケット名はまず terraform output から取る。ただし terraform/frontend の state が
  # 不完全（output が空／state にバケット本体しか無い）な環境が実際にあり、その場合は
  # output が取れないため空にすべきバケットを見落とし、destroy が BucketNotEmpty で失敗する。
  # そのため実アカウントのバケット一覧を接頭辞で拾って併合する。
  candidates=""
  for o in S3_BUCKET_DEV S3_BUCKET_PROD; do
    v="$(tf frontend output -raw "$o" 2>/dev/null || true)"
    if [[ -n "$v" ]]; then
      candidates="$candidates$v"$'\n'
    fi
  done
  candidates="$candidates$(aws s3api list-buckets \
      --query "Buckets[?starts_with(Name, '${BUCKET_PREFIX}')].Name" \
      --output text 2>/dev/null | tr '\t' '\n' || true)"

  seen=" "
  for b in $candidates; do
    [[ -n "$b" ]] || continue
    case "$seen" in *" $b "*) continue ;; esac
    seen="$seen$b "

    if ! bucket_exists "$b"; then
      warn "$b は存在しません（作成されていないか削除済み）。スキップします"
      continue
    fi

    empty_bucket "$b" || die "$b を空にできませんでした。手動で空にしてから再実行してください"
    if is_empty_bucket "$b"; then
      ok "空にしました: $b"
    else
      die "$b にオブジェクトが残っています（force_destroy = false のため destroy できません）。手動で削除してから再実行してください"
    fi
  done
fi

# ------------------------------------------------------------------------------
# 1. RDS の削除保護を一時的に外す
#
# terraform/data/main.tf の deletion_protection = true と prevent_destroy = true が
# destroy をブロックするため、バックアップを取ってからコメントアウトする。
# どちらもファイル末尾の EXIT トラップで必ず元に戻る。
# ------------------------------------------------------------------------------
log "RDS の削除保護を一時的に解除します"
[[ -f "$DATA_TF_BAK" ]] || cp "$DATA_TF" "$DATA_TF_BAK"

comment_out_line "$DATA_TF" 'deletion_protection = true' \
  || die "terraform/data/main.tf に 'deletion_protection = true' の行が見つかりません。手動で確認してください"
comment_out_line "$DATA_TF" 'prevent_destroy = true' \
  || die "terraform/data/main.tf に 'prevent_destroy = true' の行が見つかりません。手動で確認してください"

if has_active_line "$DATA_TF" 'deletion_protection = true'; then
  die "deletion_protection をコメントアウトできませんでした（手動で確認してください）"
fi
if has_active_line "$DATA_TF" 'prevent_destroy = true'; then
  die "prevent_destroy をコメントアウトできませんでした（手動で確認してください）"
fi
ok "コメントアウト完了（バックアップ: $(basename "$DATA_TF_BAK")）"

# AWS 側の削除保護は destroy では解除されない（delete API が拒否される）。
# 先に apply して in-place で false にしてから destroy する。
#
# ただし、この apply は「state に RDS が残っている」ときだけ実行する。
# 途中まで destroy が進んだ後に再実行すると、apply が消したリソース
# （VPC / サブネット / RDS / Redis）を作り直してしまうため。
if tf data state list 2>/dev/null | grep -q 'aws_db_instance'; then
  log "AWS 側の削除保護を解除します（apply・数分かかります）"
  tf_apply data \
    || die "data の apply に失敗しました（3 回試行）。AWS の認証情報とネットワークを確認してください。このスクリプトは再実行しても安全です"
  ok "AWS 側の削除保護を解除しました"
else
  warn "RDS が data の state に無いため、削除保護の解除（apply）をスキップします"
  warn "  （再実行時に apply すると、削除済みのリソースを作り直してしまうため）"
fi

# data を消す前に、VPC 内に残っている terraform 管理外の SG を片付ける。
# 放置すると DeleteVpc が DependencyViolation で失敗する（実際に失敗した）。
cleanup_cloudshell_sgs "$(tf data output -raw vpc_id 2>/dev/null || true)"

# ------------------------------------------------------------------------------
# 2. 依存関係の逆順に削除する
#
#   monitoring : data "aws_lb" 等でリソースを名前引きしているため最初に消す
#                （リソースを先に消すと参照解決に失敗して destroy できない）
#   frontend   : compute の alb_dns_name output を remote state 経由で読む
#   lambda     : data のプライベートサブネットに ENI を持つ。VPC を先に消すと
#                サブネットが ENI 残存で削除できず失敗する（必ず compute/data より前）
#   data       : 最後
# ------------------------------------------------------------------------------
if [[ "$DESTROY_FRONTEND" == "1" ]]; then
  DESTROY_ORDER=(monitoring frontend compute lambda data)
else
  DESTROY_ORDER=(monitoring compute lambda data)
fi

for d in "${DESTROY_ORDER[@]}"; do
  log "destroy: $d"
  tf_destroy "$d" \
    || die "$d の destroy に失敗しました（3 回試行）。手前のモジュールは削除済みです。ネットワーク等を確認して再実行してください（このスクリプトは何度実行しても安全で、削除済みのモジュールは自動でスキップされます）"
  ok "$d を削除しました"
done

# ------------------------------------------------------------------------------
# 3. 削除保護の設定をファイルに戻す（EXIT トラップでも戻るが、成功時は先に戻す）
# ------------------------------------------------------------------------------
restore_protection

# ------------------------------------------------------------------------------
# 4. 停止後の確認
#
# terraform の state と実リソースがずれている場合（state が不完全で管理外の
# リソースが残っている等）、destroy が「成功」しても課金が続くことがある。
# 課金の大きいものだけ実アカウントを叩いて確認する。
# ------------------------------------------------------------------------------
log "停止後の確認（残っていれば課金が続きます）"
leftover=0
check() {
  local label="$1" result="$2" shown
  # AWS CLI は --output text で空のリストに対して "None" という文字列を返すことがある。
  # これを「残っている」と誤判定しないよう明示的に除外する。
  if [[ -z "$result" || "$result" == "None" ]]; then
    printf '  %-24s なし\n' "$label"
  else
    shown="${result//$'\n'/ }"
    shown="${shown//$'\t'/ }"
    printf '\033[1;33m  %-24s %s\033[0m\n' "$label" "$shown"
    leftover=1
  fi
}

check "RDS" "$(aws rds describe-db-instances \
  --query 'DBInstances[].DBInstanceIdentifier' --output text 2>/dev/null || true)"
check "ElastiCache" "$(aws elasticache describe-cache-clusters \
  --query 'CacheClusters[].CacheClusterId' --output text 2>/dev/null || true)"
check "ロードバランサ" "$(aws elbv2 describe-load-balancers \
  --query 'LoadBalancers[].LoadBalancerName' --output text 2>/dev/null || true)"
check "ECS クラスタ" "$(aws ecs list-clusters --query 'clusterArns' --output text 2>/dev/null \
  | tr '\t' '\n' | sed -E 's#.*/##' | grep -v '^$' || true)"
check "EC2 インスタンス" "$(aws ec2 describe-instances \
  --filters Name=instance-state-name,Values=running \
  --query 'Reservations[].Instances[].InstanceId' --output text 2>/dev/null || true)"
check "NAT Gateway" "$(aws ec2 describe-nat-gateways --filter Name=state,Values=available \
  --query 'NatGateways[].NatGatewayId' --output text 2>/dev/null || true)"
check "EIP（未使用でも課金）" "$(aws ec2 describe-addresses \
  --query 'Addresses[].PublicIp' --output text 2>/dev/null || true)"
check "CloudFront" "$(aws cloudfront list-distributions \
  --query 'DistributionList.Items[].Id' --output text 2>/dev/null || true)"
check "Lambda" "$(aws lambda list-functions \
  --query "Functions[?starts_with(FunctionName, '${PROJECT_NAME}-')].FunctionName" \
  --output text 2>/dev/null || true)"
check "Scheduler グループ" "$(aws scheduler get-schedule-group \
  --group-name "${PROJECT_NAME}-lottery-dev" --query 'Name' \
  --output text 2>/dev/null || true)"

# S3 は残る想定（state / 画像）。ここは情報表示のみで判定には含めない。
printf '  %-24s %s\n' "S3（残る想定）" \
  "$(aws s3api list-buckets --query "Buckets[?starts_with(Name, '${PROJECT_NAME}-')].Name" \
     --output text 2>/dev/null | tr '\t' ' ' || true)"

if [[ "$leftover" == "1" ]]; then
  warn "黄色で出たものは terraform の管理外で残っています。不要なら手動で削除してください"
else
  ok "課金対象は残っていません"
fi

# ------------------------------------------------------------------------------
# 5. 結果
# ------------------------------------------------------------------------------
if [[ "$DESTROY_FRONTEND" == "1" ]]; then
  cat <<'EOS'

==============================================================================
停止しました。残っているリソース（合計 約 $1/月）:
  - terraform state（S3 バケット + S3 ロックファイル）
  - Cognito User Pool（デモユーザー 2 名もそのまま）
  - 画像用 S3 バケット（アップロード済み画像もそのまま）
  - ECR リポジトリは compute と一緒に削除済み
  - CloudFront / S3 は frontend ごと削除済み
    → 次回 spinup で URL（*.cloudfront.net）が変わります

再開するとき:
  bash scripts/spinup.sh
==============================================================================
EOS
else
  # frontend を残したので、次回も同じ URL で見られることを明示する
  CF_DOMAIN_DEV="$(tf frontend output -raw CLOUDFRONT_DOMAIN_DEV 2>/dev/null || echo '')"
  cat <<EOS

==============================================================================
停止しました。残っているリソース（合計 約 \$1/月）:
  - terraform state（S3 バケット + S3 ロックファイル）
  - Cognito User Pool（デモユーザー 2 名もそのまま）
  - 画像用 S3 バケット（アップロード済み画像もそのまま）
  - CloudFront ×2 + S3 ×2（frontend は残しています）
      Frontend: https://${CF_DOMAIN_DEV}
      → この URL は変わりません。ただし API（ALB）は止まっているため、
        画面は開いても商品一覧・購入は失敗します
  - ECR リポジトリは compute と一緒に削除済み

再開するとき:
  bash scripts/spinup.sh

請求の確認:
  Cost Explorer → 翌日以降にほぼ \$0/日 になっていることを確認してください。
==============================================================================
EOS
fi
