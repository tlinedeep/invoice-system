"""发票解析路由"""
import os
import uuid
from flask import Blueprint, request, jsonify, current_app
from sqlalchemy import or_
from models import Invoice, InvoiceItem
from database import db
from services.invoice_parser import parse_invoice
from services.operation_log import log_operation

bp = Blueprint("invoice", __name__, url_prefix="/api/v1/invoice")


@bp.route("/parse", methods=["POST"])
def parse():
    """上传并解析发票"""
    if "file" not in request.files:
        return jsonify({"error": "请选择文件"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "文件名为空"}), 400

    # 保存上传文件（使用UUID避免中文文件名问题）
    upload_dir = current_app.config.get("UPLOAD_FOLDER", "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin"
    allowed_ext = {"pdf", "jpg", "jpeg", "png"}
    if ext.lower() not in allowed_ext:
        return jsonify({"error": f"不支持的文件格式: .{ext}，仅支持 PDF/JPG/PNG"}), 400
    filename = f"{uuid.uuid4().hex}.{ext}"
    filepath = os.path.join(upload_dir, filename)
    file.save(filepath)

    # 解析发票（传入原始文件名用于关键词匹配）
    try:
        result = parse_invoice(filepath, original_filename=file.filename)
    except Exception as e:
        return jsonify({"error": f"解析失败: {str(e)}"}), 500

    # 保存到数据库
    invoice = Invoice(
        invoice_no=result["invoice_no"],
        seller_name=result["seller_name"],
        seller_tax_no=result.get("seller_tax_no", ""),
        issue_date=result["issue_date"],
        total_amount=result["total_amount"],
        is_special_tax=result["is_special_tax"],
        warehouse_code=result.get("warehouse", "").split("-")[0],
        raw_file_path=filepath,
        status="parsed",
    )
    db.session.add(invoice)
    db.session.flush()

    for item in result.get("items", []):
        inv_item = InvoiceItem(
            invoice_id=invoice.id,
            raw_name=item["raw_name"],
            clean_name=item["clean_name"],
            spec=item.get("spec", ""),
            unit=item["unit"],
            quantity=item["quantity"],
            unit_price=item["unit_price"],
            amount=item["amount"],
        )
        db.session.add(inv_item)

    db.session.commit()

    log_operation("create", "invoice", invoice.id, f"导入发票 {result.get('invoice_no', '')} - {result.get('seller_name', '')}，金额 ¥{result.get('total_amount', 0):.2f}")

    return jsonify({
        "id": invoice.id,
        "invoice_no": result["invoice_no"],
        "seller_name": result["seller_name"],
        "seller_tax_no": result.get("seller_tax_no", ""),
        "issue_date": result["issue_date"],
        "total_amount": result["total_amount"],
        "total_tax_amount": result.get("total_tax_amount", 0),
        "is_special_tax": result["is_special_tax"],
        "warehouse": result.get("warehouse", "00-未分类"),
        "items": result["items"],
        "_hint": result.get("_hint", ""),
        "_blank": result.get("_blank", False),
    })


@bp.route("/list", methods=["GET"])
def list_invoices():
    """发票历史列表（支持搜索和分页）"""
    page = request.args.get("page", 1, type=int)
    limit = request.args.get("limit", 50, type=int)
    keyword = request.args.get("keyword", "").strip()

    query = Invoice.query.filter(Invoice.status == "confirmed")
    if keyword:
        like = f"%{keyword}%"
        query = query.filter(
            or_(Invoice.invoice_no.like(like),
                Invoice.seller_name.like(like))
        )
    query = query.order_by(Invoice.id.desc())

    total = query.count()
    invoices = query.offset((page - 1) * limit).limit(limit).all()

    return jsonify({
        "items": [{
            "id": inv.id,
            "invoice_no": inv.invoice_no,
            "seller_name": inv.seller_name,
            "seller_tax_no": inv.seller_tax_no or "",
            "issue_date": inv.issue_date,
            "total_amount": float(inv.total_amount) if inv.total_amount else 0,
            "warehouse": inv.warehouse_code,
            "status": inv.status,
            "created_at": inv.created_at,
            "has_file": bool(inv.raw_file_path and os.path.exists(inv.raw_file_path)),
            "file_ext": os.path.splitext(inv.raw_file_path)[1].lower() if inv.raw_file_path else "",
        } for inv in invoices],
        "total": total,
        "page": page,
        "limit": limit,
    })


@bp.route("/<int:inv_id>", methods=["GET"])
def get_invoice(inv_id):
    """获取发票详情（含明细）"""
    inv = Invoice.query.get_or_404(inv_id)
    return jsonify({
        "id": inv.id,
        "invoice_no": inv.invoice_no,
        "seller_name": inv.seller_name,
        "issue_date": inv.issue_date,
        "total_amount": float(inv.total_amount) if inv.total_amount else 0,
        "is_special_tax": inv.is_special_tax,
        "seller_tax_no": inv.seller_tax_no or "",
        "warehouse": inv.warehouse_code,
        "status": inv.status,
        "created_at": inv.created_at,
        "has_file": bool(inv.raw_file_path and os.path.exists(inv.raw_file_path)),
        "items": [{
            "raw_name": it.raw_name,
            "clean_name": it.clean_name,
            "spec": it.spec,
            "unit": it.unit,
            "quantity": float(it.quantity) if it.quantity else 0,
            "unit_price": float(it.unit_price) if it.unit_price else 0,
            "amount": float(it.amount) if it.amount else 0,
        } for it in inv.items],
    })


@bp.route("/<int:inv_id>/file", methods=["GET"])
def get_invoice_file(inv_id):
    """获取发票原始文件"""
    inv = Invoice.query.get_or_404(inv_id)
    if not inv.raw_file_path or not os.path.exists(inv.raw_file_path):
        return jsonify({"error": "文件不存在"}), 404
    from flask import send_file
    return send_file(inv.raw_file_path, as_attachment=True, conditional=True,
                     download_name=f"发票_{inv.invoice_no or inv.id}{os.path.splitext(inv.raw_file_path)[1]}")
