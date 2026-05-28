/**
 * Client-side certificate file parser.
 *
 * Provides lightweight PEM/DER preview without external crypto libraries.
 * For PKCS#12 files, only format detection is done — actual parsing requires
 * the backend (which uses node-forge).
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type CertFormat = 'PEM' | 'DER' | 'PKCS12' | 'UNKNOWN';

/** Metadata extracted from a certificate file (client-side preview) */
export interface CertPreview {
  format: CertFormat;
  commonName: string;
  sans: string[];
  issuer: string;
  notBefore: string;
  notAfter: string;
  algorithm: string;
  serial: string;
  /** Whether we successfully extracted full metadata */
  parsed: boolean;
  /** Informational message (e.g. "PKCS#12 requires server-side parsing") */
  message?: string;
}

export interface CertParseResult {
  ok: true;
  preview: CertPreview;
}

export interface CertParseError {
  ok: false;
  error: string;
  code: 'UNSUPPORTED_FORMAT' | 'INVALID_PEM' | 'PARSE_ERROR';
}

export type ParseResult = CertParseResult | CertParseError;

// ─── Format extensions ──────────────────────────────────────────────────────

const PEM_EXTENSIONS = ['.pem', '.crt'];
const DER_EXTENSIONS = ['.der', '.cer'];
const PKCS12_EXTENSIONS = ['.p12', '.pfx'];

export const ACCEPTED_EXTENSIONS = [...PEM_EXTENSIONS, ...DER_EXTENSIONS, ...PKCS12_EXTENSIONS];
export const ACCEPTED_MIME_TYPES = [
  'application/x-pem-file',
  'application/x-x509-ca-cert',
  'application/pkix-cert',
  'application/x-pkcs12',
  'application/octet-stream',
];

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Detect the certificate format from filename and file content.
 */
export function detectFormat(filename: string, content: Uint8Array): CertFormat {
  const ext = getExtension(filename);

  // Extension-based detection
  if (PEM_EXTENSIONS.includes(ext)) return 'PEM';
  if (DER_EXTENSIONS.includes(ext)) return 'DER';
  if (PKCS12_EXTENSIONS.includes(ext)) return 'PKCS12';

  // Content-based detection
  const textContent = new TextDecoder('utf-8', { fatal: false }).decode(content.slice(0, 256));
  if (textContent.includes('-----BEGIN')) return 'PEM';

  // PKCS#12 magic bytes (sequence tag 0x30)
  if (content.length > 2 && content[0] === 0x30) {
    if (containsPkcs12Marker(content)) return 'PKCS12';
    return 'DER';
  }

  return 'UNKNOWN';
}

/**
 * Parse a certificate file and extract preview metadata.
 */
export function parseCertificateFile(filename: string, content: Uint8Array): ParseResult {
  const format = detectFormat(filename, content);

  switch (format) {
    case 'PEM':
      return parsePem(content);

    case 'DER':
      return parseDer(content);

    case 'PKCS12':
      return {
        ok: true,
        preview: {
          format: 'PKCS12',
          commonName: '',
          sans: [],
          issuer: '',
          notBefore: '',
          notAfter: '',
          algorithm: '',
          serial: '',
          parsed: false,
          message:
            'Arquivo PKCS#12 detectado. Informe a senha para que o servidor extraia os metadados.',
        },
      };

    default:
      return {
        ok: false,
        error: `Formato não suportado. Extensões aceitas: ${ACCEPTED_EXTENSIONS.join(', ')}`,
        code: 'UNSUPPORTED_FORMAT',
      };
  }
}

/**
 * Check if a filename indicates a PKCS#12 file.
 */
export function isPkcs12(filename: string): boolean {
  const ext = getExtension(filename);
  return PKCS12_EXTENSIONS.includes(ext);
}

// ─── PEM parser ─────────────────────────────────────────────────────────────

function parsePem(content: Uint8Array): ParseResult {
  const text = new TextDecoder().decode(content);

  const pemMatch = text.match(
    /-----BEGIN\s+(?:CERTIFICATE|X509 CERTIFICATE)-----\s*([\s\S]*?)\s*-----END/,
  );
  if (!pemMatch) {
    return {
      ok: false,
      error: 'Arquivo PEM inválido: cabeçalho "-----BEGIN CERTIFICATE-----" não encontrado.',
      code: 'INVALID_PEM',
    };
  }

  const base64 = pemMatch[1].replace(/\s/g, '');
  let derBytes: Uint8Array;
  try {
    derBytes = base64ToBytes(base64);
  } catch {
    return { ok: false, error: 'Falha ao decodificar base64 do PEM.', code: 'PARSE_ERROR' };
  }

  return parseDer(derBytes, 'PEM');
}

