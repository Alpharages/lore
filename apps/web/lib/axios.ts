import axios, { type AxiosInstance } from "axios";

const LORE_API_URL = process.env.NEXT_PUBLIC_LORE_API_URL ?? "";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const createApiClient = (): AxiosInstance => {
  const client = axios.create({
    baseURL: LORE_API_URL,
    withCredentials: true,
    headers: { "Content-Type": "application/json" },
  });

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

export const apiClient = createApiClient();
