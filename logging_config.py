"""日志配置 — RotatingFileHandler"""
import os
import logging
from logging.handlers import RotatingFileHandler


def setup_logging(app=None):
    """配置日志：按大小轮转，保留最近30天"""
    log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
    os.makedirs(log_dir, exist_ok=True)

    log_file = os.path.join(log_dir, "app.log")

    handler = RotatingFileHandler(
        log_file,
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=30,
        encoding="utf-8",
    )
    handler.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    ))
    handler.setLevel(logging.DEBUG)

    # 配置根 logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)
    # 避免重复添加 handler
    if not any(isinstance(h, RotatingFileHandler) for h in root_logger.handlers):
        root_logger.addHandler(handler)

    # 如果传入了 app，也配置 app.logger
    if app:
        app.logger.setLevel(logging.DEBUG)
        if not any(isinstance(h, RotatingFileHandler) for h in app.logger.handlers):
            app.logger.addHandler(handler)

    return handler
