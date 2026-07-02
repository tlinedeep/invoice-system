"""Mock 回退解析策略 — 根据文件名关键词返回示例数据"""
from datetime import datetime

from parsers.base_parser import BaseInvoiceParser
from services.warehouse_matcher import match_warehouse


class MockParser(BaseInvoiceParser):
    """Mock 回退策略：按文件名关键字匹配返回示例发票数据"""

    def __init__(self, name: str = ""):
        self.name = name

    def parse(self, filepath: str) -> dict:
        return self._mock_by_filename(self.name) or self._mock_generic(self.name)

    def _mock_by_filename(self, name: str) -> dict | None:
        """根据文件名关键词返回 mock 数据"""
        name_lower = name.lower()
        if "舜华泰" in name or "液压" in name or "润滑油" in name:
            return self._mock_shunhuatai()
        elif "钢铁" in name or "钢筋" in name or "螺纹钢" in name or "钢材" in name:
            return self._mock_steel()
        elif "电缆" in name or "电工" in name or "电线" in name:
            return self._mock_electric()
        elif "水泥" in name or "砂" in name or "石子" in name or "地材" in name:
            return self._mock_aggregate()
        return None

    def _mock_shunhuatai(self):
        items = [{
            "raw_name": "*润滑油*46号抗磨液压油",
            "clean_name": "46号抗磨液压油",
            "spec": "",
            "unit": "吨",
            "quantity": 0.340,
            "unit_price": 13274.33,
            "amount": 4513.27,
        }]
        return {
            "invoice_no": "48964306",
            "seller_name": "天津舜华泰商贸有限公司",
            "issue_date": "2026-01-15",
            "total_amount": 4513.27,
            "is_special_tax": True,
            "items": items,
            "warehouse": match_warehouse(items[0]["clean_name"]),
            "_hint": "示例数据",
        }

    def _mock_steel(self):
        items = [{
            "raw_name": "螺纹钢HRB400",
            "clean_name": "螺纹钢HRB400",
            "spec": "Φ25",
            "unit": "吨",
            "quantity": 2.500,
            "unit_price": 3850.00,
            "amount": 9625.00,
        }]
        return {
            "invoice_no": "87234561",
            "seller_name": "河北钢铁集团有限公司",
            "issue_date": "2026-05-20",
            "total_amount": 9625.00,
            "is_special_tax": True,
            "items": items,
            "warehouse": "01-钢材",
            "_hint": "示例数据",
        }

    def _mock_electric(self):
        items = [{
            "raw_name": "YJV22-3*95电缆",
            "clean_name": "YJV22-3*95电缆",
            "spec": "3*95mm²",
            "unit": "米",
            "quantity": 150.000,
            "unit_price": 285.50,
            "amount": 42825.00,
        }]
        return {
            "invoice_no": "95672318",
            "seller_name": "天津津城电缆有限公司",
            "issue_date": "2026-05-18",
            "total_amount": 42825.00,
            "is_special_tax": True,
            "items": items,
            "warehouse": "10-电料",
            "_hint": "示例数据",
        }

    def _mock_aggregate(self):
        items = [{
            "raw_name": "中砂",
            "clean_name": "中砂",
            "spec": "2.3-3.0mm",
            "unit": "吨",
            "quantity": 35.000,
            "unit_price": 85.00,
            "amount": 2975.00,
        }]
        return {
            "invoice_no": "73458291",
            "seller_name": "天津滨海建筑材料有限公司",
            "issue_date": "2026-05-22",
            "total_amount": 2975.00,
            "is_special_tax": True,
            "items": items,
            "warehouse": "04-地材",
            "_hint": "示例数据",
        }

    def _mock_generic(self, filename: str):
        today = datetime.now().strftime("%Y-%m-%d")
        return {
            "invoice_no": "",
            "seller_name": "",
            "issue_date": today,
            "total_amount": 0,
            "is_special_tax": True,
            "items": [{
                "raw_name": "", "clean_name": "", "spec": "",
                "unit": "吨", "quantity": 0, "unit_price": 0, "amount": 0,
            }],
            "warehouse": "00-未分类",
            "_hint": "需要手动填写",
            "_blank": True,
        }
