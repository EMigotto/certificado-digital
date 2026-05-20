/**
 * Tags & custom fields management.
 * Maps to AC 2.3, 6.2, 6.3.
 */

import type { Certificate } from './certificate.js';

/**
 * Add a key:value tag to a certificate (AC 2.3, 6.2).
 * Returns a new certificate with the tag added (immutable).
 */
export function addTag(cert: Certificate, key: string, value: string): Certificate {
  return {
    ...cert,
    tags: { ...cert.tags, [key]: value },
  };
}

/**
 * Remove a tag from a certificate (AC 2.3).
 */
export function removeTag(cert: Certificate, key: string): Certificate {
  const { [key]: _, ...rest } = cert.tags;
  return { ...cert, tags: rest };
}

/**
 * Filter certificates that have a specific tag (AC 6.2).
 */
export function filterByTag(certs: Certificate[], key: string, value: string): Certificate[] {
  return certs.filter((c) => c.tags[key] === value);
}

/**
 * Set a custom field on a certificate (AC 6.3).
 * Custom fields use flexible JSON storage — no migration needed.
 */
export function setCustomField(cert: Certificate, field: string, value: unknown): Certificate {
  return {
    ...cert,
    customFields: { ...cert.customFields, [field]: value },
  };
}

/**
 * Check if a custom field exists (AC 6.3).
 */
export function hasCustomField(cert: Certificate, field: string): boolean {
  return field in cert.customFields;
}
