import { meridianObligationMatrix } from '../../../lib/obligation-matrix';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({
    phase: 'backend-wired-live-gated',
    execution: 'disabled',
    obligation: 'Represent current source truth for each Bond.Terminal section; do not imply live operation.',
    matrix: meridianObligationMatrix
  });
}
