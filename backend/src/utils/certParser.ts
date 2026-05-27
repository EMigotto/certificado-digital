/**
 * Certificate parsing utilities.
 *
 * Handles PEM, PKCS#12 (with password), and DER binary formats
 * using node-forge for X.509 parsing.
 */

import forge from 'node-forge';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Supported certificate file formats */
export type CertFormat = 'pem' | 'pkcs12' | 'der';

/** Parsed certificate data extracted from an X.509 certificate */
export interface ParsedCertificate {
  commonName: string;
  sans: string[];
  serial: string;
  issuer: string;
  notBefore: Date;
  notAfter: Date;
  algorithm: string;
  fingerprintSha256: string;
  pemData: string;
}

/** Result of parsing: either success with data or failure with error */
export type ParseResult =
  | { ok: true; certificate: ParsedCertificate }
  | { ok: false; error: string; code: 'INVALID_CERT' | 'UNSUPPORTED_FORMAT' | 'DECRYPT_FAILED' };

// ─── Format detection ───────────────────────────────────────────────────────

/** PEM header marker */
const PEM_HEADER = '-----BEGIN';

/** PKCS#12/PFX magic bytes (DER-encoded SEQUENCE containing version + authSafe) */
const PKCS12_MAGIC = [0x30, 0x82];

/**
 * Detect the certificate format from file content and optional filename.
 */
export function detectFormat(buffer: Buffer, filename?: string): CertFormat | null {
  const ext = filename?.toLowerCase().split('.').pop() ?? '';

  // Check PEM by content (text-based)
  const textContent = buffer.toString('utf-8', 0, Math.min(buffer.length, 256));
  if (textContent.includes(PEM_HEADER)) {
    return 'pem';
  }

  // Check file extension for PKCS#12
  if (['p12', 'pfx', 'pkcs12'].includes(ext)) {
    return 'pkcs12';
  }

  // Check binary for PKCS#12 (ASN.1 SEQUENCE with OID for PKCS#12 data)
  if (buffer.length > 4 && buffer[0] === PKCS12_MAGIC[0] && buffer[1] === PKCS12_MAGIC[1]) {
    // Try to detect PKCS#12 by looking for the PKCS#12 OID (1.2.840.113549.1.7.1)
    const hex = buffer.toString('hex');
    if (hex.includes('2a864886f70d010701') || hex.includes('2a864886f70d010c')) {
      return 'pkcs12';
    }
  }

  // Check file extension for DER
  if (['der', 'cer', 'crt'].includes(ext)) {
    return 'der';
  }

  // Heuristic: any binary starting with ASN.1 SEQUENCE tag (0x30) could be DER
  if (buffer.length > 2 && buffer[0] === 0x30) {
    return 'der';
  }

  return null;
}

// ─── X.509 field extraction ─────────────────────────────────────────────────

/**
 * Extract the Common Name (CN) from an X.509 distinguished name.
 */
function extractCN(attrs: forge.pki.CertificateField[]): string {
  const cn = attrs.find((a) => a.shortName === 'CN' || a.name === 'commonName');
  return cn?.value?.toString() ?? '';
}

/**
 * Extract Subject Alternative Names (SANs) from a certificate.
 */
function extractSANs(cert: forge.pki.Certificate): string[] {
  const sanExt = cert.getExtension('subjectAltName') as
    | { altNames?: Array<{ type: number; value: string }> }
    | undefined;

  if (!sanExt?.altNames) return [];

  return sanExt.altNames
    .filter((an) => an.type === 2 || an.type === 7) // DNS names + IP addresses
    .map((an) => an.value);
}

/**
 * Get a human-readable algorithm description from a certificate's public key.
 */
function extractAlgorithm(cert: forge.pki.Certificate): string {
  const key = cert.publicKey;
  if ('n' in key && 'e' in key) {
    // RSA key — extract bit length
    const rsaKey = key as forge.pki.rsa.PublicKey;
    const bits = rsaKey.n.bitLength();
    return `RSA-${bits}`;
  }
  // Fallback: use the signature OID
  return cert.siginfo?.algorithmOid ?? 'unknown';
}

/**
 * Compute SHA-256 fingerprint of DER-encoded certificate.
 */
function computeFingerprint(derBytes: string): string {
  const md = forge.md.sha256.create();
  md.update(derBytes);
  const hex = md.digest().toHex();
  // Format as colon-separated uppercase pairs
  return hex.match(/.{2}/g)!.join(':').toUpperCase();
}

/**
 * Format a forge distinguished name as a readable string.
 */
function formatDN(attrs: forge.pki.CertificateField[]): string {
  const parts: string[] = [];
  for (const attr of attrs) {
    const name = attr.shortName ?? attr.name ?? attr.type;
    if (name && attr.value) {
      parts.push(`${name}=${attr.value}`);
    }
  }
  return parts.join(', ');
}

/**
 * Extract all relevant fields from a forge certificate object.
 */
