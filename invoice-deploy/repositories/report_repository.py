"""报表相关 SQL 查询"""
from calendar import monthrange
from datetime import datetime
from sqlalchemy import text
from services.db_helpers import month_expr


def _month_filter_params(month_list=None, prefix=""):
    """生成月份筛选 SQL 片段和参数

    month_list: ['2026-05', '2026-04'] 或 None
    prefix: 表别名前缀，如 'r'
    返回 (condition_sql, params_dict)
    """
    p = (prefix + ".") if prefix else ""
    if month_list:
        placeholders = ", ".join([f":m{i}" for i in range(len(month_list))])
        condition = f"AND {p}date IS NOT NULL AND {month_expr(f'{p}date')} IN ({placeholders})"
        params = {f"m{i}": m for i, m in enumerate(month_list)}
        return condition, params
    # 默认取当年+去年
    now = datetime.now()
    default_start = f"{now.year - 1}-01-01"
    default_end = f"{now.year + 1}-01-01"
    condition = f"AND {p}date IS NOT NULL AND {p}date >= :_yr_start AND {p}date < :_yr_end"
    params = {"_yr_start": default_start, "_yr_end": default_end}
    return condition, params


def get_monthly_stats(db_session, year, month):
    """仪表盘统计（点收/领用金额和数量）

    返回 dict:
        recv_amt, recv_cnt, use_amt, use_cnt, inv_cnt, supplier_cnt
    """
    m = int(month)
    month_start = f"{year}-{m:02d}-01"
    if m == 12:
        next_month = f"{int(year) + 1}-01-01"
    else:
        next_month = f"{int(year)}-{m + 1:02d}-01"

    recv = db_session.execute(text(
        "SELECT COALESCE(SUM(total_amount),0) as amt, COUNT(*) as cnt "
        "FROM receiving_notes WHERE date >= :start AND date < :end AND status='active'"
    ), {"start": month_start, "end": next_month}).fetchone()

    use = db_session.execute(text(
        "SELECT COALESCE(SUM(total_amount),0) as amt, COUNT(*) as cnt "
        "FROM use_notes WHERE date >= :start AND date < :end AND status='active'"
    ), {"start": month_start, "end": next_month}).fetchone()

    inv = db_session.execute(text(
        "SELECT COUNT(*) as cnt FROM invoices WHERE "
        "status='confirmed' AND created_at >= :start AND created_at < :end"
    ), {"start": month_start, "end": next_month}).fetchone()

    sup = db_session.execute(text(
        "SELECT COUNT(DISTINCT seller_name) as cnt FROM receiving_notes WHERE seller_name != ''"
    )).fetchone()

    return {
        "recv_amt": round(float(recv.amt), 2),
        "recv_cnt": recv.cnt,
        "use_amt": round(float(use.amt), 2),
        "use_cnt": use.cnt,
        "inv_cnt": inv.cnt,
        "supplier_cnt": sup.cnt,
    }


def get_yearly_warehouse_summary(db_session, year):
    """年度仓库入库汇总

    返回 Row 列表，每个包含 warehouse_code, wh_name, total_in_qty, total_in_amt
    """
    year_start = f"{year}-01-01"
    year_end = f"{year + 1}-01-01"
    return db_session.execute(text("""
        SELECT r.warehouse_code, w.name as wh_name,
               SUM(r.total_qty) as total_in_qty, SUM(r.total_amount) as total_in_amt
        FROM receiving_notes r
        LEFT JOIN warehouses w ON w.code = r.warehouse_code
        WHERE r.status='active' AND r.date >= :start AND r.date < :end
        GROUP BY r.warehouse_code, w.name
        ORDER BY r.warehouse_code ASC
    """), {"start": year_start, "end": year_end}).fetchall()


def get_monthly_summary(db_session, month_list=None):
    """月度汇总（点收+领用）

    返回 (recv_rows, use_rows)
    recv_rows: (ym, cnt, qty, amt)
    use_rows:  (ym, cnt, qty, amt)
    """
    mf, mp = _month_filter_params(month_list)

    recv_rows = db_session.execute(text(f"""
        SELECT {month_expr('date')} as ym,
               COUNT(*) as cnt, SUM(total_qty) as qty, SUM(total_amount) as amt
        FROM receiving_notes WHERE status='active' {mf}
        GROUP BY ym ORDER BY ym DESC
    """), mp).fetchall()

    use_rows = db_session.execute(text(f"""
        SELECT {month_expr('date')} as ym,
               COUNT(*) as cnt, SUM(total_qty) as qty, SUM(total_amount) as amt
        FROM use_notes WHERE status='active' {mf}
        GROUP BY ym ORDER BY ym DESC
    """), mp).fetchall()

    return recv_rows, use_rows


def get_project_summary(db_session, month_list=None):
    """按工程汇总

    返回 Row 列表 (project_name, cnt, amt)
    """
    mf, mp = _month_filter_params(month_list)
    return db_session.execute(text(f"""
        SELECT project_name, COUNT(*) as cnt, SUM(total_amount) as amt
        FROM receiving_notes WHERE status='active' {mf}
        GROUP BY project_name ORDER BY amt DESC
    """), mp).fetchall()


