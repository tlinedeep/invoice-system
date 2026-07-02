"""发票解析抽象基类 — 定义解析策略接口，包含所有共享的解析逻辑"""
import re
from datetime import datetime
from services.warehouse_matcher import match_warehouse


class BaseInvoiceParser:
    """发票解析策略抽象基类"""

    def parse(self, filepath: str) -> dict | None:
        raise NotImplementedError


# ======================================================================
# 已知的计量单位
# ======================================================================
_UNITS = {"台", "套", "个", "条", "根", "米", "只", "棵", "颗", "千克", "公斤", "吨",
           "升", "次", "片", "块", "箱", "桶", "件", "支", "付", "双", "瓶",
           "罐", "袋", "包", "盒", "卷", "板", "节", "组", "副", "张", "m", "cm",
           "km", "KM", "g", "kg", "t", "L", "ml", "PCS", "pcs", "盘", "把", "月",
           "㎡", "m²", "m2", "立方米", "EA", "ea",
           "具", "处", "年", "KG", "批", "对", "车"}

# 尺寸/计量单位模式：形如 250mm, 100mm, 1.5m, 20kg 等
_DIMENSIONAL_UNITS_PATTERN = re.compile(r"^\d+(\.\d+)?(mm|cm|m|km|㎡|m²|m2|kg|g|t)$", re.IGNORECASE)
_SPEC_CHINESE_UNITS = {"寸", "英寸"}  # 中文计量字，跟在数字后组成规格（如"12寸"）


# ======================================================================
# 电子发票分类前缀 → 仓库编码映射（按新的14类仓库标准）
# ======================================================================
_CLASSIFICATION_MAP = {
    # 01 钢材
    "黑色金属冶炼压延品": "01-钢材",
    "黑色金属": "01-钢材",
    "冶炼压延品": "01-钢材",
    # 02 木材
    "木材": "02-木材",
    "木制品": "02-木材",
    # 03 水泥
    "非金属矿物制品": "03-水泥",
    "水泥": "03-水泥",
    # 04 地材
    # 05 燃油料
    "石油制品": "05-燃油料",
    "燃料油": "05-燃油料",
    "成品油": "05-燃油料",
    "润滑油": "05-燃油料",
    # 06 周转材料
    "周转材料": "06-周转材料",
    # 07 结构件
    "结构性金属制品": "07-结构件",
    "金属结构": "07-结构件",
    # 08 化工
    "涂料": "08-化工",
    "化学合成材料": "08-化工",
    "洗涤剂": "08-化工",
    "化工": "08-化工",
    "油漆": "08-化工",
    "辅助材料": "08-化工",
    "粘合剂": "08-化工",
    "有机化学原料": "08-化工",
    # 09 五金
    "金属制品": "09-五金",
    "紧固件": "09-五金",
    # 10 电料
    "电线电缆": "10-电料",
    "配电控制设备": "10-电料",
    "移动通信设备": "10-电料",
    "电气设备": "10-电料",
    "电工器材": "10-电料",
    # 11 有色金属
    "有色金属": "11-有色金属",
    "铝材": "11-有色金属",
    "铜材": "11-有色金属",
    # 12 低值易耗品
    "纺织产品": "12-低值易耗品",
    # 13 配件
    "起重机": "13-配件",
    "起重设备": "13-配件",
    "通用设备": "13-配件",
    "专用设备": "13-配件",
    "机械设备": "13-配件",
    "泵": "13-配件",
    "阀门": "13-配件",
    "轴承": "13-配件",
    # 14 杂品
    "交通运输设备": "14-杂品",
    "塑料制品": "14-杂品",
    "橡胶制品": "14-杂品",
    "日用百货": "14-杂品",
    "办公用品": "14-杂品",
}


# ======================================================================
# 共享辅助函数
# ======================================================================

def _is_spec_token(token: str) -> bool:
    """判断一个非中文 token 是否是规格型号（模型编码、尺寸参数等）"""
    if re.search(r"\d", token):
        return True
    if re.search(r"[-/.Φ×=#]", token):
        return True
    # 纯字母词（如 CPU、HDMI）不视为规格型号
    if re.fullmatch(r"[A-Za-z]+", token):
        return False
    return True


