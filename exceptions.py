"""自定义异常类 — 统一错误处理"""


class BusinessError(Exception):
    """业务逻辑错误 — 400"""
    def __init__(self, message="请求参数错误", code="BAD_REQUEST"):
        self.code = code
        self.message = message
        self.http_status = 400
        super().__init__(self.message)


class AuthError(Exception):
    """认证错误 — 401"""
    def __init__(self, message="未登录或登录已失效", code="AUTH_FAILED"):
        self.code = code
        self.message = message
        self.http_status = 401
        super().__init__(self.message)


class ForbiddenError(Exception):
    """权限错误 — 403"""
    def __init__(self, message="无权操作", code="FORBIDDEN"):
        self.code = code
        self.message = message
        self.http_status = 403
        super().__init__(self.message)


class NotFoundError(Exception):
    """资源不存在 — 404"""
    def __init__(self, message="资源不存在", code="NOT_FOUND"):
        self.code = code
        self.message = message
        self.http_status = 404
        super().__init__(self.message)


class ConflictError(Exception):
    """并发冲突 — 409"""
    def __init__(self, message="数据已被其他人修改，请刷新后重试", code="CONFLICT"):
        self.code = code
        self.message = message
        self.http_status = 409
        super().__init__(self.message)