def get_warehouse_summary(db_session, month_list=None):
    """按仓库汇总

    返回 Row 列表 (warehouse_code, wh_name, cnt, amt)
    """
    mf, mp = _month_filter_params(month_list, prefix="r")
    return db_session.execute(text(f"""
        SELECT r.warehouse_code, w.name as wh_name,
               COUNT(*) as cnt, SUM(r.total_amount) as amt
        FROM receiving_notes r
        LEFT JOIN warehouses w ON w.code = r.warehouse_code
        WHERE r.status='active' {mf}
        GROUP BY r.warehouse_code, w.name ORDER BY amt DESC
    """), mp).fetchall()


def get_supplier_summary(db_session, month_list=None):
    """按供应商汇总

    返回 Row 列表 (seller_name, cnt, amt)
    """
    mf, mp = _month_filter_params(month_list)
    return db_session.execute(text(f"""
        SELECT seller_name, COUNT(*) as cnt, SUM(total_amount) as amt
        FROM receiving_notes WHERE status='active' {mf}
        GROUP BY seller_name ORDER BY amt DESC
    """), mp).fetchall()


def get_all_months(db_session):
    """获取所有可用月份（用于前端筛选器）

    返回 str 列表 ['2026-05', '2026-04', ...]
    """
    rows = db_session.execute(text(f"""
        SELECT DISTINCT {month_expr('date')} as ym
        FROM receiving_notes WHERE status='active' AND date IS NOT NULL
        UNION
        SELECT DISTINCT {month_expr('date')} as ym
        FROM use_notes WHERE status='active' AND date IS NOT NULL
        ORDER BY ym DESC
    """)).fetchall()
    return [r.ym for r in rows]


def get_warehouse_balance(db_session, year, month):
    """收发存按仓库的期初/收入/发出/结存

    返回 dict:
        recv_before: {code: amt, ...}   本月前点收
        use_before:  {code: amt, ...}   本月前领用
        recv_month:  {code: amt, ...}   本月点收
        use_month:   {code: amt, ...}   本月领用
        month_start: 'YYYY-MM-DD'
        month_end:   'YYYY-MM-DD'
    """
    month_start = f"{year}-{month}-01"
    _, last_day = monthrange(int(year), int(month))
    month_end = f"{year}-{month}-{last_day:02d}"

    recv_before = {
        r.warehouse_code or '': round(float(r.amt or 0), 2)
        for r in db_session.execute(text("""
            SELECT warehouse_code, SUM(total_amount) as amt FROM receiving_notes
            WHERE status='active' AND date < :start GROUP BY warehouse_code
        """), {"start": month_start}).fetchall()
    }

    use_before = {
        r.warehouse_code or '': round(float(r.amt or 0), 2)
        for r in db_session.execute(text("""
            SELECT warehouse_code, SUM(total_amount) as amt FROM use_notes
            WHERE status='active' AND date < :start GROUP BY warehouse_code
        """), {"start": month_start}).fetchall()
    }

    recv_month = {
        r.warehouse_code or '': round(float(r.amt or 0), 2)
        for r in db_session.execute(text("""
            SELECT warehouse_code, SUM(total_amount) as amt FROM receiving_notes
            WHERE status='active' AND date >= :start AND date <= :end GROUP BY warehouse_code
        """), {"start": month_start, "end": month_end}).fetchall()
    }

    use_month = {
        r.warehouse_code or '': round(float(r.amt or 0), 2)
        for r in db_session.execute(text("""
            SELECT warehouse_code, SUM(total_amount) as amt FROM use_notes
            WHERE status='active' AND date >= :start AND date <= :end GROUP BY warehouse_code
        """), {"start": month_start, "end": month_end}).fetchall()
    }

    return {
        "recv_before": recv_before,
        "use_before": use_before,
        "recv_month": recv_month,
        "use_month": use_month,
        "month_start": month_start,
        "month_end": month_end,
    }


def get_filter_options(db_session):
    """获取筛选选项（年份/工程/仓库/供应商）

    返回 dict:
        years: ['2026', '2025', ...]
        projects: [{'project_no': ..., 'project_name': ...}, ...]
        warehouses: [{'code': ..., 'name': ...}, ...]
        suppliers: [{'name': ...}, ...]
    """
    # 年份
    date_rows = db_session.execute(text(
        "SELECT DISTINCT date FROM receiving_notes WHERE status='active' AND date IS NOT NULL "
        "UNION SELECT DISTINCT date FROM use_notes WHERE status='active' AND date IS NOT NULL"
    )).fetchall()
    all_years = sorted(set(
        r[0].split("-")[0] for r in date_rows if r[0] and "-" in r[0]
    ), reverse=True)

    # 工程
    proj_rows = db_session.execute(
        text("SELECT project_no, project_name FROM projects WHERE project_no != '' ORDER BY project_no")
    ).fetchall()
    projects = [{"project_no": r.project_no, "project_name": r.project_name} for r in proj_rows]

    # 仓库
    wh_rows = db_session.execute(
        text("SELECT code, name FROM warehouses ORDER BY code")
    ).fetchall()
    warehouses = [{"code": r.code, "name": r.name} for r in wh_rows]

    # 供应商
    sup_rows = db_session.execute(
        text("SELECT DISTINCT seller_name FROM receiving_notes WHERE seller_name != '' ORDER BY seller_name")
    ).fetchall()
    suppliers = [{"name": r[0]} for r in sup_rows]

    return {
        "years": all_years,
        "projects": projects,
        "warehouses": warehouses,
        "suppliers": suppliers,
    }
