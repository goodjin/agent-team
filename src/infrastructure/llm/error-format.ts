/**
 * 将各 LLM SDK 异常整理为可诊断的短文本，并提取可入库的 metadata
 */

export function formatLLMProviderError(err: unknown): string {
  if (err == null) return 'unknown error';
  if (typeof err !== 'object') return String(err);

  const e = err as Record<string, unknown> & { message?: string; status?: number };

  const status =
    typeof e.status === 'number'
      ? e.status
      : typeof (e as { response?: { status?: number } }).response?.status === 'number'
        ? (e as { response: { status: number } }).response.status
        : undefined;

  const msg = typeof e.message === 'string' ? e.message : String(e);

  let extra = '';
  const nested = (e as { error?: unknown }).error;
  if (nested && typeof nested === 'object') {
    try {
      extra = JSON.stringify(nested);
    } catch {
      extra = String(nested);
    }
  } else if (typeof nested === 'string') {
    extra = nested;
  }

  const code =
    nested && typeof nested === 'object' && nested !== null && 'code' in nested
      ? String((nested as { code?: unknown }).code ?? '')
      : '';

  const type =
    nested && typeof nested === 'object' && nested !== null && 'type' in nested
      ? String((nested as { type?: unknown }).type ?? '')
      : '';

  const parts: string[] = [];
  if (status !== undefined) parts.push(`HTTP ${status}`);
  if (code) parts.push(`code ${code}`);
  if (type) parts.push(`type ${type}`);
  parts.push(msg);
  if (extra && extra !== '{}' && !msg.includes(extra.slice(0, 80))) {
    parts.push(extra.length > 400 ? `${extra.slice(0, 400)}…` : extra);
  }

  return parts.filter(Boolean).join(' | ');
}

export function llmErrorMetadata(err: unknown): Record<string, unknown> {
  if (err == null) return {};
  if (typeof err !== 'object') return { raw: String(err) };

  const e = err as Record<string, unknown> & { status?: number; message?: string };
  const out: Record<string, unknown> = {
    message: typeof e.message === 'string' ? e.message : undefined,
    status: typeof e.status === 'number' ? e.status : undefined,
  };

  const resp = (e as { response?: { status?: number; data?: unknown } }).response;
  if (resp) {
    out.responseStatus = resp.status;
    if (resp.data !== undefined) {
      try {
        out.responseData =
          typeof resp.data === 'string'
            ? resp.data.slice(0, 2000)
            : JSON.stringify(resp.data).slice(0, 2000);
      } catch {
        out.responseData = String(resp.data).slice(0, 2000);
      }
    }
  }

  const nested = (e as { error?: unknown }).error;
  if (nested !== undefined) {
    try {
      out.providerError =
        typeof nested === 'string' ? nested : JSON.stringify(nested).slice(0, 2000);
    } catch {
      out.providerError = String(nested).slice(0, 2000);
    }
  }

  if (typeof (e as { code?: string }).code === 'string') {
    out.code = (e as { code: string }).code;
  }

  return out;
}
