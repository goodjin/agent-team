/**
 * Project Agent 错误代码体系
 * 提供统一的错误分类、错误代码和用户友好错误信息
 */

/**
 * 错误代码枚举
 */
export enum ErrorCode {
  // 配置错误 (1xxx)
  CONFIG_FILE_NOT_FOUND = 'CONFIG_001',
  CONFIG_PARSE_ERROR = 'CONFIG_002',
  CONFIG_INVALID_API_KEY = 'CONFIG_003',
  CONFIG_PROVIDER_NOT_FOUND = 'CONFIG_004',
  CONFIG_MODEL_NOT_FOUND = 'CONFIG_005',
  CONFIG_MISSING_REQUIRED_FIELD = 'CONFIG_006',

  // LLM 调用错误 (2xxx)
  LLM_API_ERROR = 'LLM_001',
  LLM_TIMEOUT = 'LLM_002',
  LLM_RATE_LIMITED = 'LLM_003',
  LLM_INVALID_RESPONSE = 'LLM_004',
  LLM_AUTH_ERROR = 'LLM_005',
  LLM_CONNECTION_ERROR = 'LLM_006',
  LLM_SERVER_ERROR = 'LLM_007',

  // 任务执行错误 (3xxx)
  TASK_NOT_FOUND = 'TASK_001',
  TASK_INVALID_INPUT = 'TASK_002',
  TASK_ROLE_NOT_ASSIGNED = 'TASK_003',
  TASK_DEPENDENCY_FAILED = 'TASK_004',
  TASK_TIMEOUT = 'TASK_005',
  TASK_CANCELLED = 'TASK_006',
  TASK_EXECUTION_FAILED = 'TASK_007',

  // 工具执行错误 (4xxx)
  TOOL_NOT_FOUND = 'TOOL_001',
  TOOL_EXECUTION_FAILED = 'TOOL_002',
  TOOL_INVALID_PARAMS = 'TOOL_003',
  TOOL_PERMISSION_DENIED = 'TOOL_004',
  TOOL_TIMEOUT = 'TOOL_005',
  TOOL_NOT_AVAILABLE = 'TOOL_006',

  // 工作流错误 (5xxx)
  WORKFLOW_NOT_FOUND = 'WORKFLOW_001',
  WORKFLOW_STEP_FAILED = 'WORKFLOW_002',
  WORKFLOW_CYCLE_DETECTED = 'WORKFLOW_003',
  WORKFLOW_INVALID_STEP = 'WORKFLOW_004',

  // 角色错误 (6xxx)
  ROLE_NOT_FOUND = 'ROLE_001',
  ROLE_INVALID_CONFIG = 'ROLE_002',
  ROLE_EXECUTION_FAILED = 'ROLE_003',

  // 文件操作错误 (7xxx)
  FILE_NOT_FOUND = 'FILE_001',
  FILE_READ_ERROR = 'FILE_002',
  FILE_WRITE_ERROR = 'FILE_003',
  FILE_PERMISSION_DENIED = 'FILE_004',
  FILE_PATH_INVALID = 'FILE_005',

  // 系统错误 (9xxx)
  INTERNAL_ERROR = 'SYS_001',
  UNKNOWN_ERROR = 'SYS_999',
}

/**
 * 错误分类
 */
export enum ErrorCategory {
  CONFIG = 'config',
  LLM = 'llm',
  TASK = 'task',
  TOOL = 'tool',
  WORKFLOW = 'workflow',
  ROLE = 'role',
  FILE = 'file',
  SYSTEM = 'system',
}

/**
 * 错误严重程度
 */
export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * 用户友好错误接口
 */
export interface UserFriendlyError {
  code: ErrorCode;
  category: ErrorCategory;
  title: string;
  message: string;
  details?: string;
  suggestions: string[];
  documentation?: string;
  severity: ErrorSeverity;
}

/**
 * 错误上下文信息
 */
export interface ErrorContext {
  taskId?: string;
  taskTitle?: string;
  toolName?: string;
  provider?: string;
  model?: string;
  filePath?: string;
  roleType?: string;
  workflowId?: string;
  stepId?: string;
}

/**
 * 错误描述映射
 */
