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

export function unauthorized(): AppError {
  return new AppError(401, "unauthorized", "Unauthorized");
}

export function adminUnauthorized(): AppError {
  return new AppError(401, "admin_auth_required", "Admin auth required");
}

export function rateLimited(retryAfter: number): AppError {
  return new AppError(
    429,
    "rate_limited",
    "Too many requests",
    { "Retry-After": String(retryAfter) }
  );
}

export function validationError(message: string): AppError {
  return new AppError(400, "validation_error", message);
}

export function conflictError(message: string): AppError {
  return new AppError(409, "conflict", message);
}