// ─── DER / ASN.1 parser ────────────────────────────────────────────────────

function parseDer(content: Uint8Array, formatOverride?: CertFormat): ParseResult {
  try {
    const cert = parseX509Asn1(content);
    return {
      ok: true,
      preview: {
        format: formatOverride ?? 'DER',
        commonName: cert.commonName,
        sans: cert.sans,
        issuer: cert.issuer,
        notBefore: cert.notBefore,
        notAfter: cert.notAfter,
        algorithm: cert.algorithm,
        serial: cert.serial,
        parsed: true,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: `Erro ao analisar certificado: ${err instanceof Error ? err.message : String(err)}`,
      code: 'PARSE_ERROR',
    };
  }
}

// ─── Simplified ASN.1 X.509 extractor ──────────────────────────────────────

interface X509Fields {
  commonName: string;
  sans: string[];
  issuer: string;
  notBefore: string;
  notAfter: string;
  algorithm: string;
  serial: string;
}

interface Asn1Element {
  tag: number;
  constructed: boolean;
  value: Uint8Array;
  children: Asn1Element[];
  offset: number;
  length: number;
}

function parseX509Asn1(der: Uint8Array): X509Fields {
  const root = readAsn1(der, 0);
  const tbs = root.children[0];
  if (!tbs) throw new Error('Estrutura ASN.1 inválida');

  let idx = 0;

  // Version (optional, EXPLICIT [0])
  if (tbs.children[idx] && (tbs.children[idx].tag & 0x1f) === 0) {
    idx++;
  }

  // Serial number
  const serialEl = tbs.children[idx++];
  const serial = serialEl ? bytesToHex(serialEl.value) : '';

  // Signature algorithm (inside TBS)
  const sigAlgEl = tbs.children[idx++];
  const algorithm = sigAlgEl ? resolveOidName(extractOid(sigAlgEl)) : '';

  // Issuer
  const issuerEl = tbs.children[idx++];
  const issuer = issuerEl ? extractDnString(issuerEl) : '';

  // Validity
  const validityEl = tbs.children[idx++];
  let notBefore = '';
  let notAfter = '';
  if (validityEl && validityEl.children.length >= 2) {
    notBefore = parseAsn1Time(validityEl.children[0]);
    notAfter = parseAsn1Time(validityEl.children[1]);
  }

  // Subject
  const subjectEl = tbs.children[idx++];
  const commonName = subjectEl ? extractCn(subjectEl) : '';

  // SubjectPublicKeyInfo — skip
  idx++;

  // Extensions (look for SANs)
  const sans: string[] = [];
  for (let i = idx; i < tbs.children.length; i++) {
    const el = tbs.children[i];
    if (el && (el.tag & 0x1f) === 3 && el.constructed) {
      const extsSeq = el.children[0];
      if (extsSeq) {
        for (const ext of extsSeq.children) {
          const oid = ext.children[0] ? extractOidRaw(ext.children[0].value) : '';
          // Subject Alternative Name OID: 2.5.29.17
          if (oid === '2.5.29.17') {
            const valueEl = ext.children[ext.children.length - 1];
            if (valueEl) {
              const sanSeq = readAsn1(valueEl.value, 0);
              for (const name of sanSeq.children) {
                if ((name.tag & 0x1f) === 2) {
                  sans.push(new TextDecoder().decode(name.value));
                }
              }
            }
          }
        }
      }
    }
  }

  return { commonName, sans, issuer, notBefore, notAfter, algorithm, serial };
}

// ─── ASN.1 primitives ──────────────────────────────────────────────────────

function readAsn1(data: Uint8Array, offset: number): Asn1Element {
  if (offset >= data.length) throw new Error('ASN.1: offset fora dos limites');

  const tag = data[offset];
  const constructed = (tag & 0x20) !== 0;
  let pos = offset + 1;

  let length = data[pos++];
  if (length & 0x80) {
    const numBytes = length & 0x7f;
    length = 0;
    for (let i = 0; i < numBytes; i++) {
      length = (length << 8) | data[pos++];
    }
  }

  const value = data.slice(pos, pos + length);
  const children: Asn1Element[] = [];

  if (constructed) {
    let childOffset = 0;
    while (childOffset < value.length) {
      try {
        const child = readAsn1(value, childOffset);
        children.push(child);
        childOffset = child.offset + child.length;
      } catch {
        break;
      }
    }
  }

  return { tag, constructed, value, children, offset: pos - offset, length };
}

function extractOid(el: Asn1Element): string {
  if (el.children.length > 0 && el.children[0].tag === 0x06) {
    return extractOidRaw(el.children[0].value);
  }
  return '';
}

function extractOidRaw(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  const parts: number[] = [];
  parts.push(Math.floor(bytes[0] / 40));
  parts.push(bytes[0] % 40);

  let val = 0;
  for (let i = 1; i < bytes.length; i++) {
    val = (val << 7) | (bytes[i] & 0x7f);
    if (!(bytes[i] & 0x80)) {
      parts.push(val);
      val = 0;
    }
  }
  return parts.join('.');
}

const OID_NAMES: Record<string, string> = {
  '1.2.840.113549.1.1.1': 'RSA',
  '1.2.840.113549.1.1.5': 'SHA-1 with RSA',
  '1.2.840.113549.1.1.11': 'SHA-256 with RSA',
  '1.2.840.113549.1.1.12': 'SHA-384 with RSA',
  '1.2.840.113549.1.1.13': 'SHA-512 with RSA',
  '1.2.840.10045.2.1': 'ECDSA',
  '1.2.840.10045.4.3.2': 'ECDSA with SHA-256',
  '1.2.840.10045.4.3.3': 'ECDSA with SHA-384',
  '1.2.840.10045.4.3.4': 'ECDSA with SHA-512',
  '1.3.101.112': 'Ed25519',
};

function resolveOidName(oid: string): string {
  return OID_NAMES[oid] ?? oid;
}

// ─── DN extraction ──────────────────────────────────────────────────────────

const OID_CN = '2.5.4.3';

const RDN_OIDS: Record<string, string> = {
  '2.5.4.3': 'CN',
  '2.5.4.6': 'C',
  '2.5.4.7': 'L',
  '2.5.4.8': 'ST',
  '2.5.4.10': 'O',
  '2.5.4.11': 'OU',
};

function extractCn(subjectEl: Asn1Element): string {
  for (const rdn of subjectEl.children) {
    for (const atv of rdn.children) {
      if (atv.children.length >= 2 && atv.children[0].tag === 0x06) {
        const oid = extractOidRaw(atv.children[0].value);
        if (oid === OID_CN) {
          return new TextDecoder().decode(atv.children[1].value);
        }
      }
    }
  }
  return '';
}

function extractDnString(dnEl: Asn1Element): string {
  const parts: string[] = [];
  for (const rdn of dnEl.children) {
    for (const atv of rdn.children) {
      if (atv.children.length >= 2 && atv.children[0].tag === 0x06) {
        const oid = extractOidRaw(atv.children[0].value);
        const name = RDN_OIDS[oid] ?? oid;
        const value = new TextDecoder().decode(atv.children[1].value);
        parts.push(`${name}=${value}`);
      }
    }
  }
  return parts.join(', ');
}

// ─── Time parsing ───────────────────────────────────────────────────────────

function parseAsn1Time(el: Asn1Element): string {
  const str = new TextDecoder().decode(el.value);
  if (el.tag === 0x17) {
    const yy = parseInt(str.slice(0, 2), 10);
    const year = yy >= 50 ? 1900 + yy : 2000 + yy;
    const month = str.slice(2, 4);
    const day = str.slice(4, 6);
    const hour = str.slice(6, 8);
    const min = str.slice(8, 10);
    const sec = str.slice(10, 12);
    return `${year}-${month}-${day}T${hour}:${min}:${sec}Z`;
  }
  if (el.tag === 0x18) {
    const year = str.slice(0, 4);
    const month = str.slice(4, 6);
    const day = str.slice(6, 8);
    const hour = str.slice(8, 10);
    const min = str.slice(10, 12);
    const sec = str.slice(12, 14);
    return `${year}-${month}-${day}T${hour}:${min}:${sec}Z`;
  }
  return str;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(':');
}

function containsPkcs12Marker(data: Uint8Array): boolean {
  const hex = Array.from(data.slice(0, 64))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.includes('2a864886f70d010c');
}
