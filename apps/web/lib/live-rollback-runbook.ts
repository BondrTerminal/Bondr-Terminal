export type RollbackEnvStep = {
  key: string;
  rollbackValue: 'false';
  reason: string;
};

export const SINGLE_BROADCAST_ROLLBACK_ENV: RollbackEnvStep[] = [
  { key: 'LIVE_BETA_BROADCAST_ENABLED', rollbackValue: 'false', reason: 'Close the broad signed-transaction broadcast gate first.' },
  { key: 'LIVE_DEPLOYMENT_ENABLED', rollbackValue: 'false', reason: 'Close launch/deployment adapters before any follow-up build can submit.' },
  { key: 'LIVE_BETA_FUNDING_BROADCAST_ARMED', rollbackValue: 'false', reason: 'Disarm funding before changing the funding gate itself.' },
  { key: 'LIVE_BETA_FUNDING_BROADCAST_ENABLED', rollbackValue: 'false', reason: 'Close the funding-specific broadcast gate.' },
  { key: 'LIVE_BETA_SIGNING_ENABLED', rollbackValue: 'false', reason: 'Close browser-wallet signing UI after broadcast/deploy gates are closed.' },
  { key: 'LIVE_TRADING_ENABLED', rollbackValue: 'false', reason: 'Return BONDR to preview/read-only mode.' }
];

export function buildSingleBroadcastRollbackRunbook() {
  return {
    contract: 'bondr-single-broadcast-rollback-runbook-v1',
    mode: 'documentation-only-no-mutation',
    approvalRequired: true,
    immediateRollbackRequired: 'after exactly one approved broadcast attempt, whether it succeeds, fails, or is abandoned',
    envOrder: SINGLE_BROADCAST_ROLLBACK_ENV,
    vercelCliTemplate: [
      'vercel env rm LIVE_BETA_BROADCAST_ENABLED production --yes && printf false | vercel env add LIVE_BETA_BROADCAST_ENABLED production',
      'vercel env rm LIVE_DEPLOYMENT_ENABLED production --yes && printf false | vercel env add LIVE_DEPLOYMENT_ENABLED production',
      'vercel env rm LIVE_BETA_FUNDING_BROADCAST_ARMED production --yes && printf false | vercel env add LIVE_BETA_FUNDING_BROADCAST_ARMED production',
      'vercel env rm LIVE_BETA_FUNDING_BROADCAST_ENABLED production --yes && printf false | vercel env add LIVE_BETA_FUNDING_BROADCAST_ENABLED production',
      'vercel env rm LIVE_BETA_SIGNING_ENABLED production --yes && printf false | vercel env add LIVE_BETA_SIGNING_ENABLED production',
      'vercel env rm LIVE_TRADING_ENABLED production --yes && printf false | vercel env add LIVE_TRADING_ENABLED production',
      'vercel redeploy https://solana-spl-market-maker.vercel.app --target production'
    ],
    verification: {
      singleBroadcastPolicy: {
        maxRetries: 0,
        blindRetries: false,
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      },
      requiredRoutes: [
        '/api/execution-capabilities',
        '/api/terminal/live-readiness',
        '/api/deployment-engine?project=sda'
      ],
      requiredCapabilityState: {
        liveTradingEnabled: false,
        signingEnabled: false,
        broadcastEnabled: false,
        fundingBroadcastEnabled: false,
        deploymentEnabled: false,
        readinessLevel: 'disabled'
      },
      blockedProbe: {
        method: 'POST',
        route: '/api/send-signed-transaction',
        expectedStatus: [401, 403],
        expectedNoSignature: true,
        expectedExecutionNot: 'broadcast-signed-transaction'
      }
    },
    safety: {
      noPrivateKeys: true,
      noSigning: true,
      noBroadcast: true,
      noFunding: true,
      noLaunch: true,
      noLpAction: true,
      note: 'This object is a rollback checklist only. It does not read, write, or mutate Vercel environment variables.'
    }
  } as const;
}
