"""发票解析门面 — 统一入口，保持向后兼容的 parse_invoice() 签名"""
from parsers.parser_factory import get_parser
from parsers.mock_parser import MockParser


def parse_invoice(filepath: str, original_filename: str = "") -> dict:
    """
    解析发票文件，提取关键字段。
    1. 根据文件扩展名选择解析策略（PDF/OCR）
    2. 如果解析失败，fallback 到 Mock 回退策略
    3. 完全无匹配则返回通用空模板
    """
    # 尝试主解析器（PDF / OCR）
    parser = get_parser(filepath)
    if parser:
        result = parser.parse(filepath)
        if result:
            return result

    # 解析失败，回退到文件名关键词匹配的 mock 数据
    name = original_filename or filepath
    mock = MockParser(name)
    return mock.parse(filepath)
