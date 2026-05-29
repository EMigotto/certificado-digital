/**
 * Frontend-local certificate lifecycle types.
 *
 * CertificateStatus is computed from notAfter date and revocation state.
 * This is separate from CertStatus (backend API status in shared types).
 */

import type { Certificate } from '@certificado-digital/shared';

/** Computed display status for UI rendering */
export type CertificateStatus =
  | 'pending'
  | 'issued'
  | 'active'
  | 'expiring'
  | 'renewed'
  | 'expired'
  | 'revoked';

/** RFC 5280 revocation reason code */
export interface RevocationReason {
  code: number;
  label: string;
  description: string;
}

/** RFC 5280 §5.3.1 CRL Reason Codes */
export const RFC5280_REASONS: RevocationReason[] = [
  { code: 0, label: 'Unspecified', description: 'No specific reason provided' },
  { code: 1, label: 'Key Compromise', description: 'The private key was compromised' },
  { code: 2, label: 'CA Compromise', description: 'The issuing CA was compromised' },
  {
    code: 3,
    label: 'Affiliation Changed',
    description: 'The subject affiliation has changed',
  },
  {
    code: 4,
    label: 'Superseded',
    description: 'The certificate has been superseded by a new one',
  },
  {
    code: 5,
    label: 'Cessation of Operation',
    description: 'The certificate is no longer needed',
  },
  {
    code: 6,
    label: 'Certificate Hold',
    description: 'The certificate is temporarily suspended',
  },
  {
    code: 9,
    label: 'Privilege Withdrawn',
    description: 'Privileges granted have been withdrawn',
  },
  {
    code: 10,
    label: 'AA Compromise',
    description: 'The attribute authority was compromised',
  },
];

/** Extended certificate with lifecycle fields (optional, graceful for old API) */
export interface CertificateWithLifecycle extends Certificate {
  renewalParentId?: string | null;
  renewalChildId?: string | null;
  renewalParentCn?: string | null;
  renewalChildCn?: string | null;
  revocationJustification?: string | null;
  revokedBy?: string | null;
}

/** Params for renewal API call */
export interface RenewalParams {
  rotateKey: boolean;
  validityDays: number;
  notifyOwner: boolean;
}

/** Params for revocation API call with reason */
export interface RevocationParams {
  reasonCode: number;
  justification?: string;
  notifyOwner: boolean;
}
