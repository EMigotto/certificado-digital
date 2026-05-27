/**
 * TanStack Query mutation hooks for bulk CSV import.
 *
 * Two mutations:
 * 1. Preview — upload CSV for validation without importing
 * 2. Execute — confirm and import valid rows
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import {
  previewCsvImport,
  executeCsvImport,
  type CsvPreviewResponse,
  type CsvImportSummary,
} from '@/services/certificateApi';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BulkImportError {
  type: 'header_error' | 'network';
  message: string;
  headerErrors?: string[];
}

// ─── Preview hook ───────────────────────────────────────────────────────────

export function useCsvPreview() {
  return useMutation<CsvPreviewResponse, BulkImportError, File>({
    mutationFn: async (file: File) => {
      try {
        return await previewCsvImport(file);
      } catch (err) {
        if (err instanceof AxiosError && err.response) {
          const { status, data } = err.response;

          if (status === 422 && data?.headerErrors) {
            throw {
              type: 'header_error',
              message: data.message ?? 'Erro de validação no cabeçalho do CSV',
              headerErrors: data.headerErrors,
            } as BulkImportError;
          }

          throw {
            type: 'network',
            message: data?.message ?? `Erro do servidor (${status})`,
          } as BulkImportError;
        }

        throw {
          type: 'network',
          message: err instanceof Error ? err.message : 'Erro de rede. Tente novamente.',
        } as BulkImportError;
      }
    },
  });
}

// ─── Execute hook ───────────────────────────────────────────────────────────

export function useCsvExecute() {
  const queryClient = useQueryClient();

  return useMutation<CsvImportSummary, BulkImportError, File>({
    mutationFn: async (file: File) => {
      try {
        return await executeCsvImport(file);
      } catch (err) {
        if (err instanceof AxiosError && err.response) {
          throw {
            type: 'network',
            message: err.response.data?.message ?? `Erro do servidor (${err.response.status})`,
          } as BulkImportError;
        }

        throw {
          type: 'network',
          message: err instanceof Error ? err.message : 'Erro de rede. Tente novamente.',
        } as BulkImportError;
      }
    },

    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['certificates'] });
    },
  });
}
