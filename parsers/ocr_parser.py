"""OCR 发票解析策略 — 使用 tesseract.js 识别图片文字"""
import os
import re
import subprocess

from parsers.base_parser import BaseInvoiceParser, _extract_invoice_from_text


class OCRParser(BaseInvoiceParser):
    """OCR 解析策略：使用 tesseract.js 对 JPG/PNG 图片进行文字识别"""

    def __init__(self):
        # services/ocr_worker.js 相对于 parsers/ 目录
        self.worker_path = os.path.normpath(
            os.path.join(os.path.dirname(__file__), "..", "services", "ocr_worker.js")
        )

    def parse(self, filepath: str) -> dict | None:
        ocr_text = self._ocr_image(filepath)
        if ocr_text:
            result = _extract_invoice_from_text(ocr_text, source="ocr")
            if result:
                return result
        return None

    def _ocr_image(self, filepath: str) -> str | None:
        """使用 tesseract.js 对图片进行 OCR 识别，返回文本"""
        try:
            p = subprocess.Popen(
                ["node", self.worker_path, filepath],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                encoding="utf-8", errors="replace",
            )
            try:
                stdout, stderr = p.communicate(timeout=120)
                if p.returncode == 0 and stdout.strip():
                    return self._clean_ocr_text(stdout.strip())
                if stderr:
                    print(f"[ocr] stderr: {stderr[:200]}")
                return None
            except subprocess.TimeoutExpired:
                p.kill()
                p.communicate()
                print("[ocr] OCR timed out, process killed")
                return None
        except FileNotFoundError:
            print("[ocr] node not found, check PATH")
            return None
        except Exception as e:
            print(f"[ocr] error: {e}")
            return None

    @staticmethod
    def _clean_ocr_text(text: str) -> str:
        """清洗 OCR 识别的文本，修复常见问题"""
        text = re.sub(r"(\d)\s*\.\s*(\d)", r"\1.\2", text)
        text = re.sub(r"([一-鿿])\s+([一-鿿])", r"\1\2", text)
        text = re.sub(r"([一-鿿])\s*([：:])\s*", r"\1\2", text)
        text = re.sub(r"[ \t]+", " ", text)
        lines = text.split("\n")
        cleaned = []
        for line in lines:
            line = re.sub(r"^[\s>\]\[()（），,./\\|]+", "", line)
            line = re.sub(r"[\s>\]\[()（）,./\\|]+$", "", line)
            if line.strip():
                cleaned.append(line.strip())
        return "\n".join(cleaned)
