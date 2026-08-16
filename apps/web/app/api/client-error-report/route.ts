import { z } from 'zod';

export const dynamic = 'force-dynamic';

const reportSchema = z.object({
  digest: z.string().max(120).optional(),
  name: z.string().max(120).optional(),
  message: z.string().max(500).optional(),
  path: z.string().max(300).optional(),
  userAgent: z.string().max(300).optional()
}).strict();

type ErrorReport = {
  observedAt: string;
  digest: string;
  name: string;
  message: string;
  path: string;
  userAgent: string;
};

const recentReports: ErrorReport[] = [];

function clean(value: string | undefined) {
  return value
    ?.replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]')
    .replace(/session(Token|Jwt)?["'=:\s]+[A-Za-z0-9._-]+/gi, 'session[redacted]')
    .slice(0, 500);
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
    userAgent: clean(parsed.data.userAgent) ?? 'unknown'
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
