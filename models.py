"""数据模型"""
from datetime import datetime
from sqlalchemy import Numeric, Index
from database import db


class Invoice(db.Model):
    __tablename__ = "invoices"
    id = db.Column(db.Integer, primary_key=True)
    invoice_no = db.Column(db.String(50))
    seller_name = db.Column(db.String(200))
    seller_tax_no = db.Column(db.String(50), default="")
    issue_date = db.Column(db.String(20))
    total_amount = db.Column(Numeric(14, 2))
    is_special_tax = db.Column(db.Boolean, default=True)  # True=专票(不含税), False=普票(含税)
    warehouse_code = db.Column(db.String(10))
    raw_file_path = db.Column(db.String(300))
    status = db.Column(db.String(20), default="parsed")  # parsed, confirmed, used
    created_at = db.Column(db.String(30), default=lambda: datetime.now().strftime("%Y-%m-%d %H:%M"))
    items = db.relationship("InvoiceItem", backref="invoice", lazy=True, cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_invoices_status", "status"),
        Index("ix_invoices_seller_name", "seller_name"),
    )


class InvoiceItem(db.Model):
    __tablename__ = "invoice_items"
    id = db.Column(db.Integer, primary_key=True)
    invoice_id = db.Column(db.Integer, db.ForeignKey("invoices.id"), index=True)
    raw_name = db.Column(db.String(200))
    clean_name = db.Column(db.String(200))
    spec = db.Column(db.String(100), default="")
    unit = db.Column(db.String(20))
    quantity = db.Column(Numeric(14, 3))
    unit_price = db.Column(Numeric(14, 4))
    amount = db.Column(Numeric(14, 2))


class ReceivingNote(db.Model):
    __tablename__ = "receiving_notes"
    id = db.Column(db.Integer, primary_key=True)
    note_no = db.Column(db.String(20), unique=True)
    invoice_id = db.Column(db.Integer, db.ForeignKey("invoices.id"), nullable=True, index=True)
    warehouse_code = db.Column(db.String(10), index=True)
    date = db.Column(db.String(20), index=True)
    project_no = db.Column(db.String(50), index=True)
    project_name = db.Column(db.String(200))
    client = db.Column(db.String(200), default="")
    seller_name = db.Column(db.String(200), index=True)
    invoice_no_list = db.Column(db.String(300))
    accountant = db.Column(db.String(50))
    buyer = db.Column(db.String(50))
    total_qty = db.Column(Numeric(14, 3))
    total_amount = db.Column(Numeric(14, 2))
    status = db.Column(db.String(20), default="active", index=True)
    version = db.Column(db.Integer, default=0)
    created_by = db.Column(db.Integer, default=0)
    created_at = db.Column(db.String(30), default=lambda: datetime.now().strftime("%Y-%m-%d %H:%M"))

    invoice = db.relationship("Invoice", backref="receiving_notes")


class ReceivingItem(db.Model):
    __tablename__ = "receiving_items"
    id = db.Column(db.Integer, primary_key=True)
    note_id = db.Column(db.Integer, db.ForeignKey("receiving_notes.id"), index=True)
    seq = db.Column(db.Integer)
    material_name = db.Column(db.String(200))
    spec = db.Column(db.String(100), default="")
    unit = db.Column(db.String(20))
    quantity = db.Column(Numeric(14, 3))
    unit_price = db.Column(Numeric(14, 4))
    amount = db.Column(Numeric(14, 2))

    note = db.relationship("ReceivingNote", backref="items")


class UseNote(db.Model):
    __tablename__ = "use_notes"
    id = db.Column(db.Integer, primary_key=True)
    note_no = db.Column(db.String(20), unique=True)
    receiving_note_id = db.Column(db.Integer, db.ForeignKey("receiving_notes.id"), index=True)
    warehouse_code = db.Column(db.String(10), index=True)
    date = db.Column(db.String(20), index=True)
    project_no = db.Column(db.String(50), index=True)
    project_name = db.Column(db.String(200))
    client = db.Column(db.String(200), default="")
    recipient = db.Column(db.String(50))
    accountant = db.Column(db.String(50))
    total_qty = db.Column(Numeric(14, 3))
    total_amount = db.Column(Numeric(14, 2))
    status = db.Column(db.String(20), default="active", index=True)
    version = db.Column(db.Integer, default=0)
    created_by = db.Column(db.Integer, default=0)
    created_at = db.Column(db.String(30), default=lambda: datetime.now().strftime("%Y-%m-%d %H:%M"))

    receiving_note = db.relationship("ReceivingNote", backref="use_notes")


