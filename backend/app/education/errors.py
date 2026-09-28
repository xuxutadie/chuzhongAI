class EducationError(ValueError):
    """仅向调用者暴露安全、可理解的错误，不包含内部资源详情。"""

    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.status_code = status_code
