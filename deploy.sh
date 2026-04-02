#!/usr/bin/env bash
set -euo pipefail

# 进入脚本所在目录，避免在任意路径执行时找不到 compose 文件
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

# 统一封装 docker compose 命令
DOCKER_COMPOSE=(docker compose)

print_usage() {
  cat <<'USAGE'
用法:
  ./deploy.sh [dev|prod] [up|down|restart|ps|logs|config]

示例:
  ./deploy.sh dev up      # 开发环境部署（本地 127.0.0.1）
  ./deploy.sh prod up     # 生产环境部署（compose 内置 postgres/neo4j）
  ./deploy.sh dev logs    # 查看开发环境日志（跟随）
  ./deploy.sh prod down   # 停止并清理生产环境容器
USAGE
}

# 解析环境参数；未传时进入交互选择
ENV_NAME="${1:-}"
if [[ -z "$ENV_NAME" ]]; then
  echo "请选择部署环境:"
  echo "1) dev  (本地宿主机数据库 127.0.0.1)"
  echo "2) prod (compose 内置数据库服务)"
  read -r -p "输入 1 或 2: " choice

  case "$choice" in
    1) ENV_NAME="dev" ;;
    2) ENV_NAME="prod" ;;
    *)
      echo "无效输入: $choice"
      exit 1
      ;;
  esac
fi

# 动作参数，默认执行 up（构建并后台启动）
ACTION="${2:-up}"

# 根据环境选择 env 文件与 compose 文件
case "$ENV_NAME" in
  dev)
    ENV_FILE=".env.dev"
    COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.dev.yml)
    ;;
  prod)
    ENV_FILE=".env.prod"
    COMPOSE_FILES=(-f docker-compose.yml)
    ;;
  *)
    echo "不支持的环境: $ENV_NAME"
    print_usage
    exit 1
    ;;
esac

# 检查环境文件是否存在
if [[ ! -f "$ENV_FILE" ]]; then
  echo "缺少环境文件: $ENV_FILE"
  echo "请先创建该文件后再执行。"
  exit 1
fi

# 先做一次配置校验，避免半路启动失败
"${DOCKER_COMPOSE[@]}" --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" config --quiet

echo "环境: $ENV_NAME"
echo "环境文件: $ENV_FILE"
echo "动作: $ACTION"

# 执行动作
case "$ACTION" in
  up)
    "${DOCKER_COMPOSE[@]}" --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" up -d --build
    ;;
  down)
    "${DOCKER_COMPOSE[@]}" --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" down --remove-orphans
    ;;
  restart)
    "${DOCKER_COMPOSE[@]}" --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" down --remove-orphans
    "${DOCKER_COMPOSE[@]}" --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" up -d --build
    ;;
  ps)
    "${DOCKER_COMPOSE[@]}" --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" ps
    ;;
  logs)
    "${DOCKER_COMPOSE[@]}" --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" logs -f --tail=200
    ;;
  config)
    "${DOCKER_COMPOSE[@]}" --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" config
    ;;
  *)
    echo "不支持的动作: $ACTION"
    print_usage
    exit 1
    ;;
esac
