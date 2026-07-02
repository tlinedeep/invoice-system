"""点收单相关 SQL 查询"""
from sqlalchemy import text


def get_remaining_note_ids(db_session):
    """找出还有未领完物料的点收单 ID

    返回 set[int]：还有剩余物料的点收单 ID 集合
    """
    rows = db_session.execute(text("""
        SELECT DISTINCT ri.note_id
        FROM receiving_items ri
        WHERE ri.quantity > COALESCE(
            (SELECT SUM(ui.quantity) FROM use_items ui
             JOIN use_notes un ON un.id = ui.note_id
             WHERE ui.receiving_item_id = ri.id AND un.status = 'active'),
            0
        )
    """)).fetchall()
    return {r[0] for r in rows}


def get_used_items_for_note(db_session, note_id):
    """获取点收单已领用的 UseItem

    返回 Row 对象列表，每个包含 receiving_item_id, seq, quantity, amount
    """
    rows = db_session.execute(text("""
        SELECT ui.receiving_item_id, ui.seq, ui.quantity, ui.amount
        FROM use_items ui
        JOIN use_notes un ON un.id = ui.note_id
        WHERE un.receiving_note_id = :note_id AND un.status = 'active'
        ORDER BY ui.seq
    """), {"note_id": note_id}).fetchall()
    return rows


def get_warehouse_name(db_session, code):
    """获取仓库名称，不存在时返回 None"""
    row = db_session.execute(
        text("SELECT name FROM warehouses WHERE code = :code"),
        {"code": code}
    ).fetchone()
    return row[0] if row else None


def get_min_use_date(db_session, note_id):
    """获取关联领用单的最早日期，无关联时返回 None"""
    return db_session.execute(
        text("SELECT MIN(date) FROM use_notes WHERE receiving_note_id = :rid AND status = 'active'"),
        {"rid": note_id}
    ).scalar()
