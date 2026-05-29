/**
 * Timeline API client — fetches certificate lifecycle timeline events.
 */

import axios from 'axios';
import type { TimelineEvent } from '@certificado-digital/shared';

const api = axios.create({ baseURL: '/api' });

/** Fetch timeline events for a single certificate */
export async function getCertificateTimeline(certificateId: string): Promise<TimelineEvent[]> {
  const { data } = await api.get<TimelineEvent[]>(
    `/certificates/${certificateId}/timeline`,
  );
  return data;
}
