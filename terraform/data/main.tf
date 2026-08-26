# ==============================================================================
# FlashBuy データ基盤（VPC + RDS PostgreSQL + ElastiCache Redis）
# terraform/data/ は独立したtfstateを持ち、auth/ frontend/ と並列する
# ==============================================================================

# ==============================================================================
# VPC とサブネット
# ==============================================================================
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name        = "${var.project_name}-vpc-${var.environment}"
    Project     = var.project_name
    Environment = var.environment
  }
}

# パブリックサブネット（AZ横断で2つ）
resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name        = "${var.project_name}-subnet-public-${count.index}-${var.environment}"
    Environment = var.environment
  }
}

# プライベートサブネット（AZ横断で2つ）
resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name        = "${var.project_name}-subnet-private-${count.index}-${var.environment}"
    Environment = var.environment
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

# ==============================================================================
# インターネットゲートウェイ（パブリックサブネット用）
# ==============================================================================
resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name        = "${var.project_name}-igw-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }

  tags = {
    Name        = "${var.project_name}-rt-public-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# ==============================================================================
# セキュリティグループ
# ==============================================================================
# RDS (PostgreSQL 5432)
resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds-${var.environment}"
  description = "RDS PostgreSQL access"
  vpc_id      = aws_vpc.main.id

  # 開発者端末からの直接接続（ローカル開発用）
  dynamic "ingress" {
    for_each = var.allowed_admin_cidrs
    content {
      from_port   = 5432
      to_port     = 5432
      protocol    = "tcp"
      cidr_blocks = [ingress.value]
    }
  }

  # 同一VPC内（ECS等）からの接続
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "VPC internal access"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.project_name}-sg-rds-${var.environment}"
    Environment = var.environment
  }
}

# Redis (6379)
resource "aws_security_group" "redis" {
  name        = "${var.project_name}-redis-${var.environment}"
  description = "ElastiCache Redis access"
  vpc_id      = aws_vpc.main.id

  dynamic "ingress" {
    for_each = var.allowed_admin_cidrs
    content {
      from_port   = 6379
      to_port     = 6379
      protocol    = "tcp"
      cidr_blocks = [ingress.value]
    }
  }

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "VPC internal access"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.project_name}-sg-redis-${var.environment}"
    Environment = var.environment
  }
}

# ==============================================================================
# RDS PostgreSQL（実務派: provisioned 小規模 / 無料枠内）
# ==============================================================================
resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db-subnet-${var.environment}"
  # 開発フェーズ: ローカルから直接接続するため公表サブネットに配置する。
  # 接続は SG の allowed_admin_cidrs（開発端末IP）で制限する。
  # 本番運用時は private サブネット + NAT に変更し、ECSからのみ接続する。
  subnet_ids = aws_subnet.public[*].id

  tags = {
    Name        = "${var.project_name}-db-subnet-group-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_db_instance" "postgres" {
  identifier     = "${var.project_name}-postgres-${var.environment}"
  engine         = "postgres"
  # 大版本のみ指定し、AWS側で最新の小バージョンを選択させる（小バージョンEOLでのapply失敗を防ぐ）
  engine_version = "15"

  # 無料枠: db.t4g.micro（750時間/月）に収まるようにする
  instance_class        = var.db_instance_class
  allocated_storage     = 20
  max_allocated_storage = 50
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = "flashbuy"
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  # PoC / 実務派: 単一AZ（Multi-AZはコスト増のため本番検討時に有効化）
  multi_az = false
  # ローカル開発から直接接続するため公開エンドポイントを付与する。
  # 公表サブネット + IGW 経由で外部到達可能になる。
  # 接続は SG で allowed_admin_cidrs（開発端末のIP）に制限する。
  # 本番運用時は publicly_accessible = false + 私有サブネットにしてECSからのみ接続する。
  publicly_accessible = true

  # 無料枠の制限: バックアップ保持は最大1日（7日にするとFreeTierRestrictionErrorになる）
  backup_retention_period = 1
  backup_window           = "03:00-04:00"
  maintenance_window      = "sun:04:00-sun:05:00"

  # PoCでは最終スナップショットを取らない（skip_final_snapshot = true）
  skip_final_snapshot = true

  # パスワード変更時はインスタンス再作成を避ける
  lifecycle {
    ignore_changes = [password]
  }

  tags = {
    Name        = "${var.project_name}-postgres-${var.environment}"
    Environment = var.environment
  }
}

# ==============================================================================
# ElastiCache Redis（PoC: 単ノード）
# ==============================================================================
resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project_name}-redis-subnet-${var.environment}"
  subnet_ids = aws_subnet.private[*].id

  tags = {
    Name        = "${var.project_name}-redis-subnet-group-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "${var.project_name}-redis-${var.environment}"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.redis_node_type
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.redis.id]

  tags = {
    Name        = "${var.project_name}-redis-${var.environment}"
    Environment = var.environment
  }
}
