import { z } from 'zod';

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  schema?: z.ZodSchema;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  schema: z.ZodSchema;
  dangerous?: boolean;
  handler: (params: any) => Promise<any>;
}

export class ToolSchemaBuilder {
  static build(parameters: ToolParameter[]): z.ZodSchema {
    const shape: Record<string, z.ZodSchema> = {};

    for (const param of parameters) {
      let schema: z.ZodSchema;

      switch (param.type) {
        case 'string':
          schema = z.string();
          break;
        case 'number':
          schema = z.number();
          break;
        case 'boolean':
          schema = z.boolean();
          break;
        case 'array':
          schema = z.array(z.any());
          break;
        case 'object':
          schema = z.object({}).passthrough();
          break;
        default:
          schema = z.any();
      }

      if (param.schema) {
        schema = param.schema;
      }

      if (!param.required) {
        schema = schema.optional();
      }

      shape[param.name] = schema;
    }

    return z.object(shape);
  }
}
