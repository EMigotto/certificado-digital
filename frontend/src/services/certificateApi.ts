import axios from 'axios';
import type { Certificate } from '@certificado-digital/shared';

const api = axios.create({ baseURL: '/api' });

/** Fetch a single certificate by ID */
export async function getCertificate(id: string): Promise<Certificate> {
  const { data } = await api.get<Certificate>(`/certificates/${id}`);
  return data;
}

/** Export certificate in the given format — returns a Blob for download */
export async function exportCertificate(
  id: string,
  format: 'pem' | 'json',
): Promise<{ blob: Blob; filename: string }> {
  const { data, headers } = await api.get(`/certificates/${id}/export`, {
    params: { format },
    responseType: 'blob',
  });

  const disposition = headers['content-disposition'] as string | undefined;
  const fallbackExt = format === 'pem' ? '.pem' : '.json';
  const filename =
    disposition?.match(/filename="?(.+?)"?$/)?.[1] ?? `certificate-${id}${fallbackExt}`;

  return { blob: data as Blob, filename };
}

/** Soft-delete (revoke) a certificate */
export async function revokeCertificate(id: string): Promise<void> {
  await api.patch(`/certificates/${id}/revoke`);
}

/** Hard-delete a certificate */
export async function deleteCertificate(id: string): Promise<void> {
  await api.delete(`/certificates/${id}`);
}
