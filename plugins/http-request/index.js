export default {
  name: 'http-request',
  description: '发送 HTTP 请求，支持 GET/POST/PUT/DELETE 方法',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: '目标 URL（必须以 http:// 或 https:// 开头）'
      },
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'DELETE'],
        default: 'GET',
        description: 'HTTP 方法'
      },
      headers: {
        type: 'object',
        description: '请求头（可选）',
        additionalProperties: { type: 'string' }
      },
      body: {
        type: 'string',
        description: '请求体（POST/PUT 时使用）'
      }
    },
    required: ['url']
  },
  async execute(params) {
    const { url, method = 'GET', headers = {}, body } = params;

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? body : undefined
    });

    const responseText = await response.text();

    return {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseText
    };
  }
};
