"""点收单路由"""
import os
from datetime import datetime
from flask import Blueprint, request, jsonify, session, current_app
from sqlalchemy import text, or_
from models import Invoice, ReceivingNote, ReceivingItem, UseNote
from database import db
from services.counter import get_next_note_no
from services.excel_generator import generate_receiving_excel
from services.operation_log import log_operation
from services.inventory_mv import mark_inventory_stale
from repositories.receiving_repository import get_remaining_note_ids, get_used_items_for_note, get_warehouse_name, get_min_use_date

bp = Blueprint("receiving", __name__, url_prefix="/api/v1/receiving-notes")


def _can_modify(note):
    """检查当前用户是否有权限修改/删除该单据"""
    role = session.get("role")
    uid = session.get("user_id")
    if role == "admin":
        return True
    if note.created_by is not None and note.created_by > 0 and note.created_by != uid:
        return False
    return True


def _compute_used_item_ids(note_id):
    """计算点收单中已领用的明细条目ID、数量及金额映射

    返回 (used_ids, used_qty_map, used_amt_map)
    - used_ids: 已领用条目ID的set
    - used_qty_map: {item_id: 已领数量}
    - used_amt_map: {item_id: 已领金额}
    """
    from repositories.receiving_repository import get_used_items_for_note as _get_used

    note = ReceivingNote.query.get_or_404(note_id)
    used_rows = _get_used(db.session, note.id)

    used_ids = set()
    used_qty_map = {}
    used_amt_map = {}
    recv_items_sorted = sorted(note.items, key=lambda x: x.seq)
    ridx = 0
    for r in used_rows:
        key = None
        if r.receiving_item_id:
            key = r.receiving_item_id
        else:
            # 旧数据没有 receiving_item_id，按顺序位置匹配
            if ridx < len(recv_items_sorted):
                key = recv_items_sorted[ridx].id
                ridx += 1
        if key:
            used_ids.add(key)
            used_qty_map[key] = used_qty_map.get(key, 0) + float(r.quantity)
            used_amt_map[key] = used_amt_map.get(key, 0) + float(r.amount)
    return used_ids, used_qty_map, used_amt_map


@bp.route("", methods=["GET"])
def list_all():
    """获取所有点收单（支持搜索和分页）"""
    page = request.args.get("page", 1, type=int)
    limit = request.args.get("limit", 50, type=int)
    keyword = request.args.get("keyword", "").strip()
    remaining_only = request.args.get("remaining_only", "").strip()

    query = ReceivingNote.query
    if keyword:
        like = f"%{keyword}%"
        query = query.filter(
            or_(ReceivingNote.note_no.like(like),
                ReceivingNote.seller_name.like(like),
                ReceivingNote.buyer.like(like),
                ReceivingNote.invoice_no_list.like(like),
                ReceivingNote.project_no.like(like),
                ReceivingNote.project_name.like(like))
        )
    from services.warehouse_cache import get_warehouse_map
    wh_map = get_warehouse_map()

    # 查出哪些点收单还有未领完的明细（一次查询，后续筛选+标记均复用）
    has_remaining_ids = get_remaining_note_ids(db.session)

    # 使用 has_remaining_ids 做「未领完」筛选，不再重复执行 SQL
    if remaining_only == "true":
        remaining_ids = has_remaining_ids
        query = query.filter(ReceivingNote.id.in_(remaining_ids)) if remaining_ids else query.filter(ReceivingNote.id.in_([-1]))

    query = query.order_by(ReceivingNote.id.desc())

    total = query.count()
    notes = query.offset((page - 1) * limit).limit(limit).all()

    return jsonify({
        "items": [{
            "id": n.id,
            "note_no": n.note_no,
            "warehouse_code": n.warehouse_code,
            "warehouse_label": f"{n.warehouse_code}-{wh_map.get(n.warehouse_code, n.warehouse_code)}" if n.warehouse_code else "未分类",
            "date": n.date,
            "seller_name": n.seller_name,
            "project_no": n.project_no,
            "project_name": n.project_name,
            "buyer": n.buyer,
            "recipient": n.recipient,
            "accountant": n.accountant,
            "total_qty": float(n.total_qty) if n.total_qty else 0,
            "total_amount": float(n.total_amount) if n.total_amount else 0,
            "status": n.status,
            "all_used": n.id not in has_remaining_ids,
            "created_by": n.created_by or 0,
            "created_at": n.created_at,
        } for n in notes],
        "total": total,
        "page": page,
        "limit": limit,
    })