function extractCertData(cert: forge.pki.Certificate): ParsedCertificate {
  const derAsn1 = forge.pki.certificateToAsn1(cert);
  const derBytes = forge.asn1.toDer(derAsn1).getBytes();

  return {
    commonName: extractCN(cert.subject.attributes),
    sans: extractSANs(cert),
    serial: cert.serialNumber,
    issuer: formatDN(cert.issuer.attributes),
    notBefore: cert.validity.notBefore,
    notAfter: cert.validity.notAfter,
    algorithm: extractAlgorithm(cert),
    fingerprintSha256: computeFingerprint(derBytes),
    pemData: forge.pki.certificateToPem(cert),
  };
}

// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * Validate the parsed certificate meets minimum requirements.
 * Returns an error string or null if valid.
 */
function validateCert(data: ParsedCertificate): string | null {
  if (!data.commonName || data.commonName.trim().length === 0) {
    return 'Certificate has an empty Common Name (CN)';
  }

  if (isNaN(data.notBefore.getTime()) || isNaN(data.notAfter.getTime())) {
    return 'Certificate has invalid validity dates';
  }

  // Check RSA key size >= 2048
  if (data.algorithm.startsWith('RSA-')) {
    const bits = parseInt(data.algorithm.replace('RSA-', ''), 10);
    if (!isNaN(bits) && bits < 2048) {
      return `RSA key size ${bits} bits is below minimum requirement of 2048 bits`;
    }
  }

  return null;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Parse a PEM-encoded certificate.
 */
export function parsePEM(pemContent: string): ParseResult {
  try {
    const cert = forge.pki.certificateFromPem(pemContent);
    const data = extractCertData(cert);
    const validationError = validateCert(data);
    if (validationError) {
      return { ok: false, error: validationError, code: 'INVALID_CERT' };
    }
    return { ok: true, certificate: data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Failed to parse PEM certificate: ${message}`,
      code: 'INVALID_CERT',
    };
  }
}

/**
 * Parse a DER-encoded certificate.
 */
export function parseDER(derBuffer: Buffer): ParseResult {
  try {
    const derBinaryString = forge.util.binary.raw.encode(new Uint8Array(derBuffer));
    const asn1 = forge.asn1.fromDer(derBinaryString);
    const cert = forge.pki.certificateFromAsn1(asn1);
    const data = extractCertData(cert);
    const validationError = validateCert(data);
    if (validationError) {
      return { ok: false, error: validationError, code: 'INVALID_CERT' };
    }
    return { ok: true, certificate: data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Failed to parse DER certificate: ${message}`,
      code: 'INVALID_CERT',
    };
  }
}

/**
 * Parse a PKCS#12 container. Extracts the first end-entity certificate
 * (ignores private keys and CA chain).
 */
export function parsePKCS12(p12Buffer: Buffer, password: string): ParseResult {
  try {
    const derBinaryString = forge.util.binary.raw.encode(new Uint8Array(p12Buffer));
    const p12Asn1 = forge.asn1.fromDer(derBinaryString);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

    // Find certificate bags
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const bags = certBags[forge.pki.oids.certBag];

    if (!bags || bags.length === 0) {
      return {
        ok: false,
        error: 'PKCS#12 container does not contain any certificates',
        code: 'INVALID_CERT',
      };
    }

    // Get the first certificate (end-entity)
    const certBag = bags.find((b) => b.cert != null);
    if (!certBag?.cert) {
      return {
        ok: false,
        error: 'PKCS#12 container does not contain a valid certificate',
        code: 'INVALID_CERT',
      };
    }

    const data = extractCertData(certBag.cert);
    const validationError = validateCert(data);
    if (validationError) {
      return { ok: false, error: validationError, code: 'INVALID_CERT' };
    }
    return { ok: true, certificate: data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Detect password issues specifically
    if (
      message.includes('Invalid password') ||
      message.includes('PKCS#12 MAC could not be verified') ||
      message.includes('decryption failed')
    ) {
      return {
        ok: false,
        error: 'Failed to decrypt PKCS#12: incorrect password',
        code: 'DECRYPT_FAILED',
      };
    }

    return {
      ok: false,
      error: `Failed to parse PKCS#12 container: ${message}`,
      code: 'INVALID_CERT',
    };
  }
}

/**
 * Parse a certificate file by auto-detecting the format.
 * Attempts PEM → PKCS#12 → DER in order.
 */
export function parseCertificateFile(
  fileBuffer: Buffer,
  filename?: string,
  password?: string,
): ParseResult {
  const format = detectFormat(fileBuffer, filename);

  if (!format) {
    return {
      ok: false,
      error:
        'Unsupported certificate format. Supported formats: PEM (.pem, .crt), PKCS#12 (.p12, .pfx), DER (.der, .cer)',
      code: 'UNSUPPORTED_FORMAT',
    };
  }

  switch (format) {
    case 'pem': {
      const pemContent = fileBuffer.toString('utf-8');
      return parsePEM(pemContent);
    }
    case 'pkcs12':
      return parsePKCS12(fileBuffer, password ?? '');
    case 'der':
      return parseDER(fileBuffer);
  }
}
