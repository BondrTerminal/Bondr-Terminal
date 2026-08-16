import { z } from 'zod';

export const dynamic = 'force-dynamic';

const reportSchema = z.object({
  digest: z.string().max(120).optional(),
  name: z.string().max(120).optional(),
  message: z.string().max(500).optional(),
  path: z.string().max(300).optional(),
  userAgent: z.string().max(300).optional(),
  diagnostics: z.record(z.string(), z.unknown()).optional()
}).strict();

type ErrorReport = {
  observedAt: string;
  digest: string;
  name: string;
  message: string;
  path: string;
  userAgent: string;
  diagnostics?: Record<string, unknown>;
};

const recentReports: ErrorReport[] = [];

function clean(value: string | undefined) {
  return value
    ?.replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]')
    .replace(/session(Token|Jwt)?["'=:\s]+[A-Za-z0-9._-]+/gi, 'session[redacted]')
    .slice(0, 500);
}

function cleanDiagnosticValue(value: unknown): unknown {
  if (typeof value === 'string') return clean(value);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 24).map(cleanDiagnosticValue);
  if (!value || typeof value !== 'object') return undefined;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 40)) {
    if (/token|jwt|secret|private|seed|password|authorization|bearer/i.test(key)) {
      output[key] = '[redacted]';
      continue;
    }
    const cleaned = cleanDiagnosticValue(item);
    if (typeof cleaned !== 'undefined') output[key.slice(0, 80)] = cleaned;
  }
  return output;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ status: 'error', error: 'invalid-json' }, { status: 400, headers: { 'cache-control': 'no-store' } });
  }

  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ status: 'error', error: 'invalid-error-report' }, { status: 400, headers: { 'cache-control': 'no-store' } });
  }

  const report = {
    observedAt: new Date().toISOString(),
    digest: clean(parsed.data.digest) ?? 'no-digest',
    name: clean(parsed.data.name) ?? 'Error',
    message: clean(parsed.data.message) ?? 'No message',
    path: clean(parsed.data.path) ?? '/',
    userAgent: clean(parsed.data.userAgent) ?? 'unknown',
    diagnostics: cleanDiagnosticValue(parsed.data.diagnostics) as Record<string, unknown> | undefined
  };
  recentReports.unshift(report);
  recentReports.splice(20);
  console.error('BONDR client route error report', report);
  return Response.json({ status: 'ok', digest: report.digest }, { headers: { 'cache-control': 'no-store' } });
}

export async function GET() {
  return Response.json({
    status: 'ok',
    reports: recentReports.slice(0, 20)
  }, { headers: { 'cache-control': 'no-store' } });
}