export const ERROR_MESSAGES: Record<ErrorCode, Omit<UserFriendlyError, 'code' | 'category'>> = {
  // 配置错误
  [ErrorCode.CONFIG_FILE_NOT_FOUND]: {
    title: '配置文件未找到',
    message: '无法找到指定的配置文件',
    severity: 'error',
    suggestions: [
      '检查文件路径是否正确',
      '确认文件是否存在',
      '使用绝对路径尝试',
    ],
    documentation: 'docs/LLM_CONFIG_GUIDE.md',
  },
  [ErrorCode.CONFIG_PARSE_ERROR]: {
    title: '配置文件解析失败',
    message: '配置文件的格式不正确，无法解析',
    severity: 'error',
    suggestions: [
      '检查配置文件语法是否正确',
      '确认使用有效的 JSON/YAML 格式',
      '参考示例配置文件',
    ],
    documentation: 'docs/LLM_CONFIG_GUIDE.md',
  },
  [ErrorCode.CONFIG_INVALID_API_KEY]: {
    title: 'API Key 无效',
    message: '提供的 API Key 格式不正确或已过期',
    severity: 'error',
    suggestions: [
      '检查 API Key 是否正确复制',
      '确认 API Key 未过期',
      '检查是否有拼写错误',
    ],
    documentation: 'docs/LLM_CONFIG_GUIDE.md',
  },
  [ErrorCode.CONFIG_PROVIDER_NOT_FOUND]: {
    title: 'LLM 服务商未配置',
    message: '未找到请求的 LLM 服务商配置',
    severity: 'error',
    suggestions: [
      '检查 llm.config.json 是否包含该服务商',
      '确认服务商名称拼写正确',
      '参考支持的服务商列表',
    ],
    documentation: 'docs/LLM_CONFIG_GUIDE.md',
  },
  [ErrorCode.CONFIG_MODEL_NOT_FOUND]: {
    title: '模型配置不存在',
    message: '请求的模型未在配置中找到',
    severity: 'error',
    suggestions: [
      '检查模型名称是否正确',
      '确认模型已在配置中定义',
      '考虑使用其他可用的模型',
    ],
    documentation: 'docs/LLM_CONFIG_GUIDE.md',
  },
  [ErrorCode.CONFIG_MISSING_REQUIRED_FIELD]: {
    title: '缺少必要配置项',
    message: '配置中缺少必要的字段',
    severity: 'error',
    suggestions: [
      '检查配置文件是否完整',
      '参考文档中的必需字段列表',
      '使用默认配置作为参考',
    ],
  },

  // LLM 调用错误
  [ErrorCode.LLM_TIMEOUT]: {
    title: 'API 调用超时',
    message: 'LLM 服务响应时间过长，请检查网络连接',
    severity: 'warning',
    suggestions: [
      '检查网络连接是否稳定',
      '稍后重试操作',
      '考虑使用其他服务商',
      '增加超时时间配置',
    ],
  },
  [ErrorCode.LLM_API_ERROR]: {
    title: 'API 调用失败',
    message: 'LLM 服务返回错误',
    severity: 'error',
    suggestions: [
      '检查 API Key 是否有效',
      '确认服务商服务状态正常',
      '查看错误详情日志',
      '尝试使用其他模型',
    ],
  },
  [ErrorCode.LLM_RATE_LIMITED]: {
    title: '请求频率超限',
    message: '触发了 API 调用频率限制',
    severity: 'warning',
    suggestions: [
      '等待一段时间后重试',
      '减少请求频率',
      '联系服务商提升配额',
      '考虑使用其他服务商',
    ],
  },
  [ErrorCode.LLM_INVALID_RESPONSE]: {
    title: 'API 响应格式错误',
    message: 'LLM 返回的响应格式无法解析',
    severity: 'error',
    suggestions: [
      '可能是模型配置问题',
      '尝试使用其他模型',
      '检查网络连接',
    ],
  },
  [ErrorCode.LLM_AUTH_ERROR]: {
    title: 'API 认证失败',
    message: 'API 认证失败，请检查 API Key',
    severity: 'error',
    suggestions: [
      '确认 API Key 正确且有效',
      '检查 API Key 是否有访问权限',
      '确认服务商账户状态正常',
    ],
  },
  [ErrorCode.LLM_CONNECTION_ERROR]: {
    title: '网络连接失败',
    message: '无法连接到 LLM 服务',
    severity: 'error',
    suggestions: [
      '检查网络连接',
      '确认服务商服务地址正确',
      '检查防火墙设置',
      '尝试使用代理',
    ],
  },
  [ErrorCode.LLM_SERVER_ERROR]: {
    title: 'LLM 服务端错误',
    message: 'LLM 服务端发生内部错误',
    severity: 'error',
    suggestions: [
      '等待一段时间后重试',
      '检查服务商状态页面',
      '尝试使用其他服务商',
    ],
  },

  // 任务执行错误
  [ErrorCode.TASK_NOT_FOUND]: {
    title: '任务不存在',
    message: '指定的任务 ID 不存在',
    severity: 'error',
    suggestions: [
      '检查任务 ID 是否正确',
      '确认任务已被创建',
    ],
  },
  [ErrorCode.TASK_INVALID_INPUT]: {
    title: '任务输入无效',
    message: '提供的任务参数不符合要求',
    severity: 'error',
    suggestions: [
      '检查必填字段是否都已提供',
      '验证参数格式是否正确',
      '参考 API 文档',
    ],
    documentation: 'docs/API.md',
  },
  [ErrorCode.TASK_ROLE_NOT_ASSIGNED]: {
    title: '任务未分配角色',
    message: '任务没有分配执行角色',
    severity: 'error',
    suggestions: [
      '为任务指定 assignedRole',
      '使用支持的角色类型',
    ],
  },
  [ErrorCode.TASK_DEPENDENCY_FAILED]: {
    title: '任务依赖失败',
    message: '任务的依赖任务执行失败',
    severity: 'error',
    suggestions: [
      '检查依赖任务的错误信息',
      '解决依赖任务的问题后重试',
      '移除不必要的依赖',
    ],
  },
  [ErrorCode.TASK_TIMEOUT]: {
    title: '任务执行超时',
    message: '任务执行时间超过限制',
    severity: 'warning',
    suggestions: [
      '增加任务超时时间',
      '简化任务内容',
      '将任务拆分为多个子任务',
    ],
  },
  [ErrorCode.TASK_CANCELLED]: {
    title: '任务已取消',
    message: '任务被用户或系统取消',
    severity: 'info',
    suggestions: [
      '如需继续，请重新创建任务',
    ],
  },
  [ErrorCode.TASK_EXECUTION_FAILED]: {
    title: '任务执行失败',
    message: '任务执行过程中发生错误',
    severity: 'error',
    suggestions: [
      '查看详细错误信息',
      '检查输入参数是否正确',
      '参考相关文档',
    ],
  },

  // 工具执行错误
  [ErrorCode.TOOL_NOT_FOUND]: {
    title: '工具不存在',
    message: '请求的工具未注册',
    severity: 'error',
    suggestions: [
      '使用 agent.getAvailableTools() 查看可用工具',
      '检查工具名称拼写',
      '确认工具已注册',
    ],
  },
  [ErrorCode.TOOL_EXECUTION_FAILED]: {
    title: '工具执行失败',
    message: '工具执行过程中发生错误',
    severity: 'error',
    suggestions: [
      '检查输入参数是否正确',
      '查看工具执行日志',
      '确认工具所需资源可用',
    ],
  },
  [ErrorCode.TOOL_INVALID_PARAMS]: {
    title: '工具参数无效',
    message: '提供的工具参数不符合要求',
    severity: 'error',
    suggestions: [
      '检查参数类型和格式',
      '参考工具的参数说明',
      '确认必填参数都已提供',
    ],
  },
  [ErrorCode.TOOL_PERMISSION_DENIED]: {
    title: '工具权限不足',
    message: '没有执行该工具的权限',
    severity: 'error',
    suggestions: [
      '检查用户权限配置',
      '确认工具是否需要特殊权限',
      '联系管理员获取权限',
    ],
  },
  [ErrorCode.TOOL_TIMEOUT]: {
    title: '工具执行超时',
    message: '工具执行时间超过限制',
    severity: 'warning',
    suggestions: [
      '增加工具超时时间',
      '简化操作内容',
      '检查外部服务响应时间',
    ],
  },
  [ErrorCode.TOOL_NOT_AVAILABLE]: {
    title: '工具不可用',
    message: '工具当前不可用',
    severity: 'error',
    suggestions: [
      '检查工具是否已启用',
      '确认工具依赖服务正常运行',
      '查看工具配置',
    ],
  },

  // 工作流错误
  [ErrorCode.WORKFLOW_NOT_FOUND]: {
    title: '工作流不存在',
    message: '指定的工作流 ID 不存在',
    severity: 'error',
    suggestions: [
      '检查工作流 ID 是否正确',
      '确认工作流已被注册',
    ],
  },
  [ErrorCode.WORKFLOW_STEP_FAILED]: {
    title: '工作流步骤失败',
    message: '工作流中的某个步骤执行失败',
    severity: 'error',
    suggestions: [
      '查看失败步骤的详细信息',
      '解决步骤中的问题',
      '可以从失败步骤继续执行',
    ],
  },
  [ErrorCode.WORKFLOW_CYCLE_DETECTED]: {
    title: '检测到循环依赖',
    message: '工作流步骤之间存在循环依赖',
    severity: 'error',
    suggestions: [
      '检查工作流定义中的 dependencies',
      '移除不必要的循环依赖',
      '重新设计工作流流程',
    ],
  },
  [ErrorCode.WORKFLOW_INVALID_STEP]: {
    title: '工作流步骤无效',
    message: '工作流步骤配置不正确',
    severity: 'error',
    suggestions: [
      '检查步骤配置是否完整',
      '确认步骤引用的角色和任务类型有效',
    ],
  },

  // 角色错误
  [ErrorCode.ROLE_NOT_FOUND]: {
    title: '角色不存在',
    message: '请求的角色类型不存在',
    severity: 'error',
    suggestions: [
      '使用 agent.getAvailableRoles() 查看可用角色',
      '检查角色名称拼写',
      '确认角色已注册',
    ],
  },
  [ErrorCode.ROLE_INVALID_CONFIG]: {
    title: '角色配置无效',
    message: '角色配置不正确',
    severity: 'error',
    suggestions: [
      '检查角色配置文件',
      '确认必填字段都已提供',
      '参考角色配置示例',
    ],
  },
  [ErrorCode.ROLE_EXECUTION_FAILED]: {
    title: '角色执行失败',
    message: '角色执行过程中发生错误',
    severity: 'error',
    suggestions: [
      '查看详细错误信息',
      '检查角色配置',
      '尝试使用其他角色',
    ],
  },

  // 文件操作错误
  [ErrorCode.FILE_NOT_FOUND]: {
    title: '文件不存在',
    message: '指定的文件或目录不存在',
    severity: 'error',
    suggestions: [
      '检查文件路径是否正确',
      '确认文件是否存在',
      '使用 ls 命令查看目录内容',
    ],
  },
  [ErrorCode.FILE_READ_ERROR]: {
    title: '文件读取失败',
    message: '无法读取文件内容',
    severity: 'error',
    suggestions: [
      '检查文件权限',
      '确认文件未被其他程序占用',
      '检查磁盘空间',
    ],
  },
  [ErrorCode.FILE_WRITE_ERROR]: {
    title: '文件写入失败',
    message: '无法写入文件',
    severity: 'error',
    suggestions: [
      '检查目录权限',
      '确认磁盘空间充足',
      '检查文件是否为只读',
    ],
  },
  [ErrorCode.FILE_PERMISSION_DENIED]: {
    title: '文件访问被拒绝',
    message: '没有访问该文件的权限',
    severity: 'error',
    suggestions: [
      '检查文件权限设置',
      '确认当前用户有访问权限',
      '使用 chmod 修改权限',
    ],
  },
  [ErrorCode.FILE_PATH_INVALID]: {
    title: '文件路径无效',
    message: '提供的文件路径格式不正确',
    severity: 'error',
    suggestions: [
      '检查路径格式是否正确',
      '确认路径不包含非法字符',
      '使用绝对路径',
    ],
  },

  // 系统错误
  [ErrorCode.INTERNAL_ERROR]: {
    title: '内部错误',
    message: '系统内部发生错误',
    severity: 'critical',
    suggestions: [
      '请稍后重试',
      '如果问题持续，请提交 Issue',
      '查看日志获取更多详情',
    ],
    documentation: 'https://github.com/example/project-agent/issues',
  },
  [ErrorCode.UNKNOWN_ERROR]: {
    title: '未知错误',
    message: '发生了未知错误',
    severity: 'error',
    suggestions: [
      '请检查输入参数是否正确',
      '参考文档排查问题',
      '如果问题持续，请提交 Issue',
    ],
  },
};

