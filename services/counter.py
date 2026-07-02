"""编号计数器 — 使用 SELECT FOR UPDATE 保证并发安全"""
from datetime import datetime
from models import Counter
from database import db
from sqlalchemy import text


def _is_postgres():
    """判断是否 PostgreSQL"""
    return "postgresql" in db.engine.url.drivername


def get_next_note_no(type_prefix: str = "", date=None) -> str:
    """
    生成下一个单据编号。
    格式: [前缀]YY-M-NN (如 D26-5-22, L26-5-1)
    YY=年份后两位, M=月份, NN=当月流水号
    type_prefix: "D"=点收单, "L"=领用单
    date: 单据日期，用于生成对应月份的编号，默认当前时间
    """
    now = date if date else datetime.now()
    key = f"{type_prefix}{now.year}_{now.month:02d}" if type_prefix else f"{now.year}_{now.month:02d}"

    # PostgreSQL: 使用 SELECT FOR UPDATE 悲观锁防止并发重复
    if _is_postgres():
        row = db.session.execute(
            text("SELECT id, key, value FROM counters WHERE key = :key FOR UPDATE"),
            {"key": key}
        ).fetchone()

        if row:
            new_val = row.value + 1
            db.session.execute(
                text("UPDATE counters SET value = :val WHERE id = :id"),
                {"val": new_val, "id": row.id}
            )
        else:
            new_val = 1
            db.session.execute(
                text("INSERT INTO counters (key, value) VALUES (:key, :val)"),
                {"key": key, "val": new_val}
            )
    else:
        # SQLite 不支持 FOR UPDATE，用原有方式
        counter = Counter.query.filter_by(key=key).first()
        if not counter:
            counter = Counter(key=key, value=1)
            db.session.add(counter)
            new_val = 1
        else:
            counter.value += 1
            new_val = counter.value

    db.session.commit()
    return f"{type_prefix}{str(now.year)[2:]}-{now.month}-{new_val}"


def peek_next_note_no(type_prefix: str = "") -> str:
    """预览下一个编号（不消耗流水号）"""
    now = datetime.now()
    key = f"{type_prefix}{now.year}_{now.month:02d}" if type_prefix else f"{now.year}_{now.month:02d}"

    if _is_postgres():
        row = db.session.execute(
            text("SELECT value FROM counters WHERE key = :key"), {"key": key}
        ).fetchone()
        val = row[0] + 1 if row else 1
    else:
        counter = Counter.query.filter_by(key=key).first()
        val = counter.value + 1 if counter else 1

    return f"{type_prefix}{str(now.year)[2:]}-{now.month}-{val}"
