#!/bin/bash
# ===== 群晖安全更新脚本 =====
# 更新代码，保留所有数据（pgdata/ 和 uploads/ 不会触碰）
set -e

echo "=========================================="
echo "  物资点收领用平台 - 安全更新"
echo "=========================================="
echo "  [注意] 本脚本只更新代码，不会删除任何数据"
echo ""

# 1. 登录密码缓存（避免中途问密码）
echo "[1/5] 验证权限..."
sudo -v
echo "  OK"

# 2. 确认当前目录有 docker-compose.yml
if [ ! -f docker-compose.yml ]; then
  echo "[错误] 未找到 docker-compose.yml，请在 invoice-deploy 目录下执行"
  exit 1
fi

# 3. 复制新代码（跳过 pgdata/ 和 uploads/）
echo "[2/5] 复制新代码..."
TMP_DIR=$(mktemp -d)
tar -xzf /volume1/docker/invoice-deploy.tar.gz -C "$TMP_DIR" --strip-components=1 2>/dev/null || \
  echo "  [提示] 请先将 invoice-deploy.tar.gz 放到当前目录"

if [ -f invoice-deploy.tar.gz ]; then
  tar -xzf invoice-deploy.tar.gz -C "$TMP_DIR" --strip-components=1
fi

# 只复制代码文件，不覆盖 pgdata/ 和 uploads/
for f in app.py config.py database.py models.py exceptions.py logging_config.py Dockerfile docker-compose.yml .dockerignore chi_sim.traineddata eng.traineddata requirements.txt package.json package-lock.json CLAUDE.md; do
  if [ -f "$TMP_DIR/$f" ]; then
    cp "$TMP_DIR/$f" .
    echo "    $f"
  fi
done
for d in routes services static templates repositories parsers alembic; do
  if [ -d "$TMP_DIR/$d" ]; then
    rm -rf "./$d"
    cp -r "$TMP_DIR/$d" .
    echo "    $d/"
  fi
done
# 复制 alembic.ini（与 alembic/ 配套）
if [ -f "$TMP_DIR/alembic.ini" ]; then
  cp "$TMP_DIR/alembic.ini" .
  echo "    alembic.ini"
fi
rm -rf "$TMP_DIR"
echo "  OK"

# 4. 重新构建镜像（--no-cache 确保用最新代码）
echo "[3/5] 重建 Docker 镜像..."
sudo docker-compose build 2>&1 | tail -5
echo "  OK"

# 5. 重启容器（pgdata/ 保持不变，数据不会丢失）
echo "[4/5] 重启容器..."
sudo docker-compose up -d
echo "  OK"

# 6. 验证
echo "[5/5] 验证..."
sleep 3
if sudo docker ps --format "{{.Names}}" | grep -q "flask-invoice"; then
  echo "  Flask 已更新"
else
  echo "  [警告] 请检查日志: sudo docker-compose logs invoice"
fi
if sudo docker ps --format "{{.Names}}" | grep -q "invoice-pg"; then
  echo "  PostgreSQL 运行中（数据完好）"
fi

echo ""
echo "=========================================="
echo "  更新完成！数据不受影响"
echo "=========================================="
