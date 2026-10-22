import { z } from 'zod';

const boolish = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (typeof v === 'boolean') return v;
    return ['true', '1', 'yes'].includes(v.toLowerCase());
  });

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.string().default('development'),
  WEB_ORIGIN: z.string().default('http://localhost:5174'),
  DATA_MODE: z.enum(['firestore', 'memory']).default('firestore'),
  FIREBASE_PROJECT_ID: z.string().optional().default(''),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional().default(''),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional().default(''),
  FIRESTORE_EMULATOR_HOST: z.string().optional().default(''),
  ADMIN_JWT_SECRET: z.string().default('dev-only-secret-change-me-please-32chars'),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(8),
  ADMIN_EMAIL_DOMAINS: z.string().optional().default(''),
  BOOTSTRAP_ADMIN_EMAIL: z.string().optional().default(''),
  BOOTSTRAP_ADMIN_NAME: z.string().optional().default(''),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional().default(''),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_SECURE: boolish,
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default('Atheleos <contact@atheleos.in>'),
  IMAP_HOST: z.string().optional().default(''),
  IMAP_PORT: z.coerce.number().int().positive().default(993),
  IMAP_SECURE: boolish,
  IMAP_USER: z.string().optional().default(''),
  IMAP_PASS: z.string().optional().default(''),
  MEDIA_WORKER_URL: z.string().optional().default(''),
  FUNCTIONS_BASE_URL: z.string().optional().default(''),
});

export type AppConfig = z.infer<typeof envSchema> & {
  smtpSecure: boolean;
  imapSecure: boolean;
  smtpConfigured: boolean;
  imapConfigured: boolean;
  firebaseConfigured: boolean;
  adminEmailDomains: string[];
};

let cached: AppConfig | null = null;

export function loadEnv(source: Record<string, string | undefined> = process.env, overrides: Partial<AppConfig> = {}): AppConfig {
  const parsed = envSchema.parse(source);
  const cfg: AppConfig = {
    ...parsed,
    smtpSecure: parsed.SMTP_SECURE ?? parsed.SMTP_PORT === 465,
    imapSecure: parsed.IMAP_SECURE ?? true,
    smtpConfigured: Boolean(parsed.SMTP_HOST && parsed.SMTP_USER),
    imapConfigured: Boolean(parsed.IMAP_HOST && parsed.IMAP_USER && parsed.IMAP_PASS),
    firebaseConfigured: Boolean(
      parsed.FIREBASE_PROJECT_ID &&
        (parsed.GOOGLE_APPLICATION_CREDENTIALS || parsed.FIREBASE_SERVICE_ACCOUNT_JSON || parsed.FIRESTORE_EMULATOR_HOST),
    ),
    adminEmailDomains: (parsed.ADMIN_EMAIL_DOMAINS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    ...overrides,
  } as AppConfig;
  return cfg;
}

export function getEnv(): AppConfig {
  if (!cached) cached = loadEnv();
  return cached;
}
