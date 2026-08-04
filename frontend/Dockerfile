# Multi-stage build for FlashBuy frontend
# Stage 1: build
FROM node:24-alpine AS builder
WORKDIR /app

# Install pnpm via corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy dependency files
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm build

# Stage 2: serve with nginx
FROM nginx:1.25-alpine AS production
COPY --from=builder /app/dist /usr/share/nginx/html

# SPA routing: all paths → index.html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
