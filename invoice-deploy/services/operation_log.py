"""操作日志辅助函数"""
from models import OperationLog
from database import db


def log_operation(action, target_type, target_id=None, detail=""):
    """记录操作日志（只添加到 session，由调用方统一 commit）"""
    from flask import session
    log = OperationLog(
        user_id=session.get("user_id"),
        username=session.get("username", ""),
        action=action,
        target_type=target_type,
        target_id=target_id,
        detail=detail,
    )
    db.session.add(log)
