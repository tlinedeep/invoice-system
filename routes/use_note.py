"""领用单路由"""
import os
from datetime import datetime
from flask import Blueprint, request, jsonify, session, current_app
from sqlalchemy import or_, text
from models import ReceivingNote, UseNote, UseItem
from database import db
from services.counter import get_next_note_no
from services.excel_generator import generate_use_excel
from services.operation_log import log_operation
from services.inventory_mv import mark_inventory_stale
from repositories.receiving_repository import get_warehouse_name

bp = Blueprint("use_note", __name__, url_prefix="/api/v1/use-notes")


def _can_modify(note):
    """检查当前用户是否有权限修改/删除该单据"""
    role = session.get("role")
    uid = session.get("user_id")
    if role == "admin":
        return True
    if note.created_by is not None and note.created_by > 0 and note.created_by != uid:
        return False
    return True


@bp.route("", methods=["GET"])
def list_all():
    """获取所有领用单（支持搜索和分页）"""
    page = request.args.get("page", 1, type=int)
    limit = request.args.get("limit", 50, type=int)
    keyword = request.args.get("keyword", "").strip()

    query = UseNote.query
    if keyword:
        like = f"%{keyword}%"
        query = query.outerjoin(ReceivingNote, UseNote.receiving_note_id == ReceivingNote.id).filter(
            or_(UseNote.note_no.like(like),
                UseNote.recipient.like(like),
                UseNote.project_no.like(like),
                UseNote.project_name.like(like),
                ReceivingNote.seller_name.like(like),
                ReceivingNote.invoice_no_list.like(like))
        )
    query = query.order_by(UseNote.id.desc())

    total = query.count()
    notes = query.offset((page - 1) * limit).limit(limit).all()

    from services.warehouse_cache import get_warehouse_map
    wh_map = get_warehouse_map()

    return jsonify({
        "items": [{
            "id": n.id,
            "note_no": n.note_no,
            "receiving_note_id": n.receiving_note_id,
            "warehouse_code": n.warehouse_code,
            "warehouse_label": f"{n.warehouse_code}-{wh_map.get(n.warehouse_code, n.warehouse_code)}" if n.warehouse_code else "未分类",
            "date": n.date,
            "recipient": n.recipient,
            "seller_name": n.receiving_note.seller_name if n.receiving_note else '',
            "project_no": n.project_no,
            "project_name": n.project_name,
            "accountant": n.accountant,
            "total_qty": float(n.total_qty) if n.total_qty else 0,
            "total_amount": float(n.total_amount) if n.total_amount else 0,
            "status": n.status,
            "created_by": n.created_by or 0,
            "created_at": n.created_at,
        } for n in notes],
        "total": total,
        "page": page,
        "limit": limit,
    })


@bp.route("/<int:note_id>", methods=["GET"])
def get_one(note_id):
    """获取领用单详情"""
    note = UseNote.query.get_or_404(note_id)
    # 获取仓库名称
    wh_name = get_warehouse_name(db.session, note.warehouse_code)
    wh_label = f"{note.warehouse_code}-{wh_name}" if wh_name and note.warehouse_code else (note.warehouse_code or "未分类")

    return jsonify({
        "id": note.id,
        "note_no": note.note_no,
        "receiving_note_id": note.receiving_note_id,
        "receiving_note_no": note.receiving_note.note_no if note.receiving_note else '',
        "warehouse_code": note.warehouse_code,
        "warehouse_label": wh_label,
        "date": note.date,
        "project_no": note.project_no,
        "project_name": note.project_name,
        "recipient": note.recipient,
        "accountant": note.accountant,
        "total_qty": float(note.total_qty) if note.total_qty else 0,
        "total_amount": float(note.total_amount) if note.total_amount else 0,
        "status": note.status,
        "version": note.version or 0,
        "created_by": note.created_by or 0,
        "created_at": note.created_at,
        "items": [{
            "id": it.id,
            "receiving_item_id": it.receiving_item_id,
            "material_name": it.material_name,
            "spec": it.spec,
            "unit": it.unit,
            "quantity": float(it.quantity) if it.quantity else 0,
            "unit_price": float(it.unit_price) if it.unit_price else 0,
            "amount": float(it.amount) if it.amount else 0,
        } for it in note.items],
    })


