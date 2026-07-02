"""认证路由（登录/登出）"""
import secrets
from flask import Blueprint, request, jsonify, session
from models import User
from database import db
from werkzeug.security import generate_password_hash, check_password_hash
from services.operation_log import log_operation

bp = Blueprint("auth", __name__, url_prefix="/api/v1/auth")


def hash_pw(password: str) -> str:
    return generate_password_hash(password)



# 登录频率限制（内存计数，重启重置）
_login_attempts = {}

def _check_login_limit(ip):
    now = __import__("time").time()
    attempts = _login_attempts.get(ip, [])
    # 清理5分钟前的记录
    attempts = [t for t in attempts if now - t < 300]
    if len(attempts) >= 10:
        return False
    attempts.append(now)
    _login_attempts[ip] = attempts
    return True


@bp.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()

    if not username or not password:
        return jsonify({"error": "请输入用户名和密码"}), 400

    # 登录频率限制
    ip = request.remote_addr or "unknown"
    if not _check_login_limit(ip):
        return jsonify({"error": "登录尝试过于频繁，请5分钟后再试"}), 429

    user = User.query.filter_by(username=username, enabled=True).first()
    if not user:
        return jsonify({"error": "用户名或密码错误"}), 401

    # 优先用 werkzeug 校验，兼容旧版 SHA256
    is_legacy_hash = False
    if not check_password_hash(user.password, password):
        import hashlib
        if user.password != hashlib.sha256(password.encode()).hexdigest():
            return jsonify({"error": "用户名或密码错误"}), 401
        # 旧哈希校验通过，升级为新哈希
        user.password = hash_pw(password)
        db.session.commit()
        is_legacy_hash = True
    else:
        # 检测是否为旧版 SHA256 格式（纯64位十六进制）
        import re
        is_legacy_hash = bool(re.match(r'^[0-9a-f]{64}$', user.password))

    # 生成单点登录 token，旧的登录自动失效
    token = secrets.token_hex(32)
    user.session_token = token
    db.session.commit()

    session["user_id"] = user.id
    session["username"] = user.username
    session["display_name"] = user.display_name or user.username
    session["role"] = user.role
    session["session_token"] = token

    return jsonify({
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name or user.username,
        "role": user.role,
        "force_change_password": is_legacy_hash,
    })


@bp.route("/logout", methods=["POST"])
def logout():
    if "user_id" in session:
        user = User.query.get(session["user_id"])
        if user:
            user.session_token = ""
            db.session.commit()
    session.clear()
    return jsonify({"message": "已登出"})


@bp.route("/whoami", methods=["GET"])
def whoami():
    if "user_id" not in session:
        return jsonify({"user": None}), 401
    # 单点登录校验
    user = User.query.get(session["user_id"])
    if user and user.session_token and session.get("session_token") != user.session_token:
        session.clear()
        return jsonify({"user": None, "error": "账号已在其他地方登录"}), 401
    return jsonify({
        "user": {
            "id": session["user_id"],
            "username": session.get("username", ""),
            "display_name": session.get("display_name", ""),
            "role": session.get("role", "user"),
        }
    })


# ===== 用户管理 (仅 admin) =====

def _require_admin():
    if session.get("role") != "admin":
        return jsonify({"error": "仅管理员可执行此操作"}), 403


@bp.route("/users", methods=["GET"])
def list_users():
    resp = _require_admin()
    if resp:
        return resp
    users = User.query.order_by(User.role, User.username).all()
    return jsonify([{
        "id": u.id,
        "username": u.username,
        "display_name": u.display_name,
        "role": u.role,
        "enabled": u.enabled,
    } for u in users])


@bp.route("/users", methods=["POST"])
def create_user():
    resp = _require_admin()
    if resp:
        return resp
    data = request.get_json()
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    display_name = data.get("display_name", "").strip() or username
    role = data.get("role", "user")

    if not username or not password:
        return jsonify({"error": "用户名和密码不能为空"}), 400
    if len(password) < 8:
        return jsonify({"error": "密码长度不能少于8位"}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "用户名已存在"}), 400

    user = User(
        username=username,
        password=hash_pw(password),
        display_name=display_name,
        role=role,
        enabled=True,
    )
    db.session.add(user)
    log_operation("create", "user", user.id, f"创建用户 {user.username}")
    db.session.commit()
    return jsonify({"id": user.id, "message": "用户创建成功"})


@bp.route("/users/<int:uid>", methods=["PUT"])
def update_user(uid):
    resp = _require_admin()
    if resp:
        return resp
    user = User.query.get_or_404(uid)
    data = request.get_json()

    if "username" in data:
        new_username = data["username"].strip()
        if new_username != user.username and User.query.filter_by(username=new_username).first():
            return jsonify({"error": "用户名已存在"}), 400
        user.username = new_username
    if "display_name" in data:
        user.display_name = data["display_name"].strip() or user.username
    if "role" in data:
        user.role = data["role"]
    if "enabled" in data:
        if uid == session.get("user_id") and not data["enabled"]:
            return jsonify({"error": "不能停用自己的账号"}), 400
        user.enabled = data["enabled"]
    if "password" in data and data["password"].strip():
        if len(data["password"].strip()) < 8:
            return jsonify({"error": "密码长度不能少于8位"}), 400
        user.password = hash_pw(data["password"].strip())

    db.session.commit()
    return jsonify({"message": "用户已更新"})


@bp.route("/users/<int:uid>", methods=["DELETE"])
def delete_user(uid):
    resp = _require_admin()
    if resp:
        return resp
    user = User.query.get_or_404(uid)
    if user.id == session.get("user_id"):
        return jsonify({"error": "不能删除自己"}), 400
    # 检查该用户是否有操作日志
    from models import OperationLog
    log_count = OperationLog.query.filter_by(user_id=uid).count()
    if log_count > 0:
        return jsonify({"error": f"该用户已有 {log_count} 条操作记录，无法删除"}), 400
    log_operation("delete", "user", uid, f"删除用户 #{uid}")
    db.session.delete(user)
    db.session.commit()
    return jsonify({"message": "用户已删除"})
