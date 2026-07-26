#!/usr/bin/env bash
set -euo pipefail

# Run only after Yakuzamoto explicitly approves package installation.
cd "$(dirname "$0")/.."

printf '%s\n' 'Installing Solana SPL market-maker project dependencies with pnpm...'
pnpm install

printf '%s\n' 'Running project doctor...'
pnpm doctor

printf '%s\n' 'Running TypeScript check...'
pnpm check

printf '%s\n' 'Running tests...'
pnpm test
