export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public headers?: Record<string, string>
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const unauthorized = (): AppError => {
  return new AppError(401, "unauthorized", "Unauthorized");
};

export const adminUnauthorized = (): AppError => {
  return new AppError(401, "admin_auth_required", "Admin auth required");
};

export const rateLimited = (retryAfter: number): AppError => {
  return new AppError(429, "rate_limited", "Too many requests", {
    "Retry-After": String(retryAfter),
  });
};

export const validationError = (message: string): AppError => {
  return new AppError(400, "validation_error", message);
};

export const conflictError = (message: string): AppError => {
  return new AppError(409, "conflict", message);
};