def _split_continuation(other_text: list, name_parts: list, spec_parts: list):
    """将续行文本拆分为名称续写和规格续写"""
    for line in other_text:
        line = line.strip()
        if not line:
            continue
        has_spec_pattern = bool(re.search(r"[A-Za-z]+\d|\d+[-*/.Φ×]", line))
        has_chinese = bool(re.search(r"[一-鿿]", line))
        if has_chinese and not has_spec_pattern:
            name_parts.append(line)
        elif has_spec_pattern and not has_chinese:
            spec_parts.append(line)
        elif has_chinese and has_spec_pattern:
            chinese = re.findall(r"[一-鿿]+", line)
            spec = re.sub(r"[一-鿿\s]+", " ", line).strip()
            if chinese:
                name_parts.extend(chinese)
            if spec:
                spec_parts.append(spec)
        else:
            spec_parts.append(line)


def _find_last_2decimal(tokens: list) -> float | None:
    """从右到左找第一个带2位小数的正数（税额），OCR可能丢失1位数字"""
    for t in reversed(tokens):
        t2 = t.replace(",", "")
        try:
            v = float(t2)
            if v > 0 and "." in t2 and len(t2.split(".")[1]) == 2:
                return v
        except ValueError:
            continue
    for t in reversed(tokens):
        t2 = t.replace(",", "")
        try:
            v = float(t2)
            if v > 0 and "." in t2 and len(t2.split(".")[1]) == 1:
                return v
        except ValueError:
            continue
    return None


def _find_tax_from_percent(tokens: list) -> float | None:
    """找 % 符号右侧相邻的数字作为税额（OCR 容错：税额可能只有1位小数）"""
    for i, t in enumerate(tokens):
        if t.endswith("%") or "%" in t:
            if i + 1 < len(tokens):
                try:
                    v = float(tokens[i + 1].replace(",", ""))
                    if v > 0:
                        return v
                except ValueError:
                    pass
            if i > 0:
                try:
                    v = float(tokens[i - 1].replace(",", ""))
                    if v > 0:
                        return v
                except ValueError:
                    pass
    return None


def _find_second_last_2decimal(tokens: list, exclude: float) -> float | None:
    """从右到左找第二个带2位小数的正数（金额），排除 exclude"""
    found_first = False
    for t in reversed(tokens):
        t = t.replace(",", "")
        try:
            v = float(t)
            if v > 0 and "." in t and len(t.split(".")[1]) == 2:
                if abs(v - exclude) < 0.001:
                    if not found_first:
                        found_first = True
                        continue
                if found_first:
                    return v
        except ValueError:
            continue
    if not found_first:
        for t in reversed(tokens):
            t = t.replace(",", "")
            try:
                v = float(t)
                if v > 0 and "." in t and len(t.split(".")[1]) == 2:
                    return v
            except ValueError:
                continue
    return None


def _split_off_unit(tokens: list):
    """OCR 容错：将含中文的 token 末尾单位字符拆分为独立 token"""
    for i in range(len(tokens) - 1, -1, -1):
        t = tokens[i]
        if not re.search(r"[一-鿿]", t):
            continue
        if i + 1 < len(tokens) and tokens[i + 1] in _UNITS:
            continue
        for unit in sorted(_UNITS, key=len, reverse=True):
            if t == unit:
                break
            if t.endswith(unit) and len(t) > len(unit):
                tokens[i] = t[:-len(unit)]
                tokens.insert(i + 1, unit)
                break


def _find_unit(tokens: list) -> tuple:
    """在 token 列表中找到计量单位（从右向左找，避免材料名中的字被误判为单位）"""
    for i in range(len(tokens) - 1, -1, -1):
        t = tokens[i]
        if t in _UNITS:
            for j in range(i + 1, len(tokens)):
                try:
                    float(tokens[j].replace(",", ""))
                    return t, i
                except ValueError:
                    continue
        else:
            for unit in sorted(_UNITS, key=len, reverse=True):
                if t.startswith(unit) and len(t) > len(unit):
                    for j in range(i + 1, len(tokens)):
                        try:
                            float(tokens[j].replace(",", ""))
                            return unit, i
                        except ValueError:
                            continue
    return "", -1


def _parse_qty_price(numeric_tokens: list, amount: float) -> tuple:
    """从数字 tokens 中解析数量和单价，支持粘连数字拆分"""
    clean = [t for t in numeric_tokens if not t.endswith("%")]
    if len(clean) == 0:
        return 0, 0
    elif len(clean) == 1:
        return _split_qty_price(clean[0], amount)
    elif len(clean) >= 2:
        try:
            qty = float(clean[0].replace(",", ""))
            price = float(clean[1].replace(",", ""))
            if amount > 0 and abs(qty * price - amount) / amount < 0.02:
                return qty, round(price, 2)
        except ValueError:
            pass
        return _split_qty_price(clean[0] + clean[1], amount)
    return 0, 0


