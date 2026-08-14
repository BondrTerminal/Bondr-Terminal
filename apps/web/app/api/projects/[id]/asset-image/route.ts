import { getMeridianWalletStore } from '../../../../../lib/durable-wallet-store';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

function decodeDataUrl(value?: string) {
  const match = value?.match(/^data:([^;,]+);base64,([a-z0-9+/=]+)$/i);
  if (!match) return null;
  return { contentType: match[1], bytes: Buffer.from(match[2], 'base64') };
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const store = await getMeridianWalletStore();
  const project = store.projects.find((item) => item.id === id);
  const asset = decodeDataUrl(project?.metadata.imageDataUrl);
  if (!project || !asset) return new Response('Token image not found.', { status: 404, headers: { 'cache-control': 'no-store' } });

  return new Response(asset.bytes, {
    headers: {
      'cache-control': 'private, no-store',
      'content-type': project.metadata.imageContentType ?? asset.contentType,
      'x-content-type-options': 'nosniff'
    }
  });
}
