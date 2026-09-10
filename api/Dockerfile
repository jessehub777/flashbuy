# FlashBuy API コンテナ（ECS Fargate / ARM64 向け）
# ビルド: cp config-prod.yaml.example config-prod.yaml && docker build -t flashbuy-api-dev .
# 注意: config-prod.yaml は雛形のままにする。真値を書くとイメージに入る。
FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS builder
WORKDIR /app

# 先に依存だけ入れる（キャッシュが効く）
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -o /out/server ./cmd/server

# 実行イメージも arm64 に固定する
FROM --platform=linux/arm64 alpine:3.20
# HTTPS通信に証明書、ログ時刻に日本時間が必要
RUN apk add --no-cache ca-certificates tzdata
ENV TZ=Asia/Tokyo

WORKDIR /app
COPY --from=builder /out/server ./server
# viper はカレントディレクトリから config-{APP_ENV}.yaml を探す。
# 中身は空の雛形でよい。真値はタスク定義の FLASHBUY_* で上書きされる
COPY config-prod.yaml ./config-prod.yaml

EXPOSE 8080
ENTRYPOINT ["./server"]
