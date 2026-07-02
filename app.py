"""Flask 应用入口"""
import os
import sys
import time

# 确保项目根目录在路径中
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, render_template, send_from_directory, session, redirect, url_for, request
from config import BASE_DIR, UPLOAD_FOLDER
from models import User
from database import init_db, db
from logging_config import setup_logging
from exceptions import BusinessError, AuthError, ForbiddenError, NotFoundError, ConflictError

app = Flask(__name__)
setup_logging(app)
app.config.from_pyfile("config.py")
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["SESSION_PERMANENT"] = False
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

# 注册蓝图
from routes.invoice import bp as invoice_bp
from routes.receiving import bp as receiving_bp
from routes.use_note import bp as use_note_bp
from routes.config_api import bp as config_bp
from routes.inventory import bp as inventory_bp
from routes.auth import bp as auth_bp
from routes.dashboard import bp as dashboard_bp

app.register_blueprint(invoice_bp)
app.register_blueprint(receiving_bp)
app.register_blueprint(use_note_bp)
app.register_blueprint(config_bp)
app.register_blueprint(inventory_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(dashboard_bp)


# 免登录白名单
_WHITELIST_PATHS = {"/api/v1/auth/login", "/api/v1/auth/whoami", "/login", "/static", "/api/v1/auth/logout"}


@app.before_request
def check_auth():
    """除白名单路径外，未登录用户跳转到登录页；验证用户未被禁用或删除"""
    path = request.path
    if any(path.startswith(w) for w in _WHITELIST_PATHS):
        return
    if "user_id" in session:
        user = User.query.get(session["user_id"])
        if not user or not user.enabled:
            session.clear()
            if path.startswith("/api/v1/"):
                return {"error": "登录已失效"}, 401
            return redirect(url_for("login_page"))
        # 单点登录校验：session token 必须与数据库一致
        if user.session_token and session.get("session_token") != user.session_token:
            session.clear()
            if path.startswith("/api/v1/"):
                return {"error": "账号已在其他地方登录，请重新登录"}, 401
            return redirect(url_for("login_page"))
    else:
        if path.startswith("/api/v1/"):
            return {"error": "未登录"}, 401
        if path == "/":
            return redirect(url_for("login_page"))


@app.route("/login")
def login_page():
    """登录页"""
    return render_template("login.html")


@app.route("/")
def index():
    """单页应用入口"""
    return render_template("index.html")


# ===== 全局错误处理 =====
@app.errorhandler(400)
def handle_400(e):
    return {"error": str(e) or "请求参数错误"}, 400

@app.errorhandler(404)
def handle_404(e):
    if request.accept_mimetypes.best and "json" in request.accept_mimetypes.best:
        return {"error": "资源不存在"}, 404
    return render_template("login.html") if request.path == "/login" else ("404 Not Found", 404)

@app.errorhandler(405)
def handle_405(e):
    return {"error": "请求方法不允许"}, 405

@app.errorhandler(BusinessError)
def handle_business_error(e):
    """业务逻辑错误 400"""
    return {"error": e.message, "code": e.code}, 400

@app.errorhandler(AuthError)
def handle_auth_error(e):
    """认证错误 401"""
    return {"error": e.message, "code": e.code}, 401

@app.errorhandler(ForbiddenError)
def handle_forbidden_error(e):
    """权限错误 403"""
    return {"error": e.message, "code": e.code}, 403

@app.errorhandler(NotFoundError)
def handle_not_found_error(e):
    """资源不存在 404 — 兼容 JSON 和页面请求"""
    if request.accept_mimetypes.best and "json" in request.accept_mimetypes.best:
        return {"error": e.message, "code": e.code}, 404
    return render_template("login.html") if request.path == "/login" else ("404 Not Found", 404)

@app.errorhandler(ConflictError)
def handle_conflict_error(e):
    """并发冲突 409"""
    return {"error": e.message, "code": e.code}, 409

@app.errorhandler(Exception)
def handle_exception(e):
    """兜底异常处理，生产环境不泄漏敏感信息"""
    app.logger.error(f"未处理的异常: {e}", exc_info=True)
    # AJAX 请求返回 JSON，页面请求返回简单文本
    if request.path.startswith("/api/v1/"):
        return {"error": "服务器内部错误，请查看日志"}, 500
    return "服务器内部错误", 500


@app.route("/uploads/<path:filename>")
def uploaded_file(filename):
    """提供导出的 Excel 下载（需登录）"""
    if "user_id" not in session:
        return {"error": "未登录"}, 401
    if ".." in filename or filename.startswith("/"):
        return {"error": "非法文件名"}, 400
    return send_from_directory(os.path.join(UPLOAD_FOLDER, "exports"), filename)


# gunicorn 生产模式时也需初始化（__main__ 只在 flask dev server 时执行）
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# PostgreSQL 首次启动较慢，重试直到连接成功
for attempt in range(30):
    try:
        init_db(app)
        print(f"[OK] 数据库初始化成功")
        break
    except Exception as e:
        if attempt == 0:
            print(f"[等待] 数据库未就绪，每 2 秒重试... ({e})")
        time.sleep(2)
else:
    print("[错误] 数据库连接超时，退出")
    sys.exit(1)

if __name__ == "__main__":
    print("=" * 50)
    print("  物资点收领用平台")
    print(f"  启动地址: http://localhost:5000")
    print("  Ctrl+C 停止服务")
    print("=" * 50)

    try:
        app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)
    except Exception as e:
        print(f"[错误] 启动失败: {e}", flush=True)
        sys.exit(1)
