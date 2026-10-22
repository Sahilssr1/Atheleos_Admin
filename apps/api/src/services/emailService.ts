import nodemailer from 'nodemailer';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../utils/errors.js';

export function smtpTransport(cfg: AppConfig) {
  return nodemailer.createTransport({
    host: cfg.SMTP_HOST,
    port: cfg.SMTP_PORT,
    secure: cfg.smtpSecure,
    auth: cfg.SMTP_USER ? { user: cfg.SMTP_USER, pass: cfg.SMTP_PASS } : undefined,
  });
}

export async function verifySmtp(cfg: AppConfig): Promise<{ status: 'up' | 'down' | 'not_configured'; latencyMs: number | null }> {
  if (!cfg.smtpConfigured) return { status: 'not_configured', latencyMs: null };
  const start = Date.now();
  try {
    await smtpTransport(cfg).verify();
    return { status: 'up', latencyMs: Date.now() - start };
  } catch { return { status: 'down', latencyMs: Date.now() - start }; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function withImap<T>(cfg: AppConfig, fn: (client: any) => Promise<T>): Promise<T> {
  if (!cfg.imapConfigured) throw new AppError('EMAIL_NOT_CONFIGURED', 'IMAP is not configured on the server', 503);
  const { ImapFlow } = await import('imapflow');
  const client = new ImapFlow({
    host: cfg.IMAP_HOST, port: cfg.IMAP_PORT, secure: cfg.imapSecure,
    auth: { user: cfg.IMAP_USER, pass: cfg.IMAP_PASS },
    logger: false,
  });
  await client.connect();
  try { return await fn(client); } finally { try { await client.logout(); } catch { /* noop */ } }
}

export async function checkImap(cfg: AppConfig): Promise<{ status: 'up' | 'down' | 'not_configured'; latencyMs: number | null }> {
  if (!cfg.imapConfigured) return { status: 'not_configured', latencyMs: null };
  const start = Date.now();
  try {
    await withImap(cfg, async () => true);
    return { status: 'up', latencyMs: Date.now() - start };
  } catch { return { status: 'down', latencyMs: Date.now() - start }; }
}
