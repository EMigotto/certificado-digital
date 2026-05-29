/**
 * Zod validation schemas for lifecycle operations.
 *
 * Used with React Hook Form (@hookform/resolvers/zod) on the frontend forms
 * for issuance, renewal, and revocation.
 */

import { z } from 'zod';

// ─── Shared constants ───────────────────────────────────────────────────────

/** Regex for validating FQDN Common Names */
const FQDN_REGEX = /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.[a-zA-Z0-9-]{1,63})*\.[a-zA-Z]{2,}$/;

/** Key algorithm options */
const KEY_ALGORITHMS = ['RSA-2048', 'RSA-4096', 'ECDSA-P256', 'ECDSA-P384'] as const;

/** RFC 5280 revocation reason codes */
const REVOCATION_REASON_CODES = [
  'unspecified',
  'keyCompromise',
  'cACompromise',
  'affiliationChanged',
  'superseded',
  'cessationOfOperation',
  'certificateHold',
  'removeFromCRL',
  'privilegeWithdrawn',
  'aACompromise',
] as const;

/** CSR source options */
const CSR_SOURCES = ['generate', 'upload'] as const;

/** Environment options */
const ENVIRONMENTS = ['DEV', 'HML', 'PRD'] as const;

// ─── Issue Certificate ──────────────────────────────────────────────────────

/**
 * Validation schema for the issue certificate form.
 *
 * Validates:
 * - commonName must be a valid FQDN
 * - SANs (optional) must each be valid FQDNs
 * - keyAlgorithm must be one of the supported algorithms
 * - csrSource must be "generate" or "upload"
 * - caId is required
 * - owner and application are required non-empty strings
 * - environment must be DEV, HML, or PRD
 * - validityDays must be between 1 and 825 (CA/B Forum max)
 */
export const issueCertificateSchema = z
  .object({
    commonName: z
      .string()
      .min(1, 'Common Name é obrigatório')
      .regex(FQDN_REGEX, 'Common Name deve ser um FQDN válido (ex: api.bank.internal)'),
    sans: z
      .array(
        z.string().regex(FQDN_REGEX, 'Cada SAN deve ser um FQDN válido'),
      )
      .default([]),
    keyAlgorithm: z.enum(KEY_ALGORITHMS, {
      errorMap: () => ({ message: 'Selecione um algoritmo de chave válido' }),
    }),
    csrSource: z.enum(CSR_SOURCES, {
      errorMap: () => ({ message: 'Selecione a origem do CSR' }),
    }),
    csrPem: z.string().nullable().default(null),
    caId: z.string().min(1, 'Selecione uma Autoridade Certificadora'),
    owner: z.string().min(1, 'Owner é obrigatório'),
    team: z.string().nullable().default(null),
    application: z.string().min(1, 'Aplicação é obrigatória'),
    environment: z.enum(ENVIRONMENTS, {
      errorMap: () => ({ message: 'Selecione um ambiente válido' }),
    }),
    zone: z.string().nullable().default(null),
    validityDays: z
      .number({ invalid_type_error: 'Dias de validade deve ser um número' })
      .int('Dias de validade deve ser um inteiro')
      .min(1, 'Mínimo de 1 dia')
      .max(825, 'Máximo de 825 dias (limite CA/B Forum)'),
    description: z.string().nullable().default(null),
    tags: z.record(z.string(), z.string()).default({}),
  })
  .refine(
    (data) => {
      if (data.csrSource === 'upload') {
        return data.csrPem !== null && data.csrPem.trim().length > 0;
      }
      return true;
    },
    {
      message: 'CSR PEM é obrigatório quando a origem é "upload"',
      path: ['csrPem'],
    },
  );

/** Inferred type from the issuance schema */
export type IssueCertificateFormData = z.infer<typeof issueCertificateSchema>;

// ─── Renew Certificate ──────────────────────────────────────────────────────

/**
 * Validation schema for the renew certificate form.
 *
 * Validates:
 * - validityDays must be between 1 and 825
 * - rotateKey is a boolean flag
 * - keyAlgorithm is optional (required only when rotateKey is true)
 */
export const renewCertificateSchema = z
  .object({
    validityDays: z
      .number({ invalid_type_error: 'Dias de validade deve ser um número' })
      .int('Dias de validade deve ser um inteiro')
      .min(1, 'Mínimo de 1 dia')
      .max(825, 'Máximo de 825 dias (limite CA/B Forum)'),
    rotateKey: z.boolean().default(false),
    keyAlgorithm: z
      .enum(KEY_ALGORITHMS, {
        errorMap: () => ({ message: 'Selecione um algoritmo de chave válido' }),
      })
      .nullable()
      .default(null),
  })
  .refine(
    (data) => {
      if (data.rotateKey) {
        return data.keyAlgorithm !== null;
      }
      return true;
    },
    {
      message: 'Selecione um algoritmo ao rotacionar a chave',
      path: ['keyAlgorithm'],
    },
  );

/** Inferred type from the renewal schema */
export type RenewCertificateFormData = z.infer<typeof renewCertificateSchema>;

// ─── Revoke Certificate ─────────────────────────────────────────────────────

/** Minimum justification length for revocations */
const MIN_JUSTIFICATION_LENGTH = 10;

/**
 * Validation schema for the revoke certificate form.
 *
 * Validates:
 * - reasonCode must be a valid RFC 5280 reason code
 * - justification must be at least 10 characters (audit compliance)
 */
export const revokeCertificateSchema = z.object({
  reasonCode: z.enum(REVOCATION_REASON_CODES, {
    errorMap: () => ({ message: 'Selecione um motivo de revogação' }),
  }),
  justification: z
    .string()
    .min(
      MIN_JUSTIFICATION_LENGTH,
      `Justificativa deve ter pelo menos ${MIN_JUSTIFICATION_LENGTH} caracteres`,
    ),
});

/** Inferred type from the revocation schema */
export type RevokeCertificateFormData = z.infer<typeof revokeCertificateSchema>;
