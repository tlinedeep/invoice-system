"""仓库自动匹配引擎"""
from models import Warehouse


def match_warehouse(material_name: str) -> str:
    """
    根据材料名称自动匹配仓库编码。
    遍历所有仓库的关键词列表，返回第一个匹配的仓库编码。
    无匹配时返回 "00-未分类"。
    """
    warehouses = Warehouse.query.all()
    for wh in warehouses:
        keywords = [k.strip() for k in wh.keywords.split(",") if k.strip()]
        for kw in keywords:
            if kw in material_name:
                return f"{wh.code}-{wh.name}"
    return "00-未分类"


def get_warehouse_list():
    """获取所有仓库列表，供前端下拉选择"""
    warehouses = Warehouse.query.order_by(Warehouse.code).all()
    return [{"code": wh.code, "name": wh.name, "label": f"{wh.code}-{wh.name}"} for wh in warehouses]
