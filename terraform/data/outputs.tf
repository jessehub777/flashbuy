output "vpc_id" {
  value = aws_vpc.main.id
}

output "db_name" {
  description = "RDSのデータベース名"
  value       = aws_db_instance.postgres.db_name
}

output "db_username" {
  description = "RDSのマスターユーザー名"
  value       = aws_db_instance.postgres.username
}

output "rds_endpoint" {
  description = "RDS接続用エンドポイント (host:port)"
  value       = "${aws_db_instance.postgres.address}:${aws_db_instance.postgres.port}"
}

output "rds_host" {
  value = aws_db_instance.postgres.address
}

output "rds_port" {
  value = aws_db_instance.postgres.port
}

output "redis_endpoint" {
  description = "ElastiCache Redis接続用エンドポイント (host:port)"
  value       = "${aws_elasticache_cluster.redis.cache_nodes[0].address}:${aws_elasticache_cluster.redis.cache_nodes[0].port}"
}

output "redis_host" {
  value = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "redis_port" {
  value = aws_elasticache_cluster.redis.cache_nodes[0].port
}