@bp.route("/<int:note_id>", methods=["GET"])
def get_one(note_id):
    """获取点收单详情"""
    note = ReceivingNote.query.get_or_404(note_id)

    # 关联发票信息
    invoice_info = None
    if note.invoice_id:
        inv = Invoice.query.get(note.invoice_id)
        if inv:
            invoice_info = {
                "id": inv.id,
                "invoice_no": inv.invoice_no,
                "seller_name": inv.seller_name,
                "issue_date": inv.issue_date,
                "total_amount": float(inv.total_amount) if inv.total_amount else 0,
                "has_file": bool(inv.raw_file_path and os.path.exists(inv.raw_file_path)),
            }

    # 计算每条点收明细的已领用量和已领金额
    _, used_qty_map, used_amt_map = _compute_used_item_ids(note_id)

    # 检查是否已生成领用单
    use_note_count = UseNote.query.filter_by(receiving_note_id=note.id).count()

    # 获取仓库名称
    wh_name = get_warehouse_name(db.session, note.warehouse_code)
    wh_label = f"{note.warehouse_code}-{wh_name}" if wh_name and note.warehouse_code else (note.warehouse_code or "未分类")

    return jsonify({
        "id": note.id,
        "note_no": note.note_no,
        "invoice_id": note.invoice_id,
        "warehouse_code": note.warehouse_code,
        "warehouse_label": wh_label,
        "date": note.date,
        "project_no": note.project_no,
        "project_name": note.project_name,
        "seller_name": note.seller_name,
        "invoice_no_list": note.invoice_no_list,
        "accountant": note.accountant,
        "buyer": note.buyer,
        "recipient": note.recipient or "",
        "total_qty": float(note.total_qty) if note.total_qty else 0,
        "total_amount": float(note.total_amount) if note.total_amount else 0,
        "status": note.status,
        "has_use_note": use_note_count > 0,
        "use_note_count": use_note_count,
        "version": note.version or 0,
        "created_by": note.created_by or 0,
        "created_at": note.created_at,
        "invoice": invoice_info,
        "items": [{
            "id": it.id,
            "seq": it.seq,
            "material_name": it.material_name,
            "spec": it.spec,
            "unit": it.unit,
            "quantity": float(it.quantity) if it.quantity else 0,
            "unit_price": float(it.unit_price) if it.unit_price else 0,
            "amount": float(it.amount) if it.amount else 0,
            "used_qty": float(used_qty_map.get(it.id, 0)),
            "remaining_qty": float(it.quantity) - float(used_qty_map.get(it.id, 0)),
            "used_amount": float(used_amt_map.get(it.id, 0)),
            "remaining_amount": float(it.amount) - float(used_amt_map.get(it.id, 0)),
        } for it in note.items],
    })


