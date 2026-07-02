"""库存物化汇总表刷新服务"""
from datetime import datetime
from database import db
from models import MaterialInventory, SystemConfig
from sqlalchemy import text


def rebuild_inventory():
    """重建 material_inventory 表（全量刷新，一次查询计算）"""

    # 清空旧数据
    MaterialInventory.query.delete()
    db.session.flush()

    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    # 用一次查询拿到入+出汇总并计算库存（使用 UNION ALL + GROUP BY）
    rows = db.session.execute(text("""
        SELECT material_name, spec, unit, warehouse_code,
               SUM(in_qty) as in_qty, SUM(in_amt) as in_amt,
               SUM(out_qty) as out_qty, SUM(out_amt) as out_amt
        FROM (
            SELECT ri.material_name, COALESCE(ri.spec,'') as spec, ri.unit,
                   COALESCE(rn.warehouse_code,'') as warehouse_code,
                   SUM(ri.quantity) as in_qty, SUM(ri.amount) as in_amt,
                   0 as out_qty, 0 as out_amt
            FROM receiving_items ri
            JOIN receiving_notes rn ON rn.id = ri.note_id AND rn.status='active'
            GROUP BY ri.material_name, ri.spec, ri.unit, rn.warehouse_code
            UNION ALL
            SELECT ui.material_name, COALESCE(ui.spec,'') as spec, ui.unit,
                   COALESCE(un.warehouse_code,'') as warehouse_code,
                   0 as in_qty, 0 as in_amt,
                   SUM(ui.quantity) as out_qty, SUM(ui.amount) as out_amt
            FROM use_items ui
            JOIN use_notes un ON un.id = ui.note_id AND un.status='active'
            GROUP BY ui.material_name, ui.spec, ui.unit, un.warehouse_code
        ) t
        GROUP BY material_name, spec, unit, warehouse_code
    """)).fetchall()

    for r in rows:
        in_qty = float(r.in_qty or 0)
        in_amt = float(r.in_amt or 0)
        out_qty = float(r.out_qty or 0)
        out_amt = float(r.out_amt or 0)
        balance_qty = round(in_qty - out_qty, 3)
        balance_amt = round(in_amt - out_amt, 2)
        if balance_qty == 0 and balance_amt == 0:
            continue
        inv = MaterialInventory(
            material_name=r.material_name,
            spec=r.spec, unit=r.unit,
            warehouse_code=r.warehouse_code,
            in_qty=round(in_qty, 3), in_amt=round(in_amt, 2),
            out_qty=round(out_qty, 3), out_amt=round(out_amt, 2),
            balance_qty=balance_qty, balance_amt=balance_amt,
            updated_at=now,
        )
        db.session.add(inv)

    cfg = SystemConfig.query.filter_by(key="inventory_stale").first()
    if cfg:
        cfg.value = "0"

    db.session.commit()


def mark_inventory_stale():
    """标记库存为过期（在 CRUD 操作后调用），下次查询自动重建"""
    cfg = SystemConfig.query.filter_by(key="inventory_stale").first()
    if cfg:
        cfg.value = "1"
    else:
        db.session.add(SystemConfig(key="inventory_stale", value="1", description="库存物化表是否过期"))
    db.session.commit()