/**
 * 获取错误分类
 */
export function getErrorCategory(code: ErrorCode): ErrorCategory {
  const prefix = code.split('_')[0];
  switch (prefix) {
    case 'CONFIG':
      return ErrorCategory.CONFIG;
    case 'LLM':
      return ErrorCategory.LLM;
    case 'TASK':
      return ErrorCategory.TASK;
    case 'TOOL':
      return ErrorCategory.TOOL;
    case 'WORKFLOW':
      return ErrorCategory.WORKFLOW;
    case 'ROLE':
      return ErrorCategory.ROLE;
    case 'FILE':
      return ErrorCategory.FILE;
    default:
      return ErrorCategory.SYSTEM;
  }
}

/**
 * 根据错误消息分类错误
 */
export function categorizeError(message: string): ErrorCode {
  const lowerMessage = message.toLowerCase();

  // 配置错误
  if (lowerMessage.includes('file') && lowerMessage.includes('not found')) {
    return ErrorCode.CONFIG_FILE_NOT_FOUND;
  }
  if (lowerMessage.includes('parse') || lowerMessage.includes('json')) {
    return ErrorCode.CONFIG_PARSE_ERROR;
  }
  if (lowerMessage.includes('api key') || lowerMessage.includes('auth') || lowerMessage.includes('unauthorized')) {
    return ErrorCode.CONFIG_INVALID_API_KEY;
  }
  if (lowerMessage.includes('provider') && (lowerMessage.includes('not found') || lowerMessage.includes('unsupported'))) {
    return ErrorCode.CONFIG_PROVIDER_NOT_FOUND;
  }
  if (lowerMessage.includes('model') && lowerMessage.includes('not found')) {
    return ErrorCode.CONFIG_MODEL_NOT_FOUND;
  }

  // LLM 错误
  if (lowerMessage.includes('timeout')) {
    return ErrorCode.LLM_TIMEOUT;
  }
  if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many requests')) {
    return ErrorCode.LLM_RATE_LIMITED;
  }
  if (lowerMessage.includes('connection') || lowerMessage.includes('network')) {
    return ErrorCode.LLM_CONNECTION_ERROR;
  }
  if (lowerMessage.includes('server error') || lowerMessage.includes('500')) {
    return ErrorCode.LLM_SERVER_ERROR;
  }
  if (lowerMessage.includes('invalid response') || lowerMessage.includes('parse error')) {
    return ErrorCode.LLM_INVALID_RESPONSE;
  }
  if (lowerMessage.includes('api error') || lowerMessage.includes('request failed')) {
    return ErrorCode.LLM_API_ERROR;
  }

  // 任务错误
  if (lowerMessage.includes('task') && lowerMessage.includes('not found')) {
    return ErrorCode.TASK_NOT_FOUND;
  }
  if ((lowerMessage.includes('task') || lowerMessage.includes('input')) && lowerMessage.includes('invalid')) {
    return ErrorCode.TASK_INVALID_INPUT;
  }
  if (lowerMessage.includes('role') && lowerMessage.includes('not assigned')) {
    return ErrorCode.TASK_ROLE_NOT_ASSIGNED;
  }
  if (lowerMessage.includes('dependency') && lowerMessage.includes('failed')) {
    return ErrorCode.TASK_DEPENDENCY_FAILED;
  }
  if (lowerMessage.includes('cancelled') || lowerMessage.includes('canceled')) {
    return ErrorCode.TASK_CANCELLED;
  }

  // 工具错误
  if (lowerMessage.includes('tool') && lowerMessage.includes('not found')) {
    return ErrorCode.TOOL_NOT_FOUND;
  }
  if (lowerMessage.includes('tool') && lowerMessage.includes('permission')) {
    return ErrorCode.TOOL_PERMISSION_DENIED;
  }
  if (lowerMessage.includes('tool') && lowerMessage.includes('invalid')) {
    return ErrorCode.TOOL_INVALID_PARAMS;
  }
  if (lowerMessage.includes('tool') && lowerMessage.includes('timeout')) {
    return ErrorCode.TOOL_TIMEOUT;
  }

  // 文件错误
  if (lowerMessage.includes('file') && lowerMessage.includes('not found')) {
    return lowerMessage.includes('config') ? ErrorCode.CONFIG_FILE_NOT_FOUND : ErrorCode.FILE_NOT_FOUND;
  }
  if (lowerMessage.includes('permission') && (lowerMessage.includes('denied') || lowerMessage.includes('access'))) {
    return ErrorCode.FILE_PERMISSION_DENIED;
  }

  return ErrorCode.UNKNOWN_ERROR;
}

