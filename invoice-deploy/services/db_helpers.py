"""数据库兼容辅助函数（SQLite / PostgreSQL）"""


def _db_driver():
    """返回数据库驱动名：'sqlite' 或 'postgresql'"""
    try:
        from database import db
        driver = db.engine.url.drivername
        if "sqlite" in driver:
            return "sqlite"
        if "postgresql" in driver:
            return "postgresql"
        return driver
    except Exception:
        return "sqlite"


def month_expr(column: str = "date") -> str:
    """返回数据库无关的"提取年月" SQL 表达式

    SQLite:   strftime('%Y-%m', date)    (date 是字符串，SQLite 直接支持)
    PostgreSQL: to_char(date::date, 'YYYY-MM')  (date 是字符串，先转型)
    """
    if _db_driver() == "postgresql":
        return f"to_char({column}::date, 'YYYY-MM')"
    return f"strftime('%Y-%m', {column})"
