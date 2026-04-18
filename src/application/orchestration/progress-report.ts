export type ProgressReportStatus = 'done' | 'blocked' | 'need-change' | 'in-progress';

export interface ProgressReport {
  status: ProgressReportStatus;
  scope: string;
  outputs: string[];
  risks: string[];
  nextStep: string;
}

export interface ProgressReportInput {
  summary?: string;
  statusHint?: ProgressReportStatus;
  scopeHint?: string;
  outputsHint?: string[];
  risksHint?: string[];
  nextStepHint?: string;
}

const STATUS_ALIASES: Record<string, ProgressReportStatus> = {
  done: 'done',
  completed: 'done',
  complete: 'done',
  success: 'done',
  passed: 'done',
  blocked: 'blocked',
  failed: 'blocked',
  fail: 'blocked',
  error: 'blocked',
  needchange: 'need-change',
  'need-change': 'need-change',
  rework: 'need-change',
  inprogress: 'in-progress',
  'in-progress': 'in-progress',
  progress: 'in-progress',
  running: 'in-progress',
};

function clipText(input: string, maxChars: number): string {
  const text = input.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

function normalizeStatus(raw?: string, fallback: ProgressReportStatus = 'in-progress'): ProgressReportStatus {
  const key = String(raw ?? '')
    .toLowerCase()
    .replace(/[\s_]+/g, '')
    .trim();
  return STATUS_ALIASES[key] ?? fallback;
}

function inferStatus(summary: string, fallback: ProgressReportStatus): ProgressReportStatus {
  const text = summary.toLowerCase();
  if (/fail|error|阻塞|失败|异常|未通过/.test(text)) return 'blocked';
  if (/返工|重做|rework|need-change/.test(text)) return 'need-change';
  if (/完成|done|completed|通过/.test(text)) return 'done';
  return fallback;
}

function splitItems(lines: string[]): string[] {
  return lines
    .flatMap((line) =>
      line
        .split(/\s*[；;]\s*|\s{2,}/g)
        .map((part) => part.replace(/^[-*•\d.)\s]+/, '').trim())
    )
    .filter(Boolean);
}

function parseTaggedProgressReport(summary: string): Partial<ProgressReport> {
  const rawLines = summary
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const buckets: Record<'status' | 'scope' | 'outputs' | 'risks' | 'nextStep', string[]> = {
    status: [],
    scope: [],
    outputs: [],
    risks: [],
    nextStep: [],
  };

  let current: keyof typeof buckets | null = null;
  for (const line of rawLines) {
    const tag = line.match(/^\[(状态|范围|结果|风险|下一步)\]\s*(.*)$/);
    if (tag) {
      current =
        tag[1] === '状态'
          ? 'status'
          : tag[1] === '范围'
            ? 'scope'
            : tag[1] === '结果'
              ? 'outputs'
              : tag[1] === '风险'
                ? 'risks'
                : 'nextStep';
      if (tag[2]) buckets[current].push(tag[2]);
      continue;
    }
    if (current) {
      buckets[current].push(line);
    }
  }

  return {
    status: buckets.status[0] ? normalizeStatus(buckets.status[0], 'in-progress') : undefined,
    scope: buckets.scope[0] ? clipText(buckets.scope.join(' '), 160) : undefined,
    outputs: splitItems(buckets.outputs).slice(0, 3).map((item) => clipText(item, 160)),
    risks: splitItems(buckets.risks).slice(0, 2).map((item) => clipText(item, 160)),
    nextStep: buckets.nextStep[0] ? clipText(buckets.nextStep.join(' '), 160) : undefined,
  };
}

export function normalizeProgressReport(input: ProgressReportInput): ProgressReport {
  const summary = String(input.summary ?? '').trim();
  const parsed = summary ? parseTaggedProgressReport(summary) : {};
  const status = parsed.status ?? input.statusHint ?? inferStatus(summary, 'in-progress');
  const scope = parsed.scope || clipText(String(input.scopeHint ?? '当前节点'), 160) || '当前节点';

  const hintedOutputs = (input.outputsHint ?? []).map((item) => clipText(item, 160)).filter(Boolean);
  const hintedRisks = (input.risksHint ?? []).map((item) => clipText(item, 160)).filter(Boolean);

  const outputs =
    (parsed.outputs && parsed.outputs.length ? parsed.outputs : hintedOutputs).slice(0, 3);
  const risks = (parsed.risks && parsed.risks.length ? parsed.risks : hintedRisks).slice(0, 2);

  const defaultOutput =
    summary && status === 'done' ? [clipText(summary, 160)] : ['详见工作区最新产物与相关文档。'];
  const defaultRisk =
    summary && status !== 'done' ? [clipText(summary, 160)] : [];

  return {
    status,
    scope,
    outputs: outputs.length ? outputs : defaultOutput,
    risks: risks.length ? risks : defaultRisk,
    nextStep:
      parsed.nextStep ||
      clipText(
        String(
          input.nextStepHint ??
            (status === 'done' ? '等待直属上级审查或后续调度。' : '等待直属上级判断是否返工、重派或升级。')
        ),
        160
      ) ||
      '等待直属上级进一步安排。',
  };
}

export function formatProgressReport(
  report: ProgressReport,
  opts?: { header?: string; maxChars?: number }
): string {
  const lines = [
    opts?.header ? clipText(opts.header, 160) : '',
    `[状态] ${report.status}`,
    `[范围] ${clipText(report.scope, 180)}`,
    '[结果]',
    ...(report.outputs.length ? report.outputs : ['详见工作区最新产物与相关文档。']).map(
      (item) => `- ${clipText(item, 180)}`
    ),
    '[风险]',
    ...(report.risks.length ? report.risks : ['（无）']).map((item) => `- ${clipText(item, 180)}`),
    `[下一步] ${clipText(report.nextStep, 180)}`,
  ].filter(Boolean);

  const maxChars = Math.max(200, opts?.maxChars ?? (report.status === 'done' ? 600 : 900));
  const text = lines.join('\n');
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1)}…`;
}

export function summarizeProgressReport(report: ProgressReport): string {
  const outputs = report.outputs[0] ? `结果:${clipText(report.outputs[0], 80)}` : '';
  const risks = report.risks[0] ? `风险:${clipText(report.risks[0], 80)}` : '';
  return [report.status, outputs, risks].filter(Boolean).join(' | ');
}
