"""仪表盘路由"""
from datetime import datetime
from flask import Blueprint, jsonify
from database import db
from repositories.report_repository import (
    get_monthly_stats,
    get_yearly_warehouse_summary,
)

bp = Blueprint("dashboard", __name__, url_prefix="/api/v1")


@bp.route("/dashboard/stats", methods=["GET"])
def dashboard_stats():
    """仪表盘统计数据"""
    now = datetime.now()
    stats = get_monthly_stats(db.session, now.year, now.month)
    wh_inv = get_yearly_warehouse_summary(db.session, now.year)

    return jsonify({
        "monthly_recv_amt": stats["recv_amt"],
        "monthly_recv_cnt": stats["recv_cnt"],
        "monthly_use_amt": stats["use_amt"],
        "monthly_use_cnt": stats["use_cnt"],
        "monthly_inv_cnt": stats["inv_cnt"],
        "supplier_cnt": stats["supplier_cnt"],
        "warehouse_summary": [{
            "code": r.warehouse_code,
            "name": r.wh_name or r.warehouse_code,
            "total_in_qty": round(float(r.total_in_qty), 3),
            "total_in_amt": round(float(r.total_in_amt), 2),
        } for r in wh_inv],
    })
