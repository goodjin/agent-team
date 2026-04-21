export type IntentAction = 'plan' | 'execute' | 'research' | 'clarify' | 'review';
export type IntentComplexity = 'simple' | 'medium' | 'complex';
export type IntentSuggestedMode = 'direct' | 'plan' | 'ultrawork';

export interface IntentGateResult {
  intent: IntentAction;
  complexity: IntentComplexity;
  suggestedMode: IntentSuggestedMode;
  reasons: string[];
}

function countMatches(text: string, keywords: string[]): number {
  let count = 0;
  for (const kw of keywords) {
    if (text.includes(kw)) count++;
  }
  return count;
}

function detectListItems(text: string): number {
  const lines = text.split('\n');
  let hits = 0;
  for (const line of lines) {
    if (/^\s*[-*•]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      hits++;
    }
  }
  return hits;
}

export function classifyIntent(input: {
  content: string;
  taskTitle?: string;
  taskDescription?: string;
}): IntentGateResult {
  const base = [input.taskTitle, input.taskDescription, input.content].filter(Boolean).join('\n');
  const text = base.toLowerCase();
  const reasons: string[] = [];

  const planningKeywords = [
    '方案',
    '规划',
    '计划',
    '架构',
    '设计',
    '重构',
    '优化',
    '路线图',
    '策略',
  ];
  const executionKeywords = ['实现', '开发', '编写', '修复', '改造', '落地', '部署', '实现', '完成'];
  const researchKeywords = ['调研', '研究', '对比', '评估', '选型', 'benchmark', '比较'];
  const reviewKeywords = ['评审', 'review', '检查', '验收', '审核'];
  const clarifyKeywords = ['怎么', '如何', '为什么', '是什么', '解释', '原理'];

  const planScore = countMatches(text, planningKeywords);
  const execScore = countMatches(text, executionKeywords);
  const researchScore = countMatches(text, researchKeywords);
  const reviewScore = countMatches(text, reviewKeywords);
  const clarifyScore = countMatches(text, clarifyKeywords);

  const listCount = detectListItems(base);
  if (listCount >= 3) reasons.push('包含多条需求/清单');

  const length = base.length;
  if (length >= 600) reasons.push('文本较长');

  let complexity: IntentComplexity = 'simple';
  if (length >= 800 || listCount >= 6 || planScore >= 3) {
    complexity = 'complex';
  } else if (length >= 240 || listCount >= 2 || planScore >= 1 || researchScore >= 1) {
    complexity = 'medium';
  }

  let intent: IntentAction = 'execute';
  const scores: Array<[IntentAction, number]> = [
    ['plan', planScore],
    ['execute', execScore],
    ['research', researchScore],
    ['review', reviewScore],
    ['clarify', clarifyScore],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  if (scores[0][1] > 0) {
    intent = scores[0][0];
    reasons.push(`关键词命中: ${scores[0][0]}`);
  } else if (/\?$/.test(text) || clarifyScore > 0) {
    intent = 'clarify';
    reasons.push('以疑问句形式提出');
  }

  if (reasons.length === 0) reasons.push('默认判断');

  let suggestedMode: IntentSuggestedMode = 'direct';
  if (intent === 'plan' || intent === 'research' || complexity === 'complex') {
    suggestedMode = 'plan';
  } else if (complexity === 'medium' && intent === 'execute') {
    suggestedMode = 'direct';
  } else if (intent === 'clarify') {
    suggestedMode = 'plan';
  }

  return {
    intent,
    complexity,
    suggestedMode,
    reasons,
  };
}

export function formatIntentGate(result: IntentGateResult): string {
  const reason = result.reasons.length ? result.reasons.join('；') : '无';
  return [
    `- intent: ${result.intent}`,
    `- complexity: ${result.complexity}`,
    `- suggestedMode: ${result.suggestedMode}`,
    `- reasons: ${reason}`,
  ].join('\n');
}