def _split_qty_price(merged: str, amount: float) -> tuple:
    """尝试拆分粘连的数量+单价字符串，用量×价≈金额验证"""
    s = merged.replace(",", "")
    best_qty = 0
    best_price = 0
    best_error = float("inf")
    for split_pos in range(1, len(s)):
        if s[split_pos] == ".":
            continue
        qty_str = s[:split_pos]
        price_str = s[split_pos:]
        try:
            qty = float(qty_str)
            price = float(price_str)
            if qty <= 0 or price <= 0:
                continue
            if amount > 0:
                error = abs(qty * price - amount) / amount
                if error < best_error and error < 0.02:
                    best_error = error
                    best_qty = qty
                    best_price = round(price, 2)
        except ValueError:
            continue
    if best_qty > 0:
        return best_qty, best_price
    try:
        return 1, round(float(s), 2)
    except ValueError:
        return 0, 0


def _parse_one_row(row_lines: list) -> dict | None:
    """解析一个物料行的所有行（主行 + 续行），返回结构化字典"""
    main_idx = -1
    for i, line in enumerate(row_lines):
        if re.search(r"\d+\.\d+", line) and ("%" in line or re.search(r"\d+\.\d{2}", line)):
            main_idx = i
            break
    if main_idx < 0:
        return None
    main_line = row_lines[main_idx]
    other_text = []
    for i, line in enumerate(row_lines):
        if i != main_idx:
            other_text.append(line)
    tokens = main_line.split()
    _split_off_unit(tokens)
    tax_amount = _find_tax_from_percent(tokens)
    if tax_amount is None:
        tax_amount = _find_last_2decimal(tokens)
    if tax_amount is None:
        return None
    tax_rate_token = None
    tax_rate_idx = -1
    for i, t in enumerate(tokens):
        if t.endswith("%"):
            tax_rate_token = t
            tax_rate_idx = i
            break
    amount = _find_second_last_2decimal(tokens, tax_amount)
    if amount is None:
        amount = tax_amount
        tax_amount = 0
    unit, unit_idx = _find_unit(tokens)
    if unit_idx < 0:
        # 无单位项（如技术服务费）— 扫描第一个数字位置作为切分点
        for _nui, _t in enumerate(tokens):
            try:
                float(_t.replace(",", ""))
                unit_idx = _nui  # 数字从此开始，之前的都是名称
                after_unit = tokens[_nui:]
                break
            except ValueError:
                continue
        else:
            after_unit = []
    else:
        after_unit = tokens[unit_idx + 1:]
    remaining = list(after_unit)
    for i in range(len(remaining) - 1, -1, -1):
        try:
            v = float(remaining[i].replace(",", ""))
            if v > 0 and abs(v - tax_amount) < 0.001:
                remaining.pop(i)
                break
        except ValueError:
            continue
    for i in range(len(remaining) - 1, -1, -1):
        if remaining[i].endswith("%"):
            remaining.pop(i)
            break
    amount_token_idx = -1
    for i in range(len(remaining) - 1, -1, -1):
        t = remaining[i].replace(",", "")
        if "." in t:
            parts = t.split(".")
            if len(parts) == 2 and len(parts[1]) == 2:
                try:
                    v = float(t)
                    if abs(v - amount) < 0.01:
                        remaining.pop(i)
                        amount_token_idx = i
                        break
                except ValueError:
                    continue
    qty, price = _parse_qty_price(remaining, amount)
    name_tokens = tokens[:unit_idx] if unit_idx >= 0 else tokens[:]
    cont_name_parts = []
    cont_spec_parts = []
    has_continuation = bool(other_text)
    classification = ""
    if name_tokens:
        m = re.match(r"^\*([^*]+)\*", name_tokens[0])
        if m:
            classification = m.group(1)
    is_ferrous = ("黑色金属" in classification or "冶炼" in classification)
    if has_continuation and not is_ferrous:
        _split_continuation(other_text, cont_name_parts, cont_spec_parts)
    name_text = " ".join(name_tokens)
    if is_ferrous and has_continuation:
        name_text += " " + " ".join(other_text)
    elif cont_name_parts:
        parts_to_append = []
        for cp in cont_name_parts:
            if len(cp) == 1 and re.search(r"[一-鿿]", cp):
                name_text += cp
            else:
                parts_to_append.append(cp)
        if parts_to_append:
            name_text += " " + " ".join(parts_to_append)
    spec_from_cont = "" if is_ferrous else " ".join(cont_spec_parts).strip()
    clean_name, spec_from_name = _split_name_spec(name_text)
    final_spec = spec_from_name
    if spec_from_cont:
        if final_spec:
            final_spec += " " + spec_from_cont
        else:
            final_spec = spec_from_cont
    rate_val = 0
    if tax_rate_token:
        try:
            rate_val = float(tax_rate_token.replace("%", ""))
        except ValueError:
            pass
    return {
        "raw_name": name_text,
        "clean_name": clean_name,
        "spec": final_spec,
        "unit": unit,
        "quantity": qty,
        "unit_price": price,
        "amount": round(amount, 2),
        "tax_rate": rate_val,
        "tax_amount": round(tax_amount, 2),
    }


