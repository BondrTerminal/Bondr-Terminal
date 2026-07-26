export const dynamic = 'force-dynamic';

const MIN_INTERVAL_MS = 3_000;
const MAX_INTERVAL_MS = 10_000;
const DEFAULT_INTERVAL_MS = 5_000;
const MAX_STREAM_SNAPSHOTS = 240;
const SNAPSHOT_TIMEOUT_MS = 8_000;

function boundedInterval(value: string | null) {
  const parsed = Number(value ?? DEFAULT_INTERVAL_MS);
  if (!Number.isFinite(parsed)) return DEFAULT_INTERVAL_MS;
  return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.round(parsed)));
}

function sseComment(text: string) {
  return `: ${text}\n\n`;
}

function sse(event: string, data: unknown) {
  return `event: ${event}
data: ${JSON.stringify(data)}

`;
}

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const intervalMs = boundedInterval(searchParams.get('intervalMs'));
  searchParams.delete('intervalMs');
  const search = searchParams.toString() ? `?${searchParams.toString()}` : '';
  const encoder = new TextEncoder();
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let count = 0;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sse(event, payload)));
        } catch {
          closed = true;
        }
      };
      const sendComment = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseComment(text)));
        } catch {
          closed = true;
        }
      };

      const tick = async () => {
        if (closed) return;
        count += 1;
        sendComment('heartbeat');
        send('heartbeat', {
          status: 'connected',
          source: 'terminal-stream',
          observedAt: new Date().toISOString(),
          intervalMs,
          count,
          contract: 'terminal-stream-v1'
        });
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), Math.max(1_000, Math.min(SNAPSHOT_TIMEOUT_MS, intervalMs - 250)));
          const response = await fetch(`${origin}/api/terminal/snapshot${search}`, { cache: 'no-store', signal: controller.signal }).finally(() => clearTimeout(timeout));
          const payload = await response.json().catch(() => ({ status: 'error', error: 'Snapshot JSON parse failed.' }));
          send(response.ok ? 'snapshot' : 'partial', {
            ...payload,
            stream: {
              status: response.ok ? 'connected' : 'partial',
              source: 'terminal-stream',
              observedAt: new Date().toISOString(),
              intervalMs,
              httpStatus: response.status,
              note: response.ok ? 'Persistent SSE snapshot refresh.' : 'Snapshot route returned degraded status.'
            }
          });
        } catch (error) {
          send('partial', {
            status: 'partial',
            source: 'terminal-stream',
            observedAt: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Terminal stream snapshot fetch failed.',
            note: 'Stream stayed open after provider/snapshot error.'
          });
        }

        if (count >= MAX_STREAM_SNAPSHOTS) {
          send('end', { status: 'closed', source: 'terminal-stream', observedAt: new Date().toISOString(), note: 'Max stream snapshot count reached; client should reconnect.' });
          closed = true;
          controller.close();
          return;
        }
        timer = setTimeout(tick, intervalMs);
      };

      request.signal.addEventListener('abort', () => {
        closed = true;
        if (timer) clearTimeout(timer);
        try { controller.close(); } catch { /* already closed */ }
      });

      send('open', { status: 'connected', source: 'terminal-stream', observedAt: new Date().toISOString(), intervalMs, contract: 'terminal-stream-v1' });
      void tick();
    },
    cancel() {
      closed = true;
      if (timer) clearTimeout(timer);
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no'
    }
  });
}
