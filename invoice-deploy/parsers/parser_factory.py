"""策略工厂 — 根据文件扩展名选择解析器"""
import os

from parsers.pdf_parser import PDFParser
from parsers.ocr_parser import OCRParser


# 文件扩展名 → 解析器类映射
_PARSER_MAP = {
    ".pdf": PDFParser,
    ".jpg": OCRParser,
    ".jpeg": OCRParser,
    ".png": OCRParser,
}


def get_parser(filepath: str):
    """根据文件扩展名返回对应的解析器实例，不支持的扩展名返回 None"""
    ext = os.path.splitext(filepath)[1].lower()
    parser_cls = _PARSER_MAP.get(ext)
    if parser_cls:
        return parser_cls()
    return None
