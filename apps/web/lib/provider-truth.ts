export type ProviderTruthStatus = 'provider-limited' | 'checking' | 'live' | 'modeled' | 'unavailable';

export function isProviderLimitedError(error: unknown) {
  const text = (error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error ?? '')).toLowerCase();
  return text.includes('429')
    || text.includes('quota')
    || text.includes('max usage')
    || text.includes('rate limit')
    || text.includes('too many requests')
    || text.includes('timed out')
    || text.includes('timeout')
    || text.includes('fetch failed')
    || text.includes('econnreset')
    || text.includes('etimedout')
    || text.includes('temporarily unavailable')
    || text.includes('service unavailable');
}

export function providerLimitedNote(error: unknown, action: string) {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'provider request failed';
  return `Provider-limited: ${action} could not complete because the configured RPC/provider rejected, timed out, or quota-limited the request. This is not proof of an empty wallet or failed transaction. Detail: ${message}`;
}
