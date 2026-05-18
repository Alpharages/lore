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

export const forbidden = (): AppError => {
  return new AppError(403, "forbidden", "Forbidden");
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

export const lessonNotFound = (lessonId: string): AppError => {
  return new AppError(404, "LESSON_NOT_FOUND", `Lesson ${lessonId} not found`);
};

export const repositoryNotFound = (repoSlug: string): AppError => {
  return new AppError(
    404,
    "repository_not_found",
    `Repository "${repoSlug}" not found for this project`
  );
};

export const notFoundError = (message: string): AppError => {
  return new AppError(404, "not_found", message);
};
