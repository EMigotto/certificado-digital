/**
 * File upload middleware — multer configuration for PEM & PKCS#12 files.
 *
 * Covers AC 46 (wrong file type → error).
 *
 * Accepted MIME types / extensions:
 *  - PEM:    .pem, .crt, .cer  (application/x-pem-file, application/x-x509-ca-cert, text/plain)
 *  - PKCS#12: .p12, .pfx       (application/x-pkcs12)
 */

import multer from 'multer';
import path from 'node:path';
import os from 'node:os';

/* ------------------------------------------------------------------ */
/* Allowed file extensions                                             */
/* ------------------------------------------------------------------ */

const PEM_EXTENSIONS = new Set(['.pem', '.crt', '.cer']);
const PKCS12_EXTENSIONS = new Set(['.p12', '.pfx']);
const ALL_ALLOWED = new Set([...PEM_EXTENSIONS, ...PKCS12_EXTENSIONS]);

/** Maximum file size: 5 MB (generous for certificate files). */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/* ------------------------------------------------------------------ */
/* Storage — use OS temp dir (auto-cleaned)                            */
/* ------------------------------------------------------------------ */

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, os.tmpdir());
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `cert-upload-${unique}${path.extname(file.originalname)}`);
  },
});

/* ------------------------------------------------------------------ */
/* File filter                                                         */
/* ------------------------------------------------------------------ */

const pemFileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (PEM_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only PEM certificate files (.pem, .crt, .cer) are accepted'));
  }
};

const pkcs12FileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (PKCS12_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only PKCS#12 files (.p12, .pfx) are accepted'));
  }
};

const anyFileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALL_ALLOWED.has(ext)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        'Unsupported file type. Only PEM (.pem, .crt, .cer) and PKCS#12 (.p12, .pfx) files are accepted',
      ),
    );
  }
};

/* ------------------------------------------------------------------ */
/* Exported multer instances                                           */
/* ------------------------------------------------------------------ */

/** Multer middleware for single PEM file upload (field name: "file"). */
export const uploadPem = multer({
  storage,
  fileFilter: pemFileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
}).single('file');

/** Multer middleware for single PKCS#12 file upload (field name: "file"). */
export const uploadPkcs12 = multer({
  storage,
  fileFilter: pkcs12FileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
}).single('file');

/** Multer middleware accepting any certificate file (field name: "file"). */
export const uploadCert = multer({
  storage,
  fileFilter: anyFileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
}).single('file');

/**
 * Check whether a file extension indicates a PEM file.
 */
export function isPemExtension(filename: string): boolean {
  return PEM_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

/**
 * Check whether a file extension indicates a PKCS#12 file.
 */
export function isPkcs12Extension(filename: string): boolean {
  return PKCS12_EXTENSIONS.has(path.extname(filename).toLowerCase());
}
