/**
 * TanStack Query mutation hook for single certificate import.
 *
 * Handles file upload with metadata, duplicate detection (409),
 * invalid file errors (422), and unsupported format (415).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import {
  importCertificate,
  type ImportMetadata,
  type ImportSuccessResponse,
  type DuplicateInfo,
} from '@/services/certificateApi';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ImportCertificateParams {
  file: File;
  metadata: ImportMetadata;
  password?: string;
}

export interface DuplicateErrorPayload {
  statusCode: 409;
  error: string;
  message: string;
  duplicate: DuplicateInfo;
}

export interface InvalidFileErrorPayload {
  statusCode: 422;
  error: string;
  message: string;
  code: string;
}

export interface UnsupportedFormatErrorPayload {
  statusCode: 415;
  error: string;
  message: string;
  supportedFormats: string[];
}

export type ImportError =
  | { type: 'duplicate'; data: DuplicateErrorPayload }
  | { type: 'invalid'; data: InvalidFileErrorPayload }
  | { type: 'unsupported'; data: UnsupportedFormatErrorPayload }
  | { type: 'network'; message: string };

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useImportCertificate() {
  const queryClient = useQueryClient();

  return useMutation<ImportSuccessResponse, ImportError, ImportCertificateParams>({
    mutationFn: async ({ file, metadata, password }: ImportCertificateParams) => {
      try {
        return await importCertificate(file, metadata, password);
      } catch (err) {
        if (err instanceof AxiosError && err.response) {
          const { status, data } = err.response;

          if (status === 409) {
            throw { type: 'duplicate', data } as ImportError;
          }
          if (status === 422) {
            throw { type: 'invalid', data } as ImportError;
          }
          if (status === 415) {
            throw { type: 'unsupported', data } as ImportError;
          }

          throw {
            type: 'network',
            message: data?.message ?? `Erro do servidor (${status})`,
          } as ImportError;
        }

        throw {
          type: 'network',
          message: err instanceof Error ? err.message : 'Erro de rede. Tente novamente.',
        } as ImportError;
      }
    },

    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['certificates'] });
    },
  });
}
