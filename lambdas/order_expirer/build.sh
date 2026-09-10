#!/bin/bash
# OrderExpirer Lambda のビルド（linux/arm64 向けバイナリ + zip）
# terraform/lambda は dist/order_expirer.zip をデプロイする
set -euo pipefail
cd "$(dirname "$0")"

# go が PATH にない場合（例: ツール未起動のシェル）は /usr/local/go/bin を探す
if ! command -v go >/dev/null 2>&1; then
  export PATH="$PATH:/usr/local/go/bin"
fi

mkdir -p dist

echo "==> go mod tidy"
go mod tidy

# SQL冪等性のガード条件などを検証する単体テスト（lottery_drawer/build.sh と同じく、ビルド時に必ず走らせる）
echo "==> go test"
go test ./...

echo "==> go build (linux/arm64)"
GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -ldflags="-s -w" -o dist/bootstrap .

echo "==> zip"
(cd dist && rm -f order_expirer.zip && zip -q -y order_expirer.zip bootstrap && rm bootstrap)

echo "==> 完了: $(pwd)/dist/order_expirer.zip"
