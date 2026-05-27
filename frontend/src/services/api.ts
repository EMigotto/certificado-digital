import axios from 'axios';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';

/**
 * Axios instance with:
 * - Base URL pointing to /api
 * - 30-second timeout for long imports
 * - Retry interceptor: 3 attempts with exponential backoff on 5xx errors
 */
export const api = axios.create({
  baseURL: '/api',
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/** Max number of retry attempts for server errors */
const MAX_RETRIES = 3;

/** Base delay in ms for exponential backoff */
const BASE_DELAY = 1000;

interface RetryConfig extends InternalAxiosRequestConfig {
  _retryCount?: number;
}

/**
 * Delay helper for exponential backoff.
 * delay = BASE_DELAY * 2^attempt (1s, 2s, 4s)
 */
function getRetryDelay(attempt: number): number {
  return BASE_DELAY * Math.pow(2, attempt);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Response interceptor: retry on 5xx errors
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetryConfig | undefined;

    // Don't retry if no config, request was cancelled, or non-5xx error
    if (!config) return Promise.reject(error);

    const status = error.response?.status ?? 0;
    const isServerError = status >= 500 && status < 600;
    const isNetworkError = !error.response && error.code !== 'ERR_CANCELED';

    if (!isServerError && !isNetworkError) {
      return Promise.reject(error);
    }

    const retryCount = config._retryCount ?? 0;

    if (retryCount >= MAX_RETRIES) {
      return Promise.reject(error);
    }

    config._retryCount = retryCount + 1;

    const delay = getRetryDelay(retryCount);
    await sleep(delay);

    return api(config);
  },
);

/**
 * Type-safe API error extractor.
 * Returns a user-friendly error message from Axios errors.
 */
export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const serverMessage = error.response?.data?.message;

    if (error.code === 'ERR_CANCELED') {
      return 'Requisição cancelada.';
    }

    if (!error.response) {
      return 'Erro de rede. Verifique sua conexão.';
    }

    if (status === 400) return serverMessage || 'Dados inválidos.';
    if (status === 404) return serverMessage || 'Recurso não encontrado.';
    if (status === 409) return serverMessage || 'Certificado duplicado.';
    if (status === 422) return serverMessage || 'Erro de validação.';
    if (status && status >= 500) return 'Erro no servidor. Tente novamente.';

    return serverMessage || 'Erro inesperado.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Erro desconhecido.';
}
