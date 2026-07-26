import fs from 'node:fs';
import { configSchema } from './schema.js';
import type { MarketMakerConfig } from '../types/config.js';

export function loadConfig(path = 'config/market-maker.example.json'): MarketMakerConfig {
  const raw = fs.readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw);
  return configSchema.parse(parsed) as MarketMakerConfig;
}
