/**
 * CSR Generation Service.
 *
 * Generates Certificate Signing Requests (PKCS#10) with support for:
 *   - RSA 2048 / 4096
 *   - ECDSA P-256 / P-384
 *
 * Private keys are encrypted with AES-256-GCM using the ENCRYPTION_KEY env var
 * before being returned as an opaque reference.
 *
 * Also provides a parser for uploaded CSR PEM to extract CN, SANs, and algorithm.
 */

import forge from 'node-forge';
import {
  generateKeyPairSync,
  createSign,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createPublicKey,
  type KeyObject,
} from 'node:crypto';
import { config } from '../config.js';

// ─── Public types ───────────────────────────────────────────────────────────

/** Supported key algorithms for CSR generation */
export type KeyAlgorithm = 'RSA2048' | 'RSA4096' | 'ECDSA_P256' | 'ECDSA_P384';

/** Result of CSR generation */
export interface CsrGenerationResult {
  /** CSR in PEM format */
  csrPem: string;
  /** Encrypted private key reference (base64-encoded IV + ciphertext + tag) */
  privateKeyRef: string;
  /** SHA-256 fingerprint of the public key (colon-delimited hex) */
  fingerprint: string;
  /** Algorithm used */
  algorithm: KeyAlgorithm;
}

/** Parsed information from an uploaded CSR */
export interface ParsedCsr {
  /** Common Name from the subject */
  commonName: string;
  /** Subject Alternative Names */
  sans: string[];
  /** Detected key algorithm description */
  algorithm: string;
  /** Key size in bits (RSA) or curve name (ECDSA) */
  keyInfo: string;
  /** Full subject DN string */
  subjectDn: string;
}

// ─── CSR Generation ─────────────────────────────────────────────────────────

/**
 * Generate a CSR with a new key pair.
 *
 * @param commonName  Subject CN (e.g. "api.example.com")
 * @param sans        Subject Alternative Names (DNS names)
 * @param algorithm   Key algorithm and size
 * @returns CSR PEM, encrypted private key reference, and public key fingerprint
 */
export function generateCsr(
  commonName: string,
  sans: string[],
  algorithm: KeyAlgorithm,
): CsrGenerationResult {
  if (isRsaAlgorithm(algorithm)) {
    return generateRsaCsr(commonName, sans, algorithm);
  }
  return generateEcdsaCsr(commonName, sans, algorithm);
}

/**
 * Parse an uploaded CSR PEM string and extract metadata.
 *
 * @param csrPem  CSR in PEM format
 * @returns Extracted CN, SANs, algorithm info
 * @throws Error if the PEM cannot be parsed
 */
export function parseCsrPem(csrPem: string): ParsedCsr {
  const csr = forge.pki.certificationRequestFromPem(csrPem);

  // Extract Common Name
  const cnField = csr.subject.getField('CN');
  const commonName = cnField ? String(cnField.value) : '';

  // Extract Subject DN
  const subjectDn = csr.subject.attributes
    .map((attr) => `${attr.shortName ?? attr.name}=${attr.value}`)
    .join(', ');

  // Extract SANs from extension request
  const sans = extractSansFromCsr(csr);

  // Detect algorithm
  const { algorithm, keyInfo } = detectCsrAlgorithm(csr);

  return { commonName, sans, algorithm, keyInfo, subjectDn };
}

/**
 * Decrypt an encrypted private key reference back to PEM.
 * Used when renewing with the same key.
 *
 * @param privateKeyRef  Base64-encoded encrypted key (from generateCsr)
 * @returns Private key PEM
 */
