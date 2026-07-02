FROM python:3.11-slim

WORKDIR /app

# 阿里云 apt 镜像（测速最快: 0.07s）
RUN if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
      sed -i 's|http://deb.debian.org|https://mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources; \
    elif [ -f /etc/apt/sources.list ]; then \
      sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list; \
    fi

# 安装系统工具
RUN apt-get update && apt-get install -y curl gnupg xz-utils && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# 安装 Node.js 18（tesseract.js OCR 需要，npmmirror 镜像）
RUN curl -fsSL https://npmmirror.com/mirrors/node/v18.20.8/node-v18.20.8-linux-x64.tar.xz -o node.tar.xz && \
    tar -xf node.tar.xz --strip-components=1 -C /usr/local/ && \
    rm node.tar.xz

# 配置 npm 使用 npmmirror
RUN npm config set registry https://registry.npmmirror.com

# 安装 Python 依赖（华为云 PyPI 镜像，测速最快: 0.11s）
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt -i https://repo.huaweicloud.com/repository/pypi/simple/

# 安装 npm 依赖（tesseract.js）
COPY package.json package-lock.json ./
RUN npm install

# 复制项目代码
COPY app.py config.py database.py models.py exceptions.py logging_config.py ./
COPY routes/ routes/
COPY services/ services/
COPY static/ static/
COPY templates/ templates/
COPY repositories/ repositories/
COPY parsers/ parsers/
COPY alembic/ alembic/
COPY alembic.ini ./
COPY *.traineddata ./

# 确保目录存在
RUN mkdir -p uploads/exports data

EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "120", "app:app"]
