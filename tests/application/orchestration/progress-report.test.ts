import { describe, expect, it } from 'vitest';

import {
  formatProgressReport,
  normalizeProgressReport,
} from '../../../src/application/orchestration/progress-report.js';

describe('progress report normalization', () => {
  it('parses tagged short reports into structured fields', () => {
    const report = normalizeProgressReport({
      summary: `[状态] done
[范围] 模块 module-a
[结果]
- 完成 API 改造
- 补充模块文档
[风险]
- 无
[下一步] 等待模块审查`,
    });

    expect(report).toMatchObject({
      status: 'done',
      scope: '模块 module-a',
      outputs: ['完成 API 改造', '补充模块文档'],
      risks: ['无'],
      nextStep: '等待模块审查',
    });
  });

  it('falls back to hints and enforces compact formatting', () => {
    const report = normalizeProgressReport({
      statusHint: 'blocked',
      scopeHint: '原子节点 node-1',
      summary: '测试失败，需补齐用例与错误处理',
      nextStepHint: '等待直属上级决定返工。',
    });

    const text = formatProgressReport(report, { header: '[系统·工人汇报]', maxChars: 240 });
    expect(report.status).toBe('blocked');
    expect(text).toContain('[状态] blocked');
    expect(text).toContain('[范围] 原子节点 node-1');
    expect(text.length).toBeLessThanOrEqual(240);
  });
});
