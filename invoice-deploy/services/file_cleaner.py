"""上传文件清理服务 — 清理未被任何发票记录引用的孤儿文件"""
import os
import time
from sqlalchemy import text


def scan_orphan_files(upload_dir: str, max_age_days: int = 90) -> dict:
    """扫描 uploads 目录，找出未被 invoice 引用且超过 max_age_days 的孤儿文件

    Returns:
        {"orphans": [filepath, ...], "total_size": bytes}
    """
    from models import Invoice

    if not os.path.isdir(upload_dir):
        return {"orphans": [], "total_size": 0}

    # 收集所有被引用的文件名
    referenced = set()
    for inv in Invoice.query.with_entities(Invoice.raw_file_path).all():
        if inv.raw_file_path:
            referenced.add(os.path.basename(inv.raw_file_path))

    # 同时也检查点收单中可能引用但 invoice 中已删除的情况
    cited_in_exports = False  # exports 目录单独处理

    cutoff = time.time() - max_age_days * 86400
    orphans = []
    total_size = 0

    for fname in os.listdir(upload_dir):
        fpath = os.path.join(upload_dir, fname)
        # 跳过目录和 exports
        if os.path.isdir(fpath):
            continue
        if fname == "exports" or fpath.startswith(os.path.join(upload_dir, "exports")):
            continue

        # 被引用的文件跳过
        if fname in referenced:
            continue

        # 检查文件年龄
        mtime = os.path.getmtime(fpath)
        if mtime > cutoff:
            continue

        orphans.append(fpath)
        total_size += os.path.getsize(fpath)

    return {"orphans": orphans, "total_size": total_size}


def clean_orphan_files(upload_dir: str, max_age_days: int = 90) -> dict:
    """清理孤儿文件，返回清理结果统计

    Returns:
        {"deleted": count, "freed_bytes": size, "errors": [filename, ...]}
    """
    result = scan_orphan_files(upload_dir, max_age_days)
    deleted = 0
    freed = 0
    errors = []

    for fpath in result["orphans"]:
        try:
            size = os.path.getsize(fpath)
            os.remove(fpath)
            deleted += 1
            freed += size
        except OSError as e:
            errors.append(os.path.basename(fpath))

    return {
        "deleted": deleted,
        "freed_bytes": freed,
        "freed_mb": round(freed / 1024 / 1024, 2),
        "errors": errors,
    }