def _split_name_spec(raw_name: str) -> tuple:
    """根据分类前缀智能拆分物料名称和规格型号"""
    text = raw_name.strip()
    classification = ""
    m = re.match(r"^\*([^*]+)\*", text)
    if m:
        classification = m.group(1)
        text = text[m.end():]
    if "黑色金属" in classification or "冶炼" in classification:
        tokens = text.split()
        has_chinese_flag = [bool(re.search(r"[一-鿿]", t)) for t in tokens]
        _STEEL_GRADE = re.compile(r"[A-Za-z]\d+(?:[A-Za-z])?$")
        name_tokens = []
        spec_tokens = []
        in_spec = False
        for i, token in enumerate(tokens):
            has_chinese = has_chinese_flag[i]
            is_pure_chinese = bool(re.fullmatch(r"[一-鿿]+", token))
            is_single_letter = bool(re.fullmatch(r"[A-Za-z]", token))
            is_steel_grade = bool(_STEEL_GRADE.match(token))
            is_spec_with_chinese = (has_chinese and not is_pure_chinese
                                    and re.search(r"\d+[*×]", token))
            has_chinese_with_grade = (has_chinese and not is_pure_chinese
                                      and not is_spec_with_chinese
                                      and re.search(r"[A-Za-z]\d+(?:[A-Za-z])?$", token))
            if is_pure_chinese:
                name_tokens.append(token)
                in_spec = False
            elif is_spec_with_chinese:
                spec_tokens.append(token)
                in_spec = True
            elif is_single_letter and not in_spec:
                name_tokens.append(token)
            elif is_steel_grade and (not in_spec
                    or (i + 1 < len(tokens) and has_chinese_flag[i + 1])):
                name_tokens.append(token)
                in_spec = False
            elif has_chinese_with_grade:
                name_tokens.append(token)
                in_spec = False
            else:
                spec_tokens.append(token)
                in_spec = True
        name = "".join(name_tokens).strip()
        spec = re.sub(r"\s+", " ", " ".join(spec_tokens)).strip()
        return (name or text.strip(), spec)
    if "起重机" in classification or "起重设备" in classification:
        return _split_general_name_spec(text)
    if "电线电缆" in classification:
        m2 = re.match(r"^([一-鿿]+)", text)
        if m2:
            name = m2.group(1).strip()
            spec = text[m2.end():].strip()
            return (name, spec)
    return _split_general_name_spec(text)


def _split_general_name_spec(text: str) -> tuple:
    """通用名称/规格拆分：用中英文混合特征识别规格起点"""
    text = text.strip()
    tokens = text.split()
    name_tokens = []
    spec_tokens = []
    in_spec = False
    for i, token in enumerate(tokens):
        has_chinese = bool(re.search(r"[一-鿿]", token))
        if has_chinese:
            if re.search(r"[（（））]", token):
                name_tokens.append(token)
            elif re.search(r"\d+[*×]", token):
                spec_tokens.append(token)
            elif re.match(r"\d", token) and len(token) <= 5:
                spec_tokens.append(token)
            elif token in _SPEC_CHINESE_UNITS and spec_tokens:
                spec_tokens[-1] += token
            else:
                name_tokens.append(token)
            in_spec = False
        elif in_spec:
            spec_tokens.append(token)
        elif _is_spec_token(token):
            if (name_tokens and _DIMENSIONAL_UNITS_PATTERN.match(token)
                    and i + 1 < len(tokens) and re.search(r"[一-鿿]", tokens[i + 1])):
                name_tokens.append(token)
            else:
                spec_tokens.append(token)
                in_spec = True
        else:
            name_tokens.append(token)
    name = " ".join(name_tokens).strip()
    spec = " ".join(spec_tokens).strip()
    name = name.strip("*").strip()
    return (name, spec)


