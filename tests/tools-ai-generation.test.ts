import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TextToImageTool,
  TextToVideoTool,
  ImageToImageTool,
  VideoEditTool,
  GenerationTaskStatusTool,
  getPendingTasks,
  clearPendingTasks,
} from '../src/tools/ai-generation.js';

describe('AI Generation Tools', () => {
  beforeEach(() => {
    clearPendingTasks();
  });

  describe('TextToImageTool', () => {
    it('should generate image from text prompt', async () => {
      const tool = new TextToImageTool();
      const result = await tool.execute({
        prompt: 'A beautiful sunset over mountains',
        size: '1024x1024',
        style: 'natural',
        n: 1,
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('taskId');
      expect(result.data).toHaveProperty('images');
      expect(Array.isArray(result.data.images)).toBe(true);
      expect(result.data.prompt).toBe('A beautiful sunset over mountains');
    });

    it('should validate required prompt parameter', async () => {
      const tool = new TextToImageTool();
      const result = await tool.execute({
        prompt: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Prompt cannot be empty');
    });

    it('should accept different image sizes', async () => {
      const tool = new TextToImageTool();
      const sizes = ['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792'];

      for (const size of sizes) {
        const result = await tool.execute({
          prompt: 'Test image',
          size: size as any,
        });
        expect(result.success).toBe(true);
        expect(result.data.size).toBe(size);
      }
    });
  });

  describe('TextToVideoTool', () => {
    it('should generate video from text prompt', async () => {
      const tool = new TextToVideoTool();
      const result = await tool.execute({
        prompt: 'A drone shot of ocean waves',
        duration: 5,
        resolution: '720p',
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('taskId');
      expect(result.data).toHaveProperty('video');
      expect(result.data.prompt).toBe('A drone shot of ocean waves');
      expect(result.data.duration).toBe(5);
    });

    it('should validate required prompt parameter', async () => {
      const tool = new TextToVideoTool();
      const result = await tool.execute({
        prompt: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Prompt cannot be empty');
    });
  });

  describe('ImageToImageTool', () => {
    it('should transform image based on prompt', async () => {
      const tool = new ImageToImageTool();
      const result = await tool.execute({
        image: 'data:image/png;base64,abc123',
        prompt: 'Add magical effects',
        strength: 0.7,
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('taskId');
      expect(result.data).toHaveProperty('result');
      expect(result.data.originalImage).toBe('data:image/png;base64,abc123');
    });

    it('should validate required parameters', async () => {
      const tool = new ImageToImageTool();

      const noImageResult = await tool.execute({
        image: '',
        prompt: 'Test',
      });
      expect(noImageResult.success).toBe(false);

      const noPromptResult = await tool.execute({
        image: 'test.png',
        prompt: '',
      });
      expect(noPromptResult.success).toBe(false);
    });
  });

  describe('VideoEditTool', () => {
    it('should edit video with operations', async () => {
      const tool = new VideoEditTool();
      const result = await tool.execute({
        video: 'https://example.com/video.mp4',
        operations: [
          { type: 'trim', params: { start: 0, end: 30 } },
          { type: 'subtitle', params: { text: 'Hello World' } },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('taskId');
      expect(result.data).toHaveProperty('operations');
      expect(result.data.operations.length).toBe(2);
    });

    it('should require at least one operation', async () => {
      const tool = new VideoEditTool();
      const result = await tool.execute({
        video: 'test.mp4',
        operations: [],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('At least one operation required');
    });
  });

  describe('GenerationTaskStatusTool', () => {
    it('should return status for valid task', async () => {
      const taskId = 'test_task_123';
      const pendingTasks = getPendingTasks();
      pendingTasks.set(taskId, {
        id: taskId,
        status: 'processing',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const tool = new GenerationTaskStatusTool();
      const result = await tool.execute({ taskId });

      expect(result.success).toBe(true);
      expect(result.data.taskId).toBe(taskId);
      expect(result.data.status).toBe('processing');
    });

    it('should return error for unknown task', async () => {
      const tool = new GenerationTaskStatusTool();
      const result = await tool.execute({ taskId: 'unknown_task' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Task not found');
    });
  });

  describe('Tool Definitions', () => {
    it('should have correct category', () => {
      expect(new TextToImageTool().getDefinition().category).toBe('ai-generation');
      expect(new TextToVideoTool().getDefinition().category).toBe('ai-generation');
      expect(new ImageToImageTool().getDefinition().category).toBe('ai-generation');
      expect(new VideoEditTool().getDefinition().category).toBe('ai-generation');
      expect(new GenerationTaskStatusTool().getDefinition().category).toBe('ai-generation');
    });
  });
});
