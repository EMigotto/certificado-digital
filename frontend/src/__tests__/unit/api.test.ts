import { describe, it, expect } from 'vitest';
import { getApiErrorMessage } from '@/services/api';
import { AxiosError, AxiosHeaders } from 'axios';

function makeAxiosError(status: number, message?: string): AxiosError {
  const headers = new AxiosHeaders();
  const error = new AxiosError(
    'Request failed',
    status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST',
    undefined,
    undefined,
    {
      status,
      statusText: '',
      headers,
      config: { headers },
      data: message ? { message } : undefined,
    },
  );
  return error;
}

function makeNetworkError(): AxiosError {
  const error = new AxiosError('Network Error', 'ERR_NETWORK');
  return error;
}

function makeCancelError(): AxiosError {
  const error = new AxiosError('Request cancelled', 'ERR_CANCELED');
  return error;
}

describe('getApiErrorMessage', () => {
  it('returns server message for 400 error', () => {
    const err = makeAxiosError(400, 'Dados inválidos no campo CN.');
    expect(getApiErrorMessage(err)).toBe('Dados inválidos no campo CN.');
  });

  it('returns default message for 400 without server message', () => {
    const err = makeAxiosError(400);
    expect(getApiErrorMessage(err)).toBe('Dados inválidos.');
  });

  it('returns message for 404 error', () => {
    const err = makeAxiosError(404);
    expect(getApiErrorMessage(err)).toBe('Recurso não encontrado.');
  });

  it('returns message for 409 duplicate error', () => {
    const err = makeAxiosError(409);
    expect(getApiErrorMessage(err)).toBe('Certificado duplicado.');
  });

  it('returns message for 422 validation error', () => {
    const err = makeAxiosError(422);
    expect(getApiErrorMessage(err)).toBe('Erro de validação.');
  });

  it('returns server error message for 500', () => {
    const err = makeAxiosError(500);
    expect(getApiErrorMessage(err)).toBe('Erro no servidor. Tente novamente.');
  });

  it('returns network error message', () => {
    const err = makeNetworkError();
    expect(getApiErrorMessage(err)).toBe('Erro de rede. Verifique sua conexão.');
  });

  it('returns cancelled message', () => {
    const err = makeCancelError();
    expect(getApiErrorMessage(err)).toBe('Requisição cancelada.');
  });

  it('handles generic Error', () => {
    const err = new Error('Something broke');
    expect(getApiErrorMessage(err)).toBe('Something broke');
  });

  it('handles unknown error type', () => {
    expect(getApiErrorMessage('oops')).toBe('Erro desconhecido.');
  });
});
