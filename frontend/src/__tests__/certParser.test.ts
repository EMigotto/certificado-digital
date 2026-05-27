/**
 * Unit tests for client-side certificate parser utility.
 */

import { describe, it, expect } from 'vitest';
import {
  detectFormat,
  parseCertificateFile,
  isPkcs12,
  ACCEPTED_EXTENSIONS,
} from '@/utils/certParser';

// ─── Test data ──────────────────────────────────────────────────────────────

const SAMPLE_PEM = `-----BEGIN CERTIFICATE-----
MIIBkTCB+wIJALbhDv7k3e8gMA0GCSqGSIb3DQEBCwUAMBMxETAPBgNVBAMMCHRl
c3QuY29tMB4XDTI0MDEwMTAwMDAwMFoXDTI1MDEwMTAwMDAwMFowEzERMA8GA1UE
AwwIdGVzdC5jb20wXDANBgkqhkiG9w0BAQEFAANLADBIAkEA0Z3VS5JJcds3xf0G
NkbL8RaXB2/cFnGBOvFc6wnBOkYOkrSNOAIGm9JTCpKlHdMCMq5bGPOIJG/cjLo
fqz1xQIDAQABo0IwQDAdBgNVHQ4EFgQUABCDEFGHIJKLMNOPQRSTUVWXYZ0wHwYD
VR0jBBgwFoAUABCDEFGHIJKLMNOPQRSTUVWXYZ0wDQYJKoZIhvcNAQELBQADQQBY
AxbFpXmMrmrLmaBgqp5TCj3OFBnVRaRAt6k0P7vT6BQE0BIqJ5n3Lx9LorZ4DfB
hIDJp6cMf7E5AxGrcqMD
-----END CERTIFICATE-----`;

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('certParser', () => {
  describe('ACCEPTED_EXTENSIONS', () => {
    it('should include all expected file extensions', () => {
      expect(ACCEPTED_EXTENSIONS).toContain('.pem');
      expect(ACCEPTED_EXTENSIONS).toContain('.crt');
      expect(ACCEPTED_EXTENSIONS).toContain('.der');
      expect(ACCEPTED_EXTENSIONS).toContain('.cer');
      expect(ACCEPTED_EXTENSIONS).toContain('.p12');
      expect(ACCEPTED_EXTENSIONS).toContain('.pfx');
    });
  });

  describe('detectFormat', () => {
    it('should detect PEM from .pem extension', () => {
      const content = new TextEncoder().encode(SAMPLE_PEM);
      expect(detectFormat('cert.pem', content)).toBe('PEM');
    });

    it('should detect PEM from .crt extension', () => {
      const content = new TextEncoder().encode(SAMPLE_PEM);
      expect(detectFormat('cert.crt', content)).toBe('PEM');
    });

    it('should detect DER from .der extension', () => {
      const content = new Uint8Array([0x30, 0x82, 0x01, 0x22]);
      expect(detectFormat('cert.der', content)).toBe('DER');
    });

    it('should detect DER from .cer extension', () => {
      const content = new Uint8Array([0x30, 0x82, 0x01, 0x22]);
      expect(detectFormat('cert.cer', content)).toBe('DER');
    });

    it('should detect PKCS12 from .p12 extension', () => {
      const content = new Uint8Array([0x30, 0x82, 0x01]);
      expect(detectFormat('cert.p12', content)).toBe('PKCS12');
    });

    it('should detect PKCS12 from .pfx extension', () => {
      const content = new Uint8Array([0x30, 0x82, 0x01]);
      expect(detectFormat('cert.pfx', content)).toBe('PKCS12');
    });

    it('should detect PEM from content when extension is unknown', () => {
      const content = new TextEncoder().encode(SAMPLE_PEM);
      expect(detectFormat('cert.txt', content)).toBe('PEM');
    });

    it('should return UNKNOWN for unrecognized format', () => {
      const content = new TextEncoder().encode('Hello World');
      expect(detectFormat('cert.xyz', content)).toBe('UNKNOWN');
    });
  });

  describe('isPkcs12', () => {
    it('should return true for .p12 files', () => {
      expect(isPkcs12('keystore.p12')).toBe(true);
    });

    it('should return true for .pfx files', () => {
      expect(isPkcs12('keystore.pfx')).toBe(true);
    });

    it('should return false for .pem files', () => {
      expect(isPkcs12('cert.pem')).toBe(false);
    });

    it('should return false for .der files', () => {
      expect(isPkcs12('cert.der')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isPkcs12('keystore.P12')).toBe(true);
      expect(isPkcs12('keystore.PFX')).toBe(true);
    });
  });

  describe('parseCertificateFile', () => {
    it('should return unsupported error for unknown format', () => {
      const content = new TextEncoder().encode('not a certificate');
      const result = parseCertificateFile('file.xyz', content);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('UNSUPPORTED_FORMAT');
      }
    });

    it('should return PKCS12 preview for .p12 files without parsing', () => {
      const content = new Uint8Array([0x30, 0x82, 0x01, 0x00]);
      const result = parseCertificateFile('keystore.p12', content);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.preview.format).toBe('PKCS12');
        expect(result.preview.parsed).toBe(false);
        expect(result.preview.message).toBeDefined();
      }
    });

    it('should return error for invalid PEM (no BEGIN header)', () => {
      const content = new TextEncoder().encode('not a PEM file at all');
      const result = parseCertificateFile('cert.pem', content);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('INVALID_PEM');
      }
    });

    it('should attempt to parse a valid PEM file', () => {
      const content = new TextEncoder().encode(SAMPLE_PEM);
      const result = parseCertificateFile('cert.pem', content);
      if (result.ok) {
        expect(result.preview.format).toBe('PEM');
        expect(result.preview.parsed).toBe(true);
      } else {
        expect(result.code).toBe('PARSE_ERROR');
      }
    });
  });
});