@bp.route("/from-receiving/<int:recv_id>", methods=["POST"])
def create_from_receiving(recv_id):
    """从点收单生成领用单（支持选取部分条目和数量，可多次出库）"""
    recv_note = ReceivingNote.query.get_or_404(recv_id)
    if recv_note.status != "active":
        return jsonify({"error": "该点收单已失效，无法生成领用单"}), 400
    data = request.get_json() or {}
    selected_items = data.get("items")  # [{receiving_item_id, quantity, unit_price, amount}]

    note_date = data.get("date", datetime.now().strftime("%Y-%m-%d"))
    # 领用日期不能早于点收日期
    if note_date < recv_note.date:
        return jsonify({"error": f"领用日期 {note_date} 不能早于点收日期 {recv_note.date}"}), 400
    note_no = get_next_note_no("L", date=datetime.strptime(note_date, "%Y-%m-%d"))

    note = UseNote(
        note_no=note_no,
        receiving_note_id=recv_note.id,
        warehouse_code=recv_note.warehouse_code,
        date=note_date,
        project_no=recv_note.project_no,
        project_name=recv_note.project_name,
        recipient=data.get("recipient", ""),
        accountant=data.get("accountant", recv_note.accountant),
        total_qty=0,
        total_amount=0,
        status="active",
        created_by=session.get("user_id", 0),
    )
    db.session.add(note)
    db.session.flush()

    if selected_items:
        # 用户选择了部分条目出库
        total_qty = 0
        total_amt = 0
        for i, sel in enumerate(selected_items, 1):
            qty = float(sel.get("quantity", 0))
            amt = float(sel.get("amount", 0))
            total_qty += qty
            total_amt += amt
            ui = UseItem(
                note_id=note.id, seq=i,
                material_name=sel.get("material_name", ""),
                spec=sel.get("spec", ""),
                unit=sel.get("unit", ""),
                quantity=qty, unit_price=amt / qty if qty else 0, amount=amt,
                receiving_item_id=sel.get("receiving_item_id"),
            )
            db.session.add(ui)
        note.total_qty = total_qty
        note.total_amount = total_amt
    else:
        # 未指定条目，全部出库（向后兼容）
        for i, item in enumerate(recv_note.items, 1):
            ui = UseItem(
                note_id=note.id, seq=i,
                material_name=item.material_name,
                spec=item.spec,
                unit=item.unit,
                quantity=item.quantity,
                unit_price=item.unit_price,
                amount=item.amount,
                receiving_item_id=item.id,
            )
            db.session.add(ui)
        note.total_qty = recv_note.total_qty
        note.total_amount = recv_note.total_amount

    db.session.commit()
    mark_inventory_stale()

    log_operation("create", "use_note", note.id, f"领用单 {note_no}（关联点收单 #{recv_id}）")

    return jsonify({
        "id": note.id,
        "note_no": note_no,
        "message": "领用单创建成功",
    })


@bp.route("/<int:note_id>/export", methods=["GET"])
def export(note_id):
    """导出领用单 Excel"""
    note = UseNote.query.get_or_404(note_id)

    from services.warehouse_matcher import get_warehouse_list
    wh_label = note.warehouse_code or "00"
    for wh in get_warehouse_list():
        if wh["code"] == note.warehouse_code:
            wh_label = wh["label"]
            break

    note_data = {
        "note_no": note.note_no,
        "warehouse_label": wh_label,
        "date": note.date,
        "project_no": note.project_no,
        "project_name": note.project_name,
        "accountant": note.accountant,
        "recipient": note.recipient,
    }
    items_data = [{
        "material_name": it.material_name,
        "spec": it.spec,
        "unit": it.unit,
        "quantity": it.quantity,
        "unit_price": it.unit_price,
        "amount": it.amount,
    } for it in note.items]

    export_dir = os.path.join(current_app.config.get("UPLOAD_FOLDER", "uploads"), "exports")
    os.makedirs(export_dir, exist_ok=True)
    output_path = os.path.join(export_dir, f"材料领用单_{note.note_no}.xlsx")

    try:
        generate_use_excel(note_data, items_data, output_path)
        log_operation("export", "use_note", note_id, f"导出领用单 {note.note_no}")
        db.session.commit()
        return jsonify({"path": output_path, "filename": f"材料领用单_{note.note_no}.xlsx"})
    except Exception as e:
        return jsonify({"error": f"导出失败: {str(e)}"}), 500


