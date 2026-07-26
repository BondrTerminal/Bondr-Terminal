export type CapturedError = {
  observedAt: string;
  label: string;
  message: string;
  name: string;
  stack?: string;
  cause?: string;
};

export function captureError(error: unknown, label = 'runtime-error'): CapturedError {
  const observedAt = new Date().toISOString();

  if (error instanceof Error) {
    return {
      observedAt,
      label,
      message: error.message,
      name: error.name,
      stack: error.stack,
      cause: error.cause instanceof Error ? error.cause.message : String(error.cause ?? '') || undefined
    };
  }

  return {
    observedAt,
    label,
    message: typeof error === 'string' ? error : JSON.stringify(error),
    name: typeof error
  };
}

export async function safeAsync<T>(args: {
  label: string;
  run: () => Promise<T>;
  onError?: (error: CapturedError) => void;
}): Promise<{ ok: true; value: T } | { ok: false; error: CapturedError }> {
  try {
    return { ok: true, value: await args.run() };
  } catch (error) {
    const captured = captureError(error, args.label);
    args.onError?.(captured);
    return { ok: false, error: captured };
  }
}

export function safeSync<T>(args: {
  label: string;
  run: () => T;
  onError?: (error: CapturedError) => void;
}): { ok: true; value: T } | { ok: false; error: CapturedError } {
  try {
    return { ok: true, value: args.run() };
  } catch (error) {
    const captured = captureError(error, args.label);
    args.onError?.(captured);
    return { ok: false, error: captured };
  }
}
