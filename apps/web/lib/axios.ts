import axios, { type AxiosInstance } from "axios";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const applyInterceptors = (client: AxiosInstance): AxiosInstance => {
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = error.response?.status ?? 0;
      const message = error.response?.data?.message ?? error.message;

      if (status === 401 && typeof window !== "undefined") {
        window.location.href = "/login";
      }

      return Promise.reject(new ApiError(status, message));
    }
  );
  return client;
};

export const internalApiClient = applyInterceptors(
  axios.create({
    withCredentials: true,
    headers: { "Content-Type": "application/json" },
  })
);
