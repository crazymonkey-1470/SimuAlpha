from fastapi import Request
from fastapi.responses import JSONResponse


class SimuAlphaError(Exception):
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code


class NotFoundError(SimuAlphaError):
    def __init__(self, message: str = "Resource not found"):
        super().__init__(message=message, status_code=404)


class ValidationError(SimuAlphaError):
    def __init__(self, message: str = "Validation failed"):
        super().__init__(message=message, status_code=422)


class UnauthorizedError(SimuAlphaError):
    def __init__(self, message: str = "Not authenticated"):
        super().__init__(message=message, status_code=401)


class ForbiddenError(SimuAlphaError):
    def __init__(self, message: str = "Forbidden"):
        super().__init__(message=message, status_code=403)


async def simualpha_error_handler(_request: Request, exc: SimuAlphaError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.message, "status_code": exc.status_code},
    )