/**
 * 获取用户友好错误
 */
export function getUserFriendlyError(
  error: Error | string,
  context?: ErrorContext
): UserFriendlyError {
  // 解析原始错误
  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorCode = categorizeError(errorMessage);

  // 获取错误描述
  const errorDesc = ERROR_MESSAGES[errorCode] || {
    title: '发生错误',
    message: errorMessage,
    severity: 'error' as ErrorSeverity,
    suggestions: [
      '请检查输入参数是否正确',
      '参考文档排查问题',
      '如果问题持续，请提交 Issue',
    ],
  };

  // 构建详细信息
  let details = '';
  if (context) {
    const contextParts: string[] = [];

    if (context.taskId) {
      contextParts.push(`任务 ID: ${context.taskId}`);
    }
    if (context.taskTitle) {
      contextParts.push(`任务标题: ${context.taskTitle}`);
    }
    if (context.toolName) {
      contextParts.push(`工具名称: ${context.toolName}`);
    }
    if (context.provider) {
      contextParts.push(`LLM 服务商: ${context.provider}`);
    }
    if (context.model) {
      contextParts.push(`模型: ${context.model}`);
    }
    if (context.filePath) {
      contextParts.push(`文件路径: ${context.filePath}`);
    }
    if (context.roleType) {
      contextParts.push(`角色类型: ${context.roleType}`);
    }
    if (context.workflowId) {
      contextParts.push(`工作流 ID: ${context.workflowId}`);
    }

    if (contextParts.length > 0) {
      details = contextParts.join('\n');
    }
  }

  return {
    code: errorCode,
    category: getErrorCategory(errorCode),
    ...errorDesc,
    details: details || undefined,
  };
}

