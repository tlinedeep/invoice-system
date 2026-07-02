"""库存台账路由 — 优先从物化表读取，过期则自动重建"""
from flask import Blueprint, jsonify, request
from database import db
from models import MaterialInventory, SystemConfig
from datetime import datetime
import os

from repositories.inventory_repository import query_materialized as _query_materialized, get_warehouse_name_map

bp = Blueprint("inventory", __name__, url_prefix="/api/v1/inventory")


def _ensure_materialized():
    """确保物化表数据是最新的，过期则自动重建"""
    cfg = SystemConfig.query.filter_by(key="inventory_stale").first()
    is_stale = cfg and cfg.value == "1"
    count = MaterialInventory.query.count()

    if is_stale or count == 0:
        from services.inventory_mv import rebuild_inventory
        rebuild_inventory()
        return True
    return False


@bp.route("", methods=["GET"])
def get_inventory():
    """计算各材料的实时库存 — 使用物化表加速"""
    _ensure_materialized()

    keyword = request.args.get("keyword", "").strip()
    warehouse_code = request.args.get("warehouse_code", "").strip()
    page = request.args.get("page", 1, type=int)
    limit = request.args.get("limit", 9999, type=int)

    # 从物化表查询（repository 内部处理仓库筛选、关键词过滤和分页）
    rows, total = _query_materialized(
        db.session, keyword=keyword, warehouse_codes=warehouse_code,
        page=page, limit=limit
    )

    # 仓库名称映射
    wh_name_map = get_warehouse_name_map(db.session)

    result = []
    for r in rows:
        result.append({
            "material_name": r.material_name,
            "spec": r.spec or "",
            "unit": r.unit,
            "warehouse_code": r.warehouse_code or "",
            "warehouse_name": wh_name_map.get(r.warehouse_code or "", r.warehouse_code or ""),
            "in_qty": float(r.in_qty) if r.in_qty else 0,
            "in_amt": float(r.in_amt) if r.in_amt else 0,
            "out_qty": float(r.out_qty) if r.out_qty else 0,
            "out_amt": float(r.out_amt) if r.out_amt else 0,
            "balance_qty": float(r.balance_qty) if r.balance_qty else 0,
            "balance_amt": float(r.balance_amt) if r.balance_amt else 0,
        })

    return jsonify({
        "items": result,
        "total": total,
        "page": page,
        "limit": limit,
    })


@bp.route("/export", methods=["GET"])
def export_inventory():
    """导出库存台账到 Excel"""
    from flask import current_app
    from services.excel_generator import new_report_wb

    _ensure_materialized()

    keyword = request.args.get("keyword", "").strip()
    warehouse_code = request.args.get("warehouse_code", "").strip()

    # 从物化表查询（导出不需要分页，取全部）
    rows, _ = _query_materialized(
        db.session, keyword=keyword, warehouse_codes=warehouse_code,
        page=1, limit=999999
    )

    wh_name_map = get_warehouse_name_map(db.session)

    result = []
    for r in rows:
        result.append({
            "material_name": r.material_name,
            "spec": r.spec or "",
            "unit": r.unit,
            "warehouse_code": r.warehouse_code or "",
            "warehouse_name": wh_name_map.get(r.warehouse_code or "", r.warehouse_code or ""),
            "in_qty": float(r.in_qty) if r.in_qty else 0,
            "in_amt": float(r.in_amt) if r.in_amt else 0,
            "out_qty": float(r.out_qty) if r.out_qty else 0,
            "out_amt": float(r.out_amt) if r.out_amt else 0,
            "balance_qty": float(r.balance_qty) if r.balance_qty else 0,
            "balance_amt": float(r.balance_amt) if r.balance_amt else 0,
        })

    wb, ws, s = new_report_wb(
        "物资库存台账",
        ["材料名称", "规格型号", "单位", "仓库", "入库数量", "入库金额", "出库数量", "出库金额", "库存余量", "库存金额"],
        [(1, 20), (2, 14), (3, 8), (4, 12), (5, 14), (6, 16), (7, 14), (8, 16), (9, 14), (10, 16)]
    )
    ws.title = "库存台账"

    total_in_qty = total_in_amt = total_out_qty = total_out_amt = total_bal_qty = total_bal_amt = 0

    for i, item in enumerate(result, 3):
        ws.cell(row=i, column=1, value=item["material_name"]).font = s["normal_font"]
        ws.cell(row=i, column=2, value=item["spec"]).font = s["normal_font"]
        ws.cell(row=i, column=3, value=item["unit"]).font = s["normal_font"]
        ws.cell(row=i, column=4, value=item["warehouse_code"] + item["warehouse_name"]).font = s["normal_font"]
        ws.cell(row=i, column=5, value=item["in_qty"]).font = s["normal_font"]
        c6 = ws.cell(row=i, column=6, value=item["in_amt"]); c6.font = s["normal_font"]; c6.number_format = '#,##0.00'
        ws.cell(row=i, column=7, value=item["out_qty"]).font = s["normal_font"]
        c8 = ws.cell(row=i, column=8, value=item["out_amt"]); c8.font = s["normal_font"]; c8.number_format = '#,##0.00'
        ws.cell(row=i, column=9, value=item["balance_qty"]).font = s["normal_font"]
        c10 = ws.cell(row=i, column=10, value=item["balance_amt"]); c10.font = s["normal_font"]; c10.number_format = '#,##0.00'

        for col in range(1, 11):
            ws.cell(row=i, column=col).border = s["thin_border"]
            if col in (3, 4):
                ws.cell(row=i, column=col).alignment = s["center_align"]

        total_in_qty += item["in_qty"]
        total_in_amt += item["in_amt"]
        total_out_qty += item["out_qty"]
        total_out_amt += item["out_amt"]
        total_bal_qty += item["balance_qty"]
        total_bal_amt += item["balance_amt"]

    # 合计行
    row = len(result) + 3
    ws.cell(row=row, column=1, value="合计").font = s["bold_font"]
    ws.cell(row=row, column=5, value=total_in_qty).font = s["bold_font"]
    c6 = ws.cell(row=row, column=6, value=total_in_amt); c6.font = s["bold_font"]; c6.number_format = '#,##0.00'
    ws.cell(row=row, column=7, value=total_out_qty).font = s["bold_font"]
    c8 = ws.cell(row=row, column=8, value=total_out_amt); c8.font = s["bold_font"]; c8.number_format = '#,##0.00'
    ws.cell(row=row, column=9, value=total_bal_qty).font = s["bold_font"]
    c10 = ws.cell(row=row, column=10, value=total_bal_amt); c10.font = s["bold_font"]; c10.number_format = '#,##0.00'

    export_dir = os.path.join(current_app.config.get("UPLOAD_FOLDER", "uploads"), "exports")
    os.makedirs(export_dir, exist_ok=True)
    fname = f"inventory_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    output_path = os.path.join(export_dir, fname)
    wb.save(output_path)

    from flask import send_file
    return send_file(output_path, as_attachment=True, download_name=fname)


@bp.route("/rebuild", methods=["POST"])
def rebuild():
    """手动重建库存物化表（仅 admin）"""
    from flask import session
    if session.get("role") != "admin":
        return jsonify({"error": "仅管理员可执行此操作"}), 403
    from services.inventory_mv import rebuild_inventory
    rebuild_inventory()
    return jsonify({"message": "库存物化表重建完成"})
