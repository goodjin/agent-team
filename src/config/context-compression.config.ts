import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { ContextCompressorOptions } from '../application/memory/context-compressor.js';

/**
 * 与 `context-compression.config.json`（项目根）字段一致
 */
export interface ContextCompressionJson {
  softTokensMaster?: number;
  hardTokensMaster?: number;
  keepLastMasterTurns?: number;
  hardTokensMessages?: number;
  keepLastMessages?: number;
}

const ENV = {
  softTokensMaster: 'AGENT_CONTEXT_SOFT_MASTER_TOKENS',
  hardTokensMaster: 'AGENT_CONTEXT_HARD_MASTER_TOKENS',
  keepLastMasterTurns: 'AGENT_CONTEXT_KEEP_MASTER_TURNS',
  hardTokensMessages: 'AGENT_CONTEXT_HARD_MESSAGES_TOKENS',
  keepLastMessages: 'AGENT_CONTEXT_KEEP_MESSAGES',
} as const;

function positiveInt(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isInteger(v) && v > 0) return v;
  return undefined;
}

function envPositiveInt(key: string): number | undefined {
  const raw = process.env[key];
  if (!raw?.trim()) return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * 读取项目根 `context-compression.config.json`（可选），再由环境变量覆盖。
 * 未设置的项沿用 `ContextCompressor` 构造器内默认值。
 */
export function loadContextCompressionConfig(
  cwd: string = process.cwd()
): ContextCompressorOptions {
  const filePath = join(cwd, 'context-compression.config.json');
  let fromFile: ContextCompressionJson = {};

  if (existsSync(filePath)) {
    try {
      const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
      if (raw && typeof raw === 'object') {
        fromFile = raw as ContextCompressionJson;
      }
    } catch (e) {
      console.warn('[context-compression] invalid JSON, ignoring file:', filePath, e);
    }
  }

  const opts: ContextCompressorOptions = {
    softTokensMaster:
      envPositiveInt(ENV.softTokensMaster) ?? positiveInt(fromFile.softTokensMaster),
    hardTokensMaster:
      envPositiveInt(ENV.hardTokensMaster) ?? positiveInt(fromFile.hardTokensMaster),
    keepLastMasterTurns:
      envPositiveInt(ENV.keepLastMasterTurns) ?? positiveInt(fromFile.keepLastMasterTurns),
    hardTokensMessages:
      envPositiveInt(ENV.hardTokensMessages) ?? positiveInt(fromFile.hardTokensMessages),
    keepLastMessages:
      envPositiveInt(ENV.keepLastMessages) ?? positiveInt(fromFile.keepLastMessages),
  };

  if (
    opts.softTokensMaster !== undefined &&
    opts.hardTokensMaster !== undefined &&
    opts.hardTokensMaster < opts.softTokensMaster
  ) {
    console.warn(
      '[context-compression] hardTokensMaster < softTokensMaster；请检查配置与环境变量'
    );
  }

  return stripUndefined(opts);
}

function stripUndefined(o: ContextCompressorOptions): ContextCompressorOptions {
  const out: ContextCompressorOptions = { ...o };
  for (const k of Object.keys(out) as (keyof ContextCompressorOptions)[]) {
    if (out[k] === undefined) delete out[k];
  }
  return out;
}