@bp.route("", methods=["POST"])
def create():
    """创建点收单（从发票数据生成，支持前端编辑覆盖）"""
    body = request.get_json()
    invoice_id = body.get("invoice_id")

    if not invoice_id:
        return jsonify({"error": "缺少 invoice_id"}), 400

    invoice = Invoice.query.get(invoice_id)
    if not invoice:
        return jsonify({"error": "发票不存在"}), 404

    # 使用前端编辑过的数据（如果有），否则回退到数据库原始值
    override = body.get("override", {})
    invoice_no = override.get("invoice_no") or invoice.invoice_no

    # 按发票号检查是否已点收过（同一发票号不可重复点收）
    if invoice_no:
        existing = db.session.query(ReceivingNote).join(Invoice, ReceivingNote.invoice_id == Invoice.id).filter(
            Invoice.invoice_no == invoice_no
        ).first()
        if not existing:
            # 旧数据可能没有 invoice_id，检查 invoice_no_list 字段
            existing = ReceivingNote.query.filter(
                ReceivingNote.invoice_no_list.like(f"{invoice_no} %")
            ).first()
        if existing:
            return jsonify({"error": f"发票号 {invoice_no} 已生成点收单（{existing.note_no}），不能重复点收"}), 409

    seller_name = override.get("seller_name") or invoice.seller_name
    is_special = override.get("is_special_tax") if "is_special_tax" in override else invoice.is_special_tax
    warehouse_code = (override.get("warehouse_code") or invoice.warehouse_code or "00").split("-")[0]

    # 明细：优先使用前端编辑的，否则用数据库的
    override_items = override.get("items", [])
    items_source = override_items if override_items else [
        {"clean_name": it.clean_name, "spec": it.spec, "unit": it.unit,
         "quantity": it.quantity, "unit_price": it.unit_price, "amount": it.amount}
        for it in invoice.items
    ]

    total_qty = sum(it.get("quantity", 0) for it in items_source)
    total_amt = sum(it.get("amount", 0) for it in items_source)

    # 解析仓库标签
    wh_name = get_warehouse_name(db.session, warehouse_code)
    wh_label = f"{warehouse_code}-{wh_name}" if wh_name else warehouse_code

    # 生成编号（使用单据日期，支持补录历史月份）
    note_date = body.get("date", datetime.now().strftime("%Y-%m-%d"))
    # 点收日期不能早于发票日期
    if invoice.issue_date and note_date < invoice.issue_date:
        return jsonify({"error": f"点收日期 {note_date} 不能早于发票日期 {invoice.issue_date}"}), 400
    note_no = get_next_note_no("D", date=datetime.strptime(note_date, "%Y-%m-%d"))

    note = ReceivingNote(
        note_no=note_no,
        invoice_id=invoice.id,
        warehouse_code=warehouse_code,
        date=note_date,
        project_no=body.get("project_no", ""),
        project_name=body.get("project_name", ""),
        seller_name=seller_name,
        invoice_no_list=f"{invoice_no}              共1张",
        accountant=body.get("accountant", "朱琳"),
        buyer=body.get("buyer", ""),
        recipient=body.get("recipient", ""),
        total_qty=total_qty,
        total_amount=total_amt,
        status="active",
        created_by=session.get("user_id", 0),
    )
    db.session.add(note)
    db.session.flush()

    for i, item in enumerate(items_source, 1):
        qty = float(item.get("quantity", 0))
        amt = float(item.get("amount", 0))
        ri = ReceivingItem(
            note_id=note.id,
            seq=i,
            material_name=item.get("clean_name", item.get("material_name", "")),
            spec=item.get("spec", ""),
            unit=item.get("unit", ""),
            quantity=qty,
            unit_price=amt / qty if qty else 0,
            amount=amt,
        )
        db.session.add(ri)

    invoice.status = "confirmed"
    db.session.commit()
    mark_inventory_stale()

    log_operation("create", "receiving_note", note.id, f"点收单 {note_no} - {seller_name}，金额 ¥{total_amt:.2f}")

    # 同步供应商到供应商管理
    from models import Supplier
    seller_tax_no = override.get("seller_tax_no") or invoice.seller_tax_no or ""
    if seller_name and not Supplier.query.filter_by(name=seller_name).first():
        db.session.add(Supplier(name=seller_name, credit_code=seller_tax_no))
        db.session.commit()

    return jsonify({
        "id": note.id,
        "note_no": note_no,
        "warehouse": wh_label,
        "message": "点收单创建成功",
    })


