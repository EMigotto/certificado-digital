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
});

export type Env = z.infer<typeof envSchema>;

/** Validated environment configuration */
export const config: Env = envSchema.parse(process.env);
