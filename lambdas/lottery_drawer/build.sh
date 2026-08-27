#!/bin/bash
# LotteryDrawer Lambda のビルド（linux/arm64 向けバイナリ + zip）
# terraform/lambda は dist/lottery_drawer.zip をデプロイする
set -euo pipefail
cd "$(dirname "$0")"

# go が PATH にない場合（例: ツール未起動のシェル）は /usr/local/go/bin を探す
if ! command -v go >/dev/null 2>&1; then
  export PATH="$PATH:/usr/local/go/bin"
fi

mkdir -p dist

echo "==> go test"
go test ./...

echo "==> go build (linux/arm64)"
GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -ldflags="-s -w" -o dist/bootstrap .

echo "==> zip"
(cd dist && rm -f lottery_drawer.zip && zip -q -y lottery_drawer.zip bootstrap && rm bootstrap)

echo "==> 完了: $(pwd)/dist/lottery_drawer.zip"
