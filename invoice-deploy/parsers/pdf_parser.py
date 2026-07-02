"""PDF 发票解析策略 — 使用 pdfplumber 提取文本"""
from parsers.base_parser import BaseInvoiceParser, _extract_invoice_from_text


class PDFParser(BaseInvoiceParser):
    """PDF 解析策略：使用 pdfplumber 提取 PDF 文本并解析发票字段"""

    def parse(self, filepath: str) -> dict | None:
        return self._try_pdf_parse(filepath)

    def _try_pdf_parse(self, filepath: str) -> dict | None:
        """使用 pdfplumber 提取 PDF 文本并解析发票字段"""
        try:
            import pdfplumber
        except ImportError:
            return None

        try:
            with pdfplumber.open(filepath) as pdf:
                if not pdf.pages:
                    return None

                full_text = ""
                for page in pdf.pages:
                    t = page.extract_text()
                    if t:
                        full_text += t + "\n"

                if not full_text.strip():
                    return None

                return _extract_invoice_from_text(full_text)
        except Exception:
            return None
