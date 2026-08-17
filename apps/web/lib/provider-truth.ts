export type ProviderTruthStatus = 'provider-limited' | 'checking' | 'live' | 'modeled' | 'unavailable';

export function providerSecretSafeMessage(message: string | null | undefined) {
  if (!message) return null;
  return message
    .replace(/https?:\/\/[^\s"'<>]+/gi, (rawUrl) => {
      try {
        const url = new URL(rawUrl);
        for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, 'redacted');
        if (url.username) url.username = '***';
        if (url.password) url.password = '***';
        if (url.pathname && url.pathname !== '/') url.pathname = '/redacted';
        return url.toString();
      } catch {
        return '[redacted-url]';
      }
    })
    .replace(/\b(Authorization=)?(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, (_match, prefix = '', scheme) => `${prefix}${scheme} [redacted]`)
    .replace(/\b(api[-_]?key|token|secret|authorization|password)=([A-Za-z0-9._~+/=-]{8,})/gi, '$1=redacted');
}

export function providerStateFromRpcHealth(status: 'live' | 'provider-limited' | 'modeled' | 'unavailable') {
  if (status === 'live') return 'ok';
  if (status === 'provider-limited') return 'provider-limited';
  if (status === 'modeled') return 'modeled';
  return 'unavailable';
}

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
  return `Provider-limited: ${action} could not complete because the configured RPC/provider rejected, timed out, or quota-limited the request. This is not proof of an empty wallet or failed transaction. Detail: ${providerSecretSafeMessage(message)}`;
}