/**
 * 带代码的错误类
 */
export class ErrorWithCode extends Error {
  code: ErrorCode;
  category: ErrorCategory;
  details?: string;
  suggestions?: string[];

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      details?: string;
      suggestions?: string[];
    }
  ) {
    super(message);
    this.name = 'ErrorWithCode';
    this.code = code;
    this.category = getErrorCategory(code);
    this.details = options?.details;
    this.suggestions = options?.suggestions;
  }
}

/**
 * 创建带代码的错误
 */
export function createErrorWithCode(
  code: ErrorCode,
  message: string,
  context?: ErrorContext
): ErrorWithCode {
  const errorInfo = ERROR_MESSAGES[code];
  return new ErrorWithCode(code, message, {
    details: context ? formatContextDetails(context) : undefined,
    suggestions: errorInfo?.suggestions,
  });
}

/**
 * 格式化上下文详情
 */
function formatContextDetails(context: ErrorContext): string {
  const parts: string[] = [];

  if (context.taskId) parts.push(`任务 ID: ${context.taskId}`);
  if (context.taskTitle) parts.push(`任务标题: ${context.taskTitle}`);
  if (context.toolName) parts.push(`工具名称: ${context.toolName}`);
  if (context.provider) parts.push(`LLM 服务商: ${context.provider}`);
  if (context.filePath) parts.push(`文件路径: ${context.filePath}`);
  if (context.roleType) parts.push(`角色类型: ${context.roleType}`);

  return parts.join('\n');
}
