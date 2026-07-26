# Error Recovery Protocol

_Last updated: 2026-07-06_

Yakuzamoto correction: small issues must not stop the entire work process.

## Default response to an error

When an error appears:

1. Capture the exact error text.
2. Identify the likely root cause.
3. Inspect the nearest related files/config.
4. Patch the root cause.
5. Patch adjacent obvious failure points.
6. Run the smallest meaningful verification.
7. Continue to the next task.

## Do not stop unless blocked by

- explicit approval requirement,
- credentials/API keys/private keys,
- money/funding/live trading,
- destructive action,
- external public action,
- one missing decision that cannot be inferred safely.

## Current project examples

### Text corruption / placeholder errors

If scan finds triple-star marker corruption, unicode ellipsis corruption, malformed env lines, or bad placeholders:

- hard-overwrite the small affected config file,
- re-run JSON/static scan,
- continue.

### TypeScript import/type error

If `pnpm check` fails after install:

- copy exact TS error,
- inspect the referenced file and imported type/package,
- patch the smallest type-safe fix,
- re-run `pnpm check`,
- continue to tests.

### Dependency install error

If `pnpm install` fails:

- capture package/error/version,
- check package metadata/version compatibility,
- patch `package.json` only if the fix is clear,
- re-run install once,
- if still blocked, report exact blocker.

### Runtime read-only observation error

If `pnpm observe` fails:

- capture RPC/Jupiter/SPL error,
- verify config mint/wallet is public-key-only,
- test whether failure is RPC rate limit, bad mint, missing token account, or Jupiter route issue,
- patch observation code or config guidance,
- do not move into live execution.

## Bot code support

`src/runtime/errors.ts` provides:

- `captureError()`
- `safeSync()`
- `safeAsync()`

Use these around future runtime loops so failures become structured events instead of unhandled crashes.
