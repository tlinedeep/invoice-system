"""数据库初始化"""
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def _is_sqlite():
    """判断当前是否使用 SQLite"""
    return "sqlite" in db.engine.url.drivername


def init_db(app):
    """初始化数据库并创建默认数据"""
    with app.app_context():
        db.init_app(app)
        # 优先使用 Alembic 管理表结构；如果 alembic_version 表不存在则回退到 create_all
        from sqlalchemy import inspect
        inspector = inspect(db.engine)
        if "alembic_version" not in inspector.get_table_names():
            db.create_all()
        # SQLite 专用优化：WAL 模式提升并发性能
        if _is_sqlite():
            from sqlalchemy import text
            db.session.execute(text("PRAGMA journal_mode=WAL"))
            db.session.execute(text("PRAGMA busy_timeout=5000"))
            db.session.commit()
        _seed_defaults(db)


def _seed_defaults(db):
    """插入默认基础数据（仅空表时）"""
    from models import Warehouse, User, Personnel
    from werkzeug.security import generate_password_hash

    # 创建管理员账户（仅首次部署时）
    if User.query.count() == 0:
        password = generate_password_hash("swing208blue")
        db.session.add(User(username="admin", password=password, display_name="管理员", role="admin", enabled=False))
        db.session.commit()
        password2 = generate_password_hash("swing208blue")
        db.session.add(User(username="swingtt", password=password2, display_name="swingtt", role="admin", enabled=True))
        db.session.commit()

    # 仓库分类及关键词（仅首次部署时）
    if Warehouse.query.count() == 0:
        from config import DEFAULT_WAREHOUSES
        for w in DEFAULT_WAREHOUSES:
            db.session.add(Warehouse(code=w["code"], name=w["name"], keywords=w["keywords"]))
        db.session.commit()

    # 默认单据人员（仅首次部署时）
    if Personnel.query.count() == 0:
        from config import DEFAULT_PERSONNEL
        for p in DEFAULT_PERSONNEL:
            db.session.add(Personnel(name=p["name"], role=p["role"], enabled=True))
        db.session.commit()