def _extract_table_rows(text: str) -> list:
    """从发票文本中提取表格行（物料明细）—— 支持多页合并"""
    lines = text.split("\n")
    sections = []
    header_pos = -1
    for i, line in enumerate(lines):
        if "项目名称" in line or "规格型号" in line:
            header_pos = i
        s_line = line.strip()
        if s_line.startswith("合 计") or re.search(r"(?:^|\s)合计[\s\d]", s_line) or "合计" in line[:6]:
            if header_pos >= 0:
                sections.append((header_pos, i))
            header_pos = -1
        if "价税合计" in line or "价税合计" in line:
            if header_pos >= 0:
                sections.append((header_pos, i))
            header_pos = -1
    if not sections:
        return []
    items = []
    for table_start, table_end in sections:
        data_lines = lines[table_start + 1:table_end]
        raw_rows = []
        current = []
        for line in data_lines:
            s = line.strip()
            if not s:
                continue
            if "小 计" in s or "小计" in s:
                continue
            if re.match(r"^[\d¥,.\s%]+$", s) and not re.search(r"[^\d¥,.\s%]", s):
                if not re.search(r"\d", s):
                    continue
                if "." in s and not any(c.isalpha() for c in s):
                    continue
            if "*" in s and not s.startswith("*"):
                m_cls = re.search(r"\*[^*]+\*", s)
                if m_cls and m_cls.start() > 0:
                    s = s[m_cls.start():]
            is_new_item = bool(re.match(r"^\*[^*]+\*", s))
            if is_new_item and current:
                raw_rows.append(current)
                current = [s]
            elif is_new_item:
                current = [s]
            elif current:
                current.append(s)
        if current:
            raw_rows.append(current)
        for row_lines in raw_rows:
            item = _parse_one_row(row_lines)
            if item:
                items.append(item)
    return items


def _match_by_classification(raw_name: str) -> str:
    """通过 raw_name 中的分类前缀匹配仓库（如 *黑色金属冶炼压延品* → 01-钢材）"""
    for keyword, warehouse in _CLASSIFICATION_MAP.items():
        if keyword in raw_name:
            return warehouse
    return "00-未分类"


def _dedupe_tripled_chars(text: str) -> str:
    """修复电子发票 PDF 中结构性文字每个中文字符重复 3 次的问题。

    某些电子发票 PDF（如京东工业品开具的）在 pdfplumber 提取时，
    标题、标签、表头等结构性文字的每个中文字符会重复 3 次，
    例如 '电电电子子子发发发票票票' → '电子发票'。
    数据行内容不受影响。
    仅对中文字符和全角标点去重，避免影响发票号码中的重复数字。
    """
    # CJK统一汉字 + CJK扩展A + 全角标点和符号
    return re.sub(r'([一-鿿㐀-䶿！-～　-〿])\1{2,}', r'\1', text)


