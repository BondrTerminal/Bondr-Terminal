import { buildJitoAddressLookupTablePlan } from '../../../../../lib/jito-address-lookup-table-plan';

export const dynamic = 'force-dynamic';

type AddressLookupTablePlanRequest = {
  authority?: string | null;
  payer?: string | null;
  lookupTableAddress?: string | null;
  addresses?: Array<string | null | undefined>;
  requiredAddresses?: Array<string | null | undefined>;
  recentSlot?: number | null;
  recentBlockhash?: string | null;
  includeUnsignedTransactions?: boolean;
  maxAddressesPerExtendTransaction?: number;
};

export async function POST(request: Request) {
  const observedAt = new Date().toISOString();
  let body: AddressLookupTablePlanRequest;
  try {
    body = await request.json() as AddressLookupTablePlanRequest;
  } catch {
    return Response.json({ status: 'error', observedAt, error: 'Invalid JSON body.', execution: 'jito-alt-plan-read-only' }, { status: 400 });
  }

  const plan = buildJitoAddressLookupTablePlan({
    authority: body.authority,
    payer: body.payer,
    lookupTableAddress: body.lookupTableAddress,
    addresses: body.addresses ?? [],
    requiredAddresses: body.requiredAddresses,
    recentSlot: body.recentSlot,
    recentBlockhash: body.recentBlockhash,
    includeUnsignedTransactions: body.includeUnsignedTransactions,
    maxAddressesPerExtendTransaction: body.maxAddressesPerExtendTransaction
  });

  return Response.json({
    status: plan.status === 'planned' ? 'ok' : 'blocked',
    observedAt,
    execution: 'jito-alt-plan-read-only',
    plan,
    safety: {
      noSigning: true,
      noBroadcast: true,
      noRelaySubmit: true,
      noServerCustody: true
    }
  }, { status: plan.status === 'planned' ? 200 : 400 });
}

export async function GET() {
  return Response.json({
    status: 'ok',
    observedAt: new Date().toISOString(),
    route: '/api/relay/jito/address-lookup-table-plan',
    contract: 'bondr-jito-address-lookup-table-plan-v1',
    execution: 'jito-alt-plan-read-only',
    requiredBody: {
      authority: 'lookup table authority public key',
      payer: 'fee payer public key',
      addresses: 'addresses to place in the lookup table',
      requiredAddresses: 'addresses that must be covered before packed transactions can use the ALT',
      recentSlot: 'required when deriving a new lookup table address',
      recentBlockhash: 'required only when includeUnsignedTransactions=true'
    },
    safety: {
      noSigning: true,
      noBroadcast: true,
      noRelaySubmit: true,
      noServerCustody: true
    }
  });
}