@bp.route("/<int:note_id>/export", methods=["GET"])
def export(note_id):
    """导出点收单 Excel"""
    note = ReceivingNote.query.get_or_404(note_id)

    from services.warehouse_matcher import get_warehouse_list
    wh_list = get_warehouse_list()
    wh_label = note.warehouse_code or "00"
    for wh in wh_list:
        if wh["code"] == note.warehouse_code:
            wh_label = wh["label"]
            break

    note_data = {
        "note_no": note.note_no,
        "warehouse_label": wh_label,
        "date": note.date,
        "project_no": note.project_no,
        "project_name": note.project_name,
        "seller_name": note.seller_name,
        "invoice_no_list": note.invoice_no_list,
        "accountant": note.accountant,
        "buyer": note.buyer,
        "recipient": note.recipient or "",
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
    output_path = os.path.join(export_dir, f"材料点收单_{note.note_no}.xlsx")

    try:
        generate_receiving_excel(note_data, items_data, output_path)
        log_operation("export", "receiving_note", note_id, f"导出点收单 {note.note_no}")
        db.session.commit()
        return jsonify({"path": output_path, "filename": f"材料点收单_{note.note_no}.xlsx"})
    except Exception as e:
        return jsonify({"error": f"导出失败: {str(e)}"}), 500


@bp.route("/batch-export", methods=["POST"])
def batch_export():
    """批量导出点收单 Excel（合并到一个文件）"""
    from services.excel_generator import generate_batch_workbook

    data = request.get_json()
    ids = data.get("ids", [])
    if not ids:
        return jsonify({"error": "请选择要导出的点收单"}), 400

    notes = ReceivingNote.query.filter(ReceivingNote.id.in_(ids)).order_by(ReceivingNote.id).all()

    def note_info(note):
        note_data = {
            "note_no": note.note_no,
            "info_line": f"日期: {note.date}    供应商: {note.seller_name}",
        }
        items_data = [{
            "material_name": it.material_name,
            "spec": it.spec, "unit": it.unit,
            "quantity": it.quantity, "unit_price": it.unit_price, "amount": it.amount,
        } for it in note.items]
        return note_data, items_data

    export_dir = os.path.join(current_app.config.get("UPLOAD_FOLDER", "uploads"), "exports")
    os.makedirs(export_dir, exist_ok=True)
    filename = f"批量点收单_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    output_path = os.path.join(export_dir, filename)

    generate_batch_workbook("材料点收单", notes, note_info, output_path)
    log_operation("export", "receiving_note", 0, f"批量导出 {len(ids)} 张点收单")
    db.session.commit()
    return jsonify({"path": output_path, "filename": filename})


@bp.route("/<int:note_id>", methods=["DELETE"])
def delete(note_id):
    """删除点收单（如有关联领用单则拒绝，同时删除关联发票）"""
    note = ReceivingNote.query.get_or_404(note_id)
    if not _can_modify(note):
        return jsonify({"error": "无权删除他人创建的点收单"}), 403
    # 月份锁定：非管理员不能删除上月及以前的单据
    if session.get("role") != "admin" and note.date:
        now = datetime.now()
        month_start = f"{now.year}-{now.month:02d}-01"
        if note.date < month_start:
            return jsonify({"error": f"{note.date[:7]} 月的单据已锁定，不能删除"}), 403
    if UseNote.query.filter_by(receiving_note_id=note.id).first():
        return jsonify({"error": "该点收单已生成领用单，请先删除领用单"}), 400

    # 联动删除关联发票
    if note.invoice_id:
        invoice = Invoice.query.get(note.invoice_id)
        if invoice:
            # 删除物理文件
            if invoice.raw_file_path and os.path.exists(invoice.raw_file_path):
                try:
                    os.remove(invoice.raw_file_path)
                except OSError:
                    pass
            db.session.delete(invoice)

    db.session.delete(note)
    db.session.commit()
    mark_inventory_stale()
    log_operation("delete", "receiving_note", note_id, f"删除点收单 #{note_id}")
    return jsonify({"message": "点收单及关联发票已删除"})


@bp.route("/<int:note_id>", methods=["PUT"])
def update(note_id):
    """更新点收单（已领用的条目不可修改/删除，未领用的可编辑）"""
    note = ReceivingNote.query.get_or_404(note_id)
    if not _can_modify(note):
        return jsonify({"error": "无权修改他人创建的点收单"}), 403
    # 历史无主数据自动认领
    if not note.created_by or note.created_by == 0:
        note.created_by = session.get("user_id", 0)
    # 月份锁定：非管理员不能操作上月及以前的单据
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

    # 查出哪些点收明细已被领用（兼容旧数据）
    used_ids, _, _ = _compute_used_item_ids(note_id)

    note.warehouse_code = (data.get("warehouse_code") or note.warehouse_code).split("-")[0]
    new_date = data.get("date", note.date)

    # 日期校验：点收日期 >= 发票日期
    if new_date != note.date and note.invoice_id:
        invoice = Invoice.query.get(note.invoice_id)
        if invoice and invoice.issue_date:
            if new_date < invoice.issue_date:
                return jsonify({"error": f"点收日期 {new_date} 不能早于发票日期 {invoice.issue_date}"}), 400

    # 日期校验：点收日期 <= 关联领用单的日期
    if new_date != note.date:
        min_use_date = get_min_use_date(db.session, note.id)
        if min_use_date and new_date > min_use_date:
            return jsonify({"error": f"点收日期 {new_date} 不能晚于关联领用单日期 {min_use_date}"}), 400

    note.date = new_date
    note.project_no = data.get("project_no", note.project_no)
    note.project_name = data.get("project_name", note.project_name)
    note.client = data.get("client", note.client)
    note.accountant = data.get("accountant", note.accountant)
    note.buyer = data.get("buyer", note.buyer)
    note.recipient = data.get("recipient", note.recipient)

    # 更新明细
    items_data = data.get("items")
    if items_data is not None:
        incoming_ids = {item.get("id") for item in items_data if item.get("id")}

        # 检查是否有已领用的条目被删除
        for existing_item in note.items:
            if existing_item.id in used_ids and existing_item.id not in incoming_ids:
                return jsonify({"error": f"条目「{existing_item.material_name}」已领用，不能删除"}), 400

        # 删除旧明细（未领用的）
        for existing_item in list(note.items):
            if existing_item.id not in used_ids:
                db.session.delete(existing_item)

        # 重新计算汇总（已领用条目保持原记录不动，仅更新序号）
        total_qty = 0
        total_amt = 0
        for i, item in enumerate(items_data, 1):
            item_id = item.get("id")
            if item_id and item_id in used_ids:
                # 已领用条目：保留原记录，仅更新 seq
                existing = ReceivingItem.query.get(item_id)
                if existing:
                    existing.seq = i
                    total_qty += existing.quantity
                    total_amt += existing.amount
            else:
                qty = float(item.get("quantity", 0))
                amt = float(item.get("amount", 0))
                total_qty += qty
                total_amt += amt
                ri = ReceivingItem(
                    note_id=note.id, seq=i,
                    material_name=item.get("material_name", ""),
                    spec=item.get("spec", ""),
                    unit=item.get("unit", ""),
                    quantity=qty, unit_price=amt / qty if qty else 0,
                    amount=amt,
                )
                db.session.add(ri)
        note.total_qty = total_qty
        note.total_amount = total_amt

    # 乐观锁：原子更新 version，避免并发覆盖
    result = db.session.execute(
        text("UPDATE receiving_notes SET version = version + 1 WHERE id = :id AND version = :v"),
        {"id": note.id, "v": req_version if req_version is not None else -1}
    )
    if result.rowcount == 0:
        db.session.rollback()
        return jsonify({"error": "数据已被其他人修改，请刷新后重试"}), 409
    note.version = (note.version or 0) + 1
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"更新点收单 {note_id} 失败: {e}")
        return jsonify({"error": "保存失败，该条目已被领用无法修改"}), 400
    mark_inventory_stale()
    log_operation("update", "receiving_note", note.id, f"更新点收单 {note.note_no}")
    return jsonify({"message": "更新成功"})