@bp.route("/batch-export", methods=["POST"])
def batch_export():
    """批量导出领用单 Excel（合并到一个文件）"""
    from services.excel_generator import generate_batch_workbook

    data = request.get_json()
    ids = data.get("ids", [])
    if not ids:
        return jsonify({"error": "请选择要导出的领用单"}), 400

    notes = UseNote.query.filter(UseNote.id.in_(ids)).order_by(UseNote.id).all()

    def note_info(note):
        note_data = {
            "note_no": note.note_no,
            "info_line": f"日期: {note.date}    领用人: {note.recipient or ''}",
        }
        items_data = [{
            "material_name": it.material_name,
            "spec": it.spec, "unit": it.unit,
            "quantity": it.quantity, "unit_price": it.unit_price, "amount": it.amount,
        } for it in note.items]
        return note_data, items_data

    export_dir = os.path.join(current_app.config.get("UPLOAD_FOLDER", "uploads"), "exports")
    os.makedirs(export_dir, exist_ok=True)
    filename = f"批量领用单_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    output_path = os.path.join(export_dir, filename)

    generate_batch_workbook("材料领用单", notes, note_info, output_path)
    log_operation("export", "use_note", 0, f"批量导出 {len(ids)} 张领用单")
    db.session.commit()
    return jsonify({"path": output_path, "filename": filename})

@bp.route("/<int:note_id>", methods=["DELETE"])
def delete(note_id):
    """删除领用单"""
    note = UseNote.query.get_or_404(note_id)
    if not _can_modify(note):
        return jsonify({"error": "无权删除他人创建的领用单"}), 403
    # 月份锁定：非管理员不能删除上月及以前的单据
    if session.get("role") != "admin" and note.date:
        now = datetime.now()
        month_start = f"{now.year}-{now.month:02d}-01"
        if note.date < month_start:
            return jsonify({"error": f"{note.date[:7]} 月的单据已锁定，不能删除"}), 403
    db.session.delete(note)
    db.session.commit()
    mark_inventory_stale()
    log_operation("delete", "use_note", note_id, f"删除领用单 #{note_id}")
    return jsonify({"message": "删除成功"})


@bp.route("/<int:note_id>", methods=["PUT"])
def update(note_id):
    """更新领用单"""
    note = UseNote.query.get_or_404(note_id)
    if not _can_modify(note):
        return jsonify({"error": "无权修改他人创建的领用单"}), 403
    # 历史无主数据自动认领
    if not note.created_by or note.created_by == 0:
        note.created_by = session.get("user_id", 0)
    # 月份锁定：非管理员不能修改上月及以前的单据
    if session.get("role") != "admin" and note.date:
        now = datetime.now()
        month_start = f"{now.year}-{now.month:02d}-01"
        if note.date < month_start:
            return jsonify({"error": f"{note.date[:7]} 月的单据已锁定，不能修改"}), 403
    data = request.get_json()

    # 乐观锁：检查 version
    req_version = data.get("version")
    if req_version is not None and note.version != req_version:
        return jsonify({"error": "数据已被其他人修改，请刷新后重试"}), 409

    note.recipient = data.get("recipient", note.recipient)
    new_date = data.get("date", note.date)

    # 日期校验：领用日期 >= 关联点收单日期
    if new_date != note.date and note.receiving_note:
        if new_date < note.receiving_note.date:
            return jsonify({"error": f"领用日期 {new_date} 不能早于点收日期 {note.receiving_note.date}"}), 400

    note.date = new_date
    note.accountant = data.get("accountant", note.accountant)

    items_data = data.get("items")
    if items_data is not None:
        UseItem.query.filter_by(note_id=note.id).delete()
        total_qty = 0
        total_amt = 0
        for i, item in enumerate(items_data, 1):
            qty = float(item.get("quantity", 0))
            amt = float(item.get("amount", 0))
            total_qty += qty
            total_amt += amt
            ui = UseItem(
                note_id=note.id, seq=i,
                material_name=item.get("material_name", ""),
                spec=item.get("spec", ""),
                unit=item.get("unit", ""),
                quantity=qty, unit_price=amt / qty if qty else 0,
                amount=amt,
                receiving_item_id=item.get("receiving_item_id"),
            )
            db.session.add(ui)
        note.total_qty = total_qty
        note.total_amount = total_amt

    # 乐观锁：原子更新 version
    result = db.session.execute(
        text("UPDATE use_notes SET version = version + 1 WHERE id = :id AND version = :v"),
        {"id": note.id, "v": req_version if req_version is not None else -1}
    )
    if result.rowcount == 0:
        db.session.rollback()
        return jsonify({"error": "数据已被其他人修改，请刷新后重试"}), 409
    note.version = (note.version or 0) + 1
    db.session.commit()
    mark_inventory_stale()
    log_operation("update", "use_note", note.id, f"更新领用单 {note.note_no}")
    return jsonify({"message": "更新成功"})
