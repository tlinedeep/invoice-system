"""仓库数据缓存 — 避免每次请求全查 Warehouse 表"""
from functools import lru_cache
from models import Warehouse


@lru_cache(maxsize=1)
def get_warehouse_map():
    """缓存仓库编码→名称映射（warehouse 数据极少变动，14条）"""
    return {w.code: w.name for w in Warehouse.query.all()}


def invalidate_warehouse_cache():
    """在仓库关键词更新后调用，清除缓存"""
    get_warehouse_map.cache_clear()
