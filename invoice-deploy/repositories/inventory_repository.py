"""库存相关查询"""
from sqlalchemy import text


def query_materialized(db_session, keyword="", warehouse_codes=None, page=1, limit=9999):
    """物化表查询，支持仓库筛选、关键词过滤和分页

    关键词匹配 material_name/spec/unit（不区分大小写）
    返回 (items, total)
    items 为 Row 列表，每个包含 material_inventory 表的全部字段
    """
    sql = "SELECT * FROM material_inventory"
    conditions = []
    params = {}

    if warehouse_codes:
        codes = [c.strip() for c in warehouse_codes.split(",") if c.strip()]
        if codes:
            placeholders = ", ".join([f":wc{i}" for i in range(len(codes))])
            conditions.append(f"warehouse_code IN ({placeholders})")
            for i, c in enumerate(codes):
                params[f"wc{i}"] = c

    if conditions:
        sql += " WHERE " + " AND ".join(conditions)
    sql += " ORDER BY material_name, warehouse_code"

    rows = db_session.execute(text(sql), params).fetchall()

    # Python 端关键词过滤（不区分大小写）
    kw = keyword.lower() if keyword else ""
    filtered = []
    for r in rows:
        if kw:
            if (kw not in (r.material_name or "").lower()
                    and kw not in (r.spec or "").lower()
                    and kw not in (r.unit or "").lower()):
                continue
        filtered.append(r)

    total = len(filtered)
    items = filtered[(page - 1) * limit:page * limit]

    return items, total


def get_warehouse_name_map(db_session):
    """仓库编码 -> 名称映射

    返回 dict {code: name, ...}
    """
    rows = db_session.execute(
        text("SELECT code, name FROM warehouses")
    ).fetchall()
    return {r.code: r.name for r in rows}
