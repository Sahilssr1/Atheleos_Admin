import { z } from 'zod';

const boolish = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === null || String(v).trim() === '') return undefined;
    if (typeof v === 'boolean') return v;
    return ['true', '1', 'yes'].includes(String(v).toLowerCase());
  });

const numWithDefault = (fallback: number) =>
  z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === null || String(v).trim() === '') return fallback;
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
    });

const portSchema = z
  .union([z.number(), z.string()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === null || String(v).trim() === '') return 4000;
    const str = String(v).trim();
    const n = Number(str);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
    return str;
  });

const envSchema = z.object({
  PORT: portSchema,
  NODE_ENV: z.string().default('development'),
  WEB_ORIGIN: z.string().default('http://localhost:5174'),
  DATA_MODE: z.enum(['firestore', 'memory']).default('firestore'),
  FIREBASE_PROJECT_ID: z.string().optional().default(''),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional().default(''),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional().default(''),
  FIREBASE_CLIENT_EMAIL: z.string().optional().default(''),
  FIREBASE_PRIVATE_KEY: z.string().optional().default(''),
  FIRESTORE_EMULATOR_HOST: z.string().optional().default(''),
  ADMIN_JWT_SECRET: z.string().default('dev-only-secret-change-me-please-32chars'),
  JWT_SECRET: z.string().optional().default(''),
  SESSION_TTL_HOURS: numWithDefault(8),
  ADMIN_EMAIL_DOMAINS: z.string().optional().default(''),
  BOOTSTRAP_ADMIN_EMAIL: z.string().optional().default(''),
  BOOTSTRAP_ADMIN_NAME: z.string().optional().default(''),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional().default(''),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: numWithDefault(465),
  SMTP_SECURE: boolish,
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default('Atheleos <contact@atheleos.in>'),
  IMAP_HOST: z.string().optional().default(''),
  IMAP_PORT: numWithDefault(993),
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
  const mergedSource: Record<string, string | undefined> = {
    ...source,
    FIREBASE_PROJECT_ID: source.FIREBASE_PROJECT_ID || source.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
    ADMIN_JWT_SECRET: source.ADMIN_JWT_SECRET || source.JWT_SECRET || 'dev-only-secret-change-me-please-32chars',
    IMAP_HOST: source.IMAP_HOST || (source.SMTP_HOST?.includes('hostinger') ? 'imap.hostinger.com' : ''),
    IMAP_USER: source.IMAP_USER || source.SMTP_USER || '',
    IMAP_PASS: source.IMAP_PASS || source.SMTP_PASS || '',
  };
  const parsed = envSchema.parse(mergedSource);
  const cfg: AppConfig = {
    ...parsed,
    smtpSecure: parsed.SMTP_SECURE ?? parsed.SMTP_PORT === 465,
    imapSecure: parsed.IMAP_SECURE ?? true,
    smtpConfigured: Boolean(parsed.SMTP_HOST && parsed.SMTP_USER),
    imapConfigured: Boolean(parsed.IMAP_HOST && parsed.IMAP_USER && parsed.IMAP_PASS),
    firebaseConfigured: Boolean(
      parsed.FIREBASE_PROJECT_ID &&
        (parsed.GOOGLE_APPLICATION_CREDENTIALS ||
          parsed.FIREBASE_SERVICE_ACCOUNT_JSON ||
          (parsed.FIREBASE_CLIENT_EMAIL && parsed.FIREBASE_PRIVATE_KEY) ||
          parsed.FIRESTORE_EMULATOR_HOST),
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
