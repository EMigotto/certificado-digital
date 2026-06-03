import { z } from 'zod';

const envSchema = z.object({
  /** PostgreSQL connection string */
  DATABASE_URL: z
    .string()
    .default('postgresql://certdigital:certdigital@localhost:5432/certdigital'),

  /** Server port */
  PORT: z.coerce.number().int().positive().default(3000),

  /** Server host */
  HOST: z.string().default('0.0.0.0'),

  /** Node environment */
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  /** Frontend origin for CORS */
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  /**
   * 256-bit key (hex-encoded, 64 chars) used to encrypt generated private keys
   * with AES-256-GCM. MUST be changed in production.
   */
  ENCRYPTION_KEY: z
    .string()
    .default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),

  /**
   * Dedicated secret for encrypting stored private keys at rest (C5).
   * Must be at least 32 characters. Kept separate from ENCRYPTION_KEY
   * for defense-in-depth — allows independent rotation and limits
   * blast radius if one secret is compromised.
   * MUST be changed in production.
   */
  PRIVATE_KEY_ENCRYPTION_SECRET: z
    .string()
    .min(32, 'PRIVATE_KEY_ENCRYPTION_SECRET must be at least 32 characters')
    .default('dev-only-private-key-secret-that-must-be-changed-in-production'),

  // ── SMTP / Email notification settings ────────────────────────────────────

  /** SMTP server hostname */
  SMTP_HOST: z.string().default(''),

  /** SMTP server port (587 for STARTTLS, 465 for TLS) */
  SMTP_PORT: z.coerce.number().int().nonnegative().default(587),

  /** SMTP authentication username */
  SMTP_USER: z.string().default(''),

  /** SMTP authentication password */
  SMTP_PASSWORD: z.string().default(''),

  /** Sender email address (envelope FROM) */
  SMTP_FROM_ADDRESS: z.string().default('noreply@certificado-digital.local'),

  /** Sender display name */
  SMTP_FROM_NAME: z.string().default('Certificado Digital'),

  /**
   * Enable the expiration scheduler cron job.
   * When false the scheduler will not start on server boot.
   */
  EXPIRATION_SCHEDULER_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  /**
   * Cron expression for the expiration check scheduler.
   * Default: daily at 02:00 UTC.
   */
  EXPIRATION_SCHEDULER_CRON: z.string().default('0 2 * * *'),

  // ── Webhook notification settings ─────────────────────────────────────────

  /** Default timeout for webhook HTTP requests in milliseconds */
  WEBHOOK_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  /** Default maximum retries for webhook delivery */
  WEBHOOK_MAX_RETRIES: z.coerce.number().int().min(0).default(3),

  // ── API Authentication settings ──────────────────────────────────────────

  /**
   * When true, requests without an Authorization header from browser origins
   * (matching CORS_ORIGIN) pass through without auth. Allows the existing
   * UI to continue working until session-based auth is implemented.
   */
  AUTH_SKIP_UI: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof envSchema>;

/** Validated environment configuration */
export const config: Env = envSchema.parse(process.env);
