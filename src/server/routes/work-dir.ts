import { Router, Request, Response } from 'express';
import { WorkDirManager } from '../../core/work-dir-manager.js';

export function createWorkDirRouter(workDirManager: WorkDirManager): Router {
  const router = Router();

  router.get('/tasks/:taskId/work-dir', async (req: Request, res: Response) => {
    const { taskId } = req.params;
    const state = workDirManager.getWorkDir(taskId);

    if (!state) {
      return res.status(404).json({
        success: false,
        error: `工作目录不存在: ${taskId}`,
      });
    }

    res.json({
      success: true,
      data: {
        taskId: state.taskId,
        rootPath: state.rootPath,
        structure: {
          src: state.structure.src,
          tests: state.structure.tests,
          docs: state.structure.docs,
          output: state.structure.output,
        },
        files: state.files,
        createdAt: state.createdAt,
      },
    });
  });

  router.post('/tasks/:taskId/work-dir/validate', async (req: Request, res: Response) => {
    const { taskId } = req.params;
    const { path: filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: '缺少 path 字段',
      });
    }

    const state = workDirManager.getWorkDir(taskId);

    if (!state) {
      return res.status(404).json({
        success: false,
        error: `工作目录不存在: ${taskId}`,
      });
    }

    const result = await workDirManager.validatePath(taskId, filePath);

    const resolvedPath = result.valid ? filePath : undefined;

    res.json({
      success: true,
      data: {
        valid: result.valid,
        resolvedPath,
        error: result.error,
      },
    });
  });

  router.delete('/tasks/:taskId/work-dir', async (req: Request, res: Response) => {
    const { taskId } = req.params;

    try {
      await workDirManager.cleanupWorkDir(taskId);
      res.json({
        success: true,
        data: { cleaned: true },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || '清理工作目录失败',
      });
    }
  });

  return router;
}