export function decryptPrivateKey(privateKeyRef: string): string {
  const encryptionKey = getEncryptionKeyBuffer();
  const combined = Buffer.from(privateKeyRef, 'base64');

  // Layout: [12 bytes IV] [16 bytes authTag] [remaining ciphertext]
  const iv = combined.subarray(0, 12);
  const authTag = combined.subarray(12, 28);
  const ciphertext = combined.subarray(28);

  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

// ─── RSA CSR Generation (via node-forge) ────────────────────────────────────

function generateRsaCsr(
  commonName: string,
  sans: string[],
  algorithm: KeyAlgorithm,
): CsrGenerationResult {
  const bits = algorithm === 'RSA4096' ? 4096 : 2048;

  // Generate RSA key pair
  const keyPair = forge.pki.rsa.generateKeyPair({ bits, e: 0x10001 });

  // Build CSR
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = keyPair.publicKey;
  csr.setSubject([{ name: 'commonName', value: commonName }]);

  // Add SANs as extension request
  const altNames = buildForgeSanList(sans, commonName);
  if (altNames.length > 0) {
    csr.setAttributes([
      {
        name: 'extensionRequest',
        extensions: [
          {
            name: 'subjectAltName',
            altNames,
          },
        ],
      },
    ]);
  }

  // Sign the CSR with SHA-256
  csr.sign(keyPair.privateKey, forge.md.sha256.create());

  // Serialize
  const csrPem = forge.pki.certificationRequestToPem(csr);
  const privateKeyPem = forge.pki.privateKeyToPem(keyPair.privateKey);

  // Compute public key fingerprint (SHA-256 of DER-encoded SPKI)
  const fingerprint = computeForgePublicKeyFingerprint(keyPair.publicKey);

  // Encrypt private key
  const privateKeyRef = encryptPrivateKey(privateKeyPem);

  return { csrPem, privateKeyRef, fingerprint, algorithm };
}

// ─── ECDSA CSR Generation (via Node.js crypto) ─────────────────────────────

function generateEcdsaCsr(
  commonName: string,
  sans: string[],
  algorithm: KeyAlgorithm,
): CsrGenerationResult {
  const namedCurve = algorithm === 'ECDSA_P384' ? 'P-384' : 'P-256';

  // Generate EC key pair using Node.js crypto
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // Build CSR structure using DER/ASN.1
  const csrPem = buildEcCsr(commonName, sans, publicKey, privateKey, namedCurve);

  // Compute fingerprint from public key
  const fingerprint = computePublicKeyFingerprint(
    createPublicKey(publicKey),
  );

  // Encrypt private key
  const privateKeyRef = encryptPrivateKey(privateKey);

  return { csrPem, privateKeyRef, fingerprint, algorithm };
}

/**
 * Build a PEM-encoded PKCS#10 CSR for an EC key pair.
 *
 * Uses node-forge ASN.1 utilities for DER encoding and Node.js crypto for signing.
 */
function buildEcCsr(
  commonName: string,
  sans: string[],
  publicKeyPem: string,
  privateKeyPem: string,
  namedCurve: string,
): string {
  const pki = forge.asn1;

  // Get public key in DER (SPKI)
  const pubKeyObj = createPublicKey(publicKeyPem);
  const spkiDer = pubKeyObj.export({ type: 'spki', format: 'der' });

  // Build subject: SEQUENCE { SET { SEQUENCE { OID(CN), UTF8String(value) } } }
  const subject = pki.create(pki.Class.UNIVERSAL, pki.Type.SEQUENCE, true, [
    pki.create(pki.Class.UNIVERSAL, pki.Type.SET, true, [
      pki.create(pki.Class.UNIVERSAL, pki.Type.SEQUENCE, true, [
        // OID for commonName (2.5.4.3)
        pki.create(
          pki.Class.UNIVERSAL,
          pki.Type.OID,
          false,
          pki.oidToDer('2.5.4.3').getBytes(),
        ),
        pki.create(pki.Class.UNIVERSAL, pki.Type.UTF8, false, commonName),
      ]),
    ]),
  ]);

  // Build attributes with SAN extension request
  const attributes = buildEcSanAttributes(sans, commonName);

  // CertificationRequestInfo
  const certReqInfo = pki.create(pki.Class.UNIVERSAL, pki.Type.SEQUENCE, true, [
    // version INTEGER (0)
    pki.create(
      pki.Class.UNIVERSAL,
      pki.Type.INTEGER,
      false,
      pki.integerToDer(0).getBytes(),
    ),
    // subject
    subject,
    // subjectPKInfo — embed raw DER bytes
    pki.fromDer(forge.util.createBuffer(spkiDer)),
    // attributes [0] IMPLICIT
    attributes,
  ]);

  // Serialize CertificationRequestInfo to DER for signing
  const certReqInfoDer = pki.toDer(certReqInfo);
  const certReqInfoBytes = Buffer.from(certReqInfoDer.getBytes(), 'binary');

  // Determine signature algorithm
  const hashAlg = namedCurve === 'P-384' ? 'SHA384' : 'SHA256';
  const sigAlgOid =
    namedCurve === 'P-384'
      ? '1.2.840.10045.4.3.3' // ecdsa-with-SHA384
      : '1.2.840.10045.4.3.2'; // ecdsa-with-SHA256

  // Sign
  const signer = createSign(hashAlg);
  signer.update(certReqInfoBytes);
  const signature = signer.sign(privateKeyPem);

  // Build signatureAlgorithm SEQUENCE { OID }
  const sigAlgorithm = pki.create(pki.Class.UNIVERSAL, pki.Type.SEQUENCE, true, [
    pki.create(
      pki.Class.UNIVERSAL,
      pki.Type.OID,
      false,
      pki.oidToDer(sigAlgOid).getBytes(),
    ),
  ]);

  // Build signature BIT STRING (prepend 0x00 for zero unused bits)
  const sigBitString = pki.create(
    pki.Class.UNIVERSAL,
    pki.Type.BITSTRING,
    false,
    String.fromCharCode(0) + signature.toString('binary'),
  );

  // Full CertificationRequest
  const csr = pki.create(pki.Class.UNIVERSAL, pki.Type.SEQUENCE, true, [
    certReqInfo,
    sigAlgorithm,
    sigBitString,
  ]);

  const csrDer = pki.toDer(csr).getBytes();
  const csrBase64 = forge.util.encode64(csrDer);

  // Format as PEM
  const lines = csrBase64.match(/.{1,64}/g) ?? [csrBase64];
  return `-----BEGIN CERTIFICATE REQUEST-----\n${lines.join('\n')}\n-----END CERTIFICATE REQUEST-----\n`;
}

/**
 * Build the [0] IMPLICIT attributes for SAN extension request.
 */
function buildEcSanAttributes(
  sans: string[],
  commonName: string,
): forge.asn1.Asn1 {
  const pki = forge.asn1;

  const allSans = [...new Set([commonName, ...sans])];

  // subjectAltName extension value
  const sanSequence = pki.create(pki.Class.UNIVERSAL, pki.Type.SEQUENCE, true,
    allSans.map((name) =>
      // dNSName [2] IMPLICIT IA5String
      pki.create(pki.Class.CONTEXT_SPECIFIC, 2, false, name),
    ),
  );

  const sanExtDer = pki.toDer(sanSequence).getBytes();

  // Extension: SEQUENCE { OID(subjectAltName), OCTETSTRING(sanDer) }
  const sanExtension = pki.create(pki.Class.UNIVERSAL, pki.Type.SEQUENCE, true, [
    pki.create(
      pki.Class.UNIVERSAL,
      pki.Type.OID,
      false,
      pki.oidToDer('2.5.29.17').getBytes(), // subjectAltName OID
    ),
    pki.create(pki.Class.UNIVERSAL, pki.Type.OCTETSTRING, false, sanExtDer),
  ]);

  // Extensions sequence
  const extensions = pki.create(pki.Class.UNIVERSAL, pki.Type.SEQUENCE, true, [
    sanExtension,
  ]);

  // ExtensionRequest attribute: SEQUENCE { OID(extensionRequest), SET { extensions } }
  const extReqAttr = pki.create(pki.Class.UNIVERSAL, pki.Type.SEQUENCE, true, [
    pki.create(
      pki.Class.UNIVERSAL,
      pki.Type.OID,
      false,
      pki.oidToDer('1.2.840.113549.1.9.14').getBytes(), // extensionRequest OID
    ),
    pki.create(pki.Class.UNIVERSAL, pki.Type.SET, true, [extensions]),
  ]);

  // [0] IMPLICIT SET
  return pki.create(pki.Class.CONTEXT_SPECIFIC, 0, true, [extReqAttr]);
}

// ─── Encryption helpers ─────────────────────────────────────────────────────

/**
 * Encrypt a private key PEM string with AES-256-GCM.
 * Returns base64-encoded: [12 bytes IV][16 bytes authTag][ciphertext]
 */
export function encryptPrivateKey(privateKeyPem: string): string {
  const encryptionKey = getEncryptionKeyBuffer();
  const iv = randomBytes(12);

  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(privateKeyPem, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Combine: IV (12) + AuthTag (16) + Ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString('base64');
}

/**
 * Derive the 32-byte encryption key from the hex-encoded env var.
 */
function getEncryptionKeyBuffer(): Buffer {
  const hexKey = config.ENCRYPTION_KEY;
  // If hex-encoded (64 chars = 32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(hexKey)) {
    return Buffer.from(hexKey, 'hex');
  }
  // Otherwise, hash to derive 32 bytes (for non-standard keys)
  const hash = forge.md.sha256.create();
  hash.update(hexKey);
  return Buffer.from(hash.digest().getBytes(), 'binary');
}

// ─── Fingerprint helpers ────────────────────────────────────────────────────

/**
 * Compute SHA-256 fingerprint of a node-forge public key.
 */
function computeForgePublicKeyFingerprint(publicKey: forge.pki.rsa.PublicKey): string {
  const der = forge.asn1.toDer(forge.pki.publicKeyToAsn1(publicKey)).getBytes();
  const md = forge.md.sha256.create();
  md.update(der);
  return formatFingerprint(md.digest().toHex());
}

/**
 * Compute SHA-256 fingerprint of a Node.js crypto KeyObject.
 */
function computePublicKeyFingerprint(publicKey: KeyObject): string {
  const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
  const md = forge.md.sha256.create();
  md.update(forge.util.createBuffer(spkiDer).getBytes());
  return formatFingerprint(md.digest().toHex());
}

/**
 * Format a hex string as colon-delimited fingerprint.
 * "aabbccdd" → "AA:BB:CC:DD"
 */
function formatFingerprint(hex: string): string {
  return hex
    .toUpperCase()
    .match(/.{2}/g)!
    .join(':');
}

// ─── CSR parsing helpers ────────────────────────────────────────────────────

/**
 * Extract SANs from a parsed CSR's extension request attributes.
 */
function extractSansFromCsr(csr: forge.pki.CertificateSigningRequest): string[] {
  const sans: string[] = [];

  const attrs = csr.attributes ?? [];
  for (const attr of attrs) {
    if (
      attr.name === 'extensionRequest' ||
      attr.type === '1.2.840.113549.1.9.14'
    ) {
      const extensions = (attr as forge.pki.CertificateField).extensions ?? [];
      for (const ext of extensions) {
        if (ext.name === 'subjectAltName' && ext.altNames) {
          for (const an of ext.altNames) {
            if (an.value) {
              sans.push(String(an.value));
            }
          }
        }
      }
    }
  }

  return sans;
}

/**
 * Detect the key algorithm from a parsed CSR.
 */
function detectCsrAlgorithm(csr: forge.pki.CertificateSigningRequest): {
  algorithm: string;
  keyInfo: string;
} {
  try {
    const publicKey = csr.publicKey;
    if (publicKey && 'n' in publicKey) {
      // RSA key — has modulus 'n'
      const rsaKey = publicKey as forge.pki.rsa.PublicKey;
      const bits = rsaKey.n.bitLength();
      return {
        algorithm: `RSA ${bits}`,
        keyInfo: `${bits} bits`,
      };
    }
  } catch {
    // Fall through to generic detection
  }

  // Try to detect from signature algorithm OID
  const sigOid = csr.siginfo?.algorithmOid ?? '';
  if (sigOid.startsWith('1.2.840.10045.4.3')) {
    // ECDSA with SHA-*
    const curveMap: Record<string, string> = {
      '1.2.840.10045.4.3.2': 'P-256',
      '1.2.840.10045.4.3.3': 'P-384',
      '1.2.840.10045.4.3.4': 'P-521',
    };
    const curve = curveMap[sigOid] ?? 'unknown';
    return {
      algorithm: `ECDSA ${curve}`,
      keyInfo: curve,
    };
  }

  return { algorithm: 'Unknown', keyInfo: 'Unknown' };
}

// ─── Utility ────────────────────────────────────────────────────────────────

function isRsaAlgorithm(algorithm: KeyAlgorithm): boolean {
  return algorithm === 'RSA2048' || algorithm === 'RSA4096';
}

/**
 * Build the altNames list for node-forge SAN extension.
 * Ensures CN is included as a SAN entry.
 */
function buildForgeSanList(
  sans: string[],
  commonName: string,
): Array<{ type: number; value: string }> {
  const allNames = [...new Set([commonName, ...sans])];
  return allNames.map((name) => ({
    type: 2, // dNSName
    value: name,
  }));
}