class UseItem(db.Model):
    __tablename__ = "use_items"
    id = db.Column(db.Integer, primary_key=True)
    note_id = db.Column(db.Integer, db.ForeignKey("use_notes.id"), index=True)
    seq = db.Column(db.Integer)
    material_name = db.Column(db.String(200))
    spec = db.Column(db.String(100), default="")
    unit = db.Column(db.String(20))
    quantity = db.Column(Numeric(14, 3))
    unit_price = db.Column(Numeric(14, 4))
    amount = db.Column(Numeric(14, 2))
    receiving_item_id = db.Column(db.Integer, db.ForeignKey("receiving_items.id"), nullable=True, index=True)

    note = db.relationship("UseNote", backref="items")


class Warehouse(db.Model):
    __tablename__ = "warehouses"
    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(10), unique=True)
    name = db.Column(db.String(50))
    keywords = db.Column(db.String(500))


class Project(db.Model):
    __tablename__ = "projects"
    id = db.Column(db.Integer, primary_key=True)
    project_no = db.Column(db.String(50), unique=True)
    project_name = db.Column(db.String(200))
    client = db.Column(db.String(200), default="")  # 发包单位


class Personnel(db.Model):
    __tablename__ = "personnel"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50))
    role = db.Column(db.String(50))  # accountant, buyer, recipient（逗号分隔多角色）
    enabled = db.Column(db.Boolean, default=True)


class Supplier(db.Model):
    __tablename__ = "suppliers"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), unique=True)
    credit_code = db.Column(db.String(50), default="")
    contact = db.Column(db.String(100), default="")
    phone = db.Column(db.String(50), default="")
    remark = db.Column(db.String(300), default="")
    created_at = db.Column(db.String(30), default=lambda: datetime.now().strftime("%Y-%m-%d %H:%M"))


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True)
    password = db.Column(db.String(200))
    display_name = db.Column(db.String(50))
    role = db.Column(db.String(20), default="user")  # user, admin
    enabled = db.Column(db.Boolean, default=True)
    session_token = db.Column(db.String(64), default="")


class Counter(db.Model):
    __tablename__ = "counters"
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(30), unique=True)  # "2026_05"
    value = db.Column(db.Integer, default=0)


class SystemConfig(db.Model):
    __tablename__ = "system_config"
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(100), unique=True)
    value = db.Column(db.String(500), default="")
    description = db.Column(db.String(200), default="")


class MaterialInventory(db.Model):
    """库存物化汇总表 — 由 rebuild_inventory() 刷新，避免全表扫描"""
    __tablename__ = "material_inventory"
    id = db.Column(db.Integer, primary_key=True)
    material_name = db.Column(db.String(200))
    spec = db.Column(db.String(100), default="")
    unit = db.Column(db.String(20))
    warehouse_code = db.Column(db.String(10), default="")
    in_qty = db.Column(Numeric(14, 3), default=0)
    in_amt = db.Column(Numeric(14, 2), default=0)
    out_qty = db.Column(Numeric(14, 3), default=0)
    out_amt = db.Column(Numeric(14, 2), default=0)
    balance_qty = db.Column(Numeric(14, 3), default=0)
    balance_amt = db.Column(Numeric(14, 2), default=0)
    updated_at = db.Column(db.String(30))

    __table_args__ = (
        Index("ix_material_inventory_name_spec", "material_name", "spec", "warehouse_code"),
    )


class OperationLog(db.Model):
    __tablename__ = "operation_logs"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=True, index=True)
    username = db.Column(db.String(50), default="")
    action = db.Column(db.String(50))  # create, update, delete
    target_type = db.Column(db.String(50))  # receiving_note, use_note, invoice, etc.
    target_id = db.Column(db.Integer, nullable=True)
    detail = db.Column(db.String(500), default="")
    created_at = db.Column(db.String(30), default=lambda: datetime.now().strftime("%Y-%m-%d %H:%M"), index=True)