def _extract_invoice_from_text(text: str, source: str = "pdf") -> dict | None:
    """从 PDF 文本或 OCR 识别文本中提取增值税发票的关键字段"""
    text = _dedupe_tripled_chars(text)

    invoice_no = ""
    m = re.search(r"发票号码[：:]\s*(\d+)", text)
    if m:
        invoice_no = m.group(1)

    issue_date = ""
    m = re.search(r"开[票标]日期[：:]\s*(\d{4})\s*[年]\s*(\d{1,2})\s*[月]\s*(\d{1,2})\s*[日]", text)
    if m:
        issue_date = f"{m.group(1)}-{m.group(2).zfill(2)}-{m.group(3).zfill(2)}"
    if not issue_date:
        m = re.search(r"(\d{4})\s*[年]\s*(\d{1,2})\s*[月]\s*(\d{1,2})\s*[日]", text)
        if m:
            issue_date = f"{m.group(1)}-{m.group(2).zfill(2)}-{m.group(3).zfill(2)}"

    is_special = ("增值税专用发票" in text or "值税专用发票" in text
                  or "用发票" in text)

    seller_name = ""
    m = re.search(r"销[售]?[方]?[信]?[息]?.*?名称[：:]\s*(\S+)", text)
    if m:
        seller_name = m.group(1).strip()
    if not seller_name:
        m = re.search(r"销\s*\n\s*([^\n]*有限公司)", text)
        if m:
            line = m.group(1)
            companies = re.findall(r"([^\s]*有限公司)", line)
            if companies:
                seller_name = companies[-1]
    if not seller_name:
        m = re.search(r"名称[：:]\s*(.{2,20}?有限公司)", text)
        if m:
            names = re.findall(r"名称[：:]\s*(.{2,30}?有限公司)", text)
            if len(names) >= 2:
                seller_name = names[-1]
            elif names:
                seller_name = names[0]
    if not seller_name:
        m = re.search(r"名称[：:]\s*(.{2,30})", text)
        if m:
            candidate = m.group(1).strip()
            if "名称" not in candidate:
                seller_name = candidate
    if not seller_name:
        companies = re.findall(r"([^\s]*有限公司)", text)
        if companies:
            seller_name = companies[-1]

    seller_tax_no = ""
    cleaned_text = re.sub(r"统一发票监[\s\n]*制[\s\n]*\w{20,}", "", text)
    tax_matches = re.findall(r"(?:纳税人识别号|统一社会信用代码|信用代码)[：:]*\s*(\w{15,20})", cleaned_text)
    if tax_matches:
        seller_tax_no = tax_matches[-1]
    if not seller_tax_no:
        companies = re.findall(r"([^\s]*有限公司)", text)
        if companies:
            seller_company = companies[-1]
            idx = text.find(seller_company)
            if idx >= 0:
                seller_region = text[idx:idx + 200]
                m = re.search(r"(?:纳税人识别号|统一社会信用代码|信用代码)[：:]*\s*(\w{15,20})", seller_region)
                if m:
                    seller_tax_no = m.group(1)
                if not seller_tax_no:
                    m = re.findall(r"[\s\n]*(\w{18})", seller_region)
                    if m:
                        seller_tax_no = m[-1]
    if not seller_tax_no and seller_name:
        seller_region = ""
        m = re.search(r"销.*", text, re.DOTALL)
        if m:
            seller_region = m.group(0)[:300]
        else:
            idx = text.find(seller_name)
            if idx >= 0:
                seller_region = text[idx:idx + 300]
        if seller_region:
            m2 = re.search(r"(?:纳税人识别号|统一社会信用代码|信用代码)[：:]*\s*(\w{15,20})", seller_region)
            if m2:
                seller_tax_no = m2.group(1)
            if not seller_tax_no:
                m3 = re.search(r"[\s：:\n]*(\w{18})", seller_region)
                if m3:
                    seller_tax_no = m3.group(1)

    raw_items = _extract_table_rows(text)

    total_amount = 0
    total_tax_amount = 0
    if raw_items:
        total_amount = sum(it["amount"] for it in raw_items)
        total_tax_amount = sum(it.get("tax_amount", 0) for it in raw_items)
    else:
        m = re.search(r"合计[计\s]*¥?\s*([\d,]+\.\d{2})", text)
        if m:
            total_amount = float(m.group(1).replace(",", ""))
        m2 = re.search(r"价税合计[（(]小写[)）]?[¥￥]?\s*([\d,]+\.\d{2})", text)
        if m2:
            total_with_tax = float(m2.group(1).replace(",", ""))
            total_tax_amount = round(total_with_tax - total_amount, 2)
        else:
            m3 = re.search(r"税额[：:]*\s*¥?\s*([\d,]+\.\d{2})", text)
            if m3:
                total_tax_amount = float(m3.group(1).replace(",", ""))
            else:
                total_tax_amount = 0

    items = raw_items if raw_items else []

    if not invoice_no and not seller_name and not items:
        return None

    warehouse = "00-未分类"
    wh_counts = {}
    for item in items:
        w = match_warehouse(item["clean_name"])
        if w == "00-未分类":
            w = _match_by_classification(item["raw_name"])
        if w != "00-未分类":
            wh_counts[w] = wh_counts.get(w, 0) + 1
    if wh_counts:
        warehouse = max(wh_counts, key=wh_counts.get)

    return {
        "invoice_no": invoice_no,
        "seller_name": seller_name,
        "issue_date": issue_date or datetime.now().strftime("%Y-%m-%d"),
        "total_amount": round(total_amount, 2),
        "total_tax_amount": round(total_tax_amount, 2),
        "is_special_tax": is_special,
        "seller_tax_no": seller_tax_no,
        "items": items,
        "warehouse": warehouse,
        "_source": source,
    }
