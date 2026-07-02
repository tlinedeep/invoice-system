#!/bin/bash
# ===== 群晖一键部署脚本 =====
# 用法：上传 invoice-deploy/ 目录到群晖，cd 进去，执行：
#   bash deploy.sh
set -e

echo "=========================================="
echo "  物资点收领用平台 - 群晖部署"
echo "=========================================="

# 1. 创建持久化目录
echo ""
echo "[1/5] 创建持久化目录..."
mkdir -p pgdata uploads
echo "  OK"

# 2. 启动容器
echo ""
echo "[2/5] 构建并启动容器..."
sudo docker-compose build --no-cache 2>&1 | tail -3
sudo docker-compose up -d
echo "  OK"

# 3. 等待 PostgreSQL 就绪
echo ""
echo "[3/5] 等待 PostgreSQL 就绪..."
for i in $(seq 1 30); do
  if sudo docker exec invoice-pg pg_isready -U invoice > /dev/null 2>&1; then
    echo "  PostgreSQL 就绪 (第 ${i}s)"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "  [错误] PostgreSQL 启动超时"
    exit 1
  fi
  sleep 1
done

# 4. 验证
echo ""
echo "[4/5] 验证服务..."
sleep 5
if sudo docker ps --format "{{.Names}} {{.Status}}" | grep -q "flask-invoice"; then
  echo "  Flask 运行中"
else
  echo "  [警告] Flask 未正常启动，请查看日志: sudo docker-compose logs invoice"
fi
if sudo docker ps --format "{{.Names}} {{.Status}}" | grep -q "invoice-pg"; then
  echo "  PostgreSQL 运行中"
else
  echo "  [警告] PostgreSQL 未正常启动"
fi

echo ""
echo "=========================================="
echo "  部署完成！"
echo "  外部访问: https://www.tjghaz.com:1135"
echo "  Docker 监听: 127.0.0.1:5001（仅本地，nginx 反向代理转发）"
echo "  默认账号: swingtt / swing208blue"
echo "  [注意] admin 账号已禁用，请使用 swingtt 登录"
echo "=========================================="
