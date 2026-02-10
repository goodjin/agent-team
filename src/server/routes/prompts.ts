import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { PromptLoader } from '../../prompts/loader.js';

const router = express.Router();
const promptLoader = new PromptLoader();

/**
 * GET /api/prompts - 列出所有提示词
 */
router.get('/', async (req, res) => {
  try {
    const category = req.query.category as string | undefined;
    const prompts = await promptLoader.list(category);

    res.json({
      success: true,
      prompts,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

/**
 * GET /api/prompts/:path - 获取提示词内容
 */
router.get('/:path(*)', async (req, res) => {
  try {
    const promptPath = req.params.path;
    const prompt = await promptLoader.load(promptPath);

    res.json({
      success: true,
      prompt: {
        content: prompt.content,
        metadata: prompt.metadata,
      },
    });
  } catch (error: unknown) {
    res.status(404).json({
      success: false,
      error: 'Prompt not found',
    });
  }
});

/**
 * PUT /api/prompts/:path - 更新提示词内容
 */
router.put('/:path(*)', async (req, res) => {
  try {
    const promptPath = req.params.path;
    const { content, metadata } = req.body;

    // 构建完整内容（Front Matter + 内容）
    let fullContent = '';

    if (metadata && Object.keys(metadata).length > 0) {
      fullContent += '---\n';
      for (const [key, value] of Object.entries(metadata)) {
        fullContent += `${key}: ${value}\n`;
      }
      fullContent += '---\n\n';
    }

    fullContent += content;

    // 写入文件
    const fullPath = path.join('prompts', promptPath);
    await fs.writeFile(fullPath, fullContent, 'utf-8');

    // 重新加载
    await promptLoader.reload(promptPath);

    res.json({
      success: true,
      message: 'Prompt updated successfully',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

/**
 * POST /api/prompts/:path - 创建新提示词
 */
router.post('/:path(*)', async (req, res) => {
  try {
    const promptPath = req.params.path;
    const { content, metadata } = req.body;

    // 检查文件是否已存在
    const fullPath = path.join('prompts', promptPath);
    try {
      await fs.access(fullPath);
      return res.status(409).json({
        success: false,
        error: 'Prompt already exists',
      });
    } catch {
      // 文件不存在，继续
    }

    // 构建完整内容
    let fullContent = '';

    if (metadata && Object.keys(metadata).length > 0) {
      fullContent += '---\n';
      for (const [key, value] of Object.entries(metadata)) {
        fullContent += `${key}: ${value}\n`;
      }
      fullContent += '---\n\n';
    }

    fullContent += content;

    // 确保目录存在
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    // 写入文件
    await fs.writeFile(fullPath, fullContent, 'utf-8');

    res.json({
      success: true,
      message: 'Prompt created successfully',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

/**
 * DELETE /api/prompts/:path - 删除提示词
 */
router.delete('/:path(*)', async (req, res) => {
  try {
    const promptPath = req.params.path;
    const fullPath = path.join('prompts', promptPath);

    await fs.unlink(fullPath);

    // 清除缓存
    promptLoader.clearCache();

    res.json({
      success: true,
      message: 'Prompt deleted successfully',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

export default router;
