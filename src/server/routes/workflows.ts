import { Router, Request, Response } from 'express';
import type { Workflow, WorkflowExecution } from '../../types/workflow.js';
import type { ProjectAgent } from '../../core/project-agent.js';

export interface WorkflowRouter {
  router: Router;
  getWorkflows(): Workflow[];
  getWorkflow(id: string): Workflow | undefined;
  createWorkflow(workflow: Omit<Workflow, 'id'>): Promise<Workflow>;
  updateWorkflow(id: string, updates: Partial<Workflow>): Workflow | null;
  deleteWorkflow(id: string): boolean;
  executeWorkflow(id: string, input?: Record<string, any>): Promise<WorkflowExecution>;
  getExecutions(workflowId: string): WorkflowExecution[];
  getExecution(executionId: string): WorkflowExecution | undefined;
  cancelExecution(executionId: string): boolean;
  getTemplates(): any[];
}

export function createWorkflowRouter(agent: ProjectAgent): WorkflowRouter {
  const router = Router();

  const getEngine = () => agent.workflowEngine;

  router.get('/', (_req: Request, res: Response) => {
    try {
      const workflows = getEngine().getAllWorkflows();
      res.json({
        success: true,
        data: workflows
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  router.post('/', async (req: Request, res: Response) => {
    try {
      const workflow = await getEngine().createWorkflow(req.body);
      res.status(201).json({
        success: true,
        data: workflow
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  router.get('/templates', (_req: Request, res: Response) => {
    try {
      const templates = getEngine().getTemplates();
      res.json({
        success: true,
        data: templates
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  router.get('/:id', (req: Request, res: Response) => {
    try {
      const workflow = getEngine().getWorkflow(req.params.id);
      if (!workflow) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Workflow not found: ${req.params.id}`
          }
        });
      }
      res.json({
        success: true,
        data: workflow
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  router.put('/:id', (req: Request, res: Response) => {
    try {
      const workflow = getEngine().updateWorkflow(req.params.id, req.body);
      if (!workflow) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Workflow not found: ${req.params.id}`
          }
        });
      }
      res.json({
        success: true,
        data: workflow
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  router.delete('/:id', (req: Request, res: Response) => {
    try {
      const deleted = getEngine().deleteWorkflow(req.params.id);
      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Workflow not found: ${req.params.id}`
          }
        });
      }
      res.json({
        success: true,
        data: { deleted: true }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  router.post('/:id/execute', async (req: Request, res: Response) => {
    try {
      const execution = await getEngine().executeWorkflow(
        req.params.id,
        req.body.input
      );
      res.json({
        success: true,
        data: execution
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: error.message
          }
        });
      }
      res.status(500).json({
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  router.get('/:id/executions', (req: Request, res: Response) => {
    try {
      const executions = getEngine().getExecutionsByWorkflow(req.params.id);
      res.json({
        success: true,
        data: executions
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  router.get('/executions/:executionId', (req: Request, res: Response) => {
    try {
      const execution = getEngine().getExecution(req.params.executionId);
      if (!execution) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Execution not found: ${req.params.executionId}`
          }
        });
      }
      res.json({
        success: true,
        data: execution
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  router.post('/executions/:executionId/cancel', (req: Request, res: Response) => {
    try {
      const cancelled = getEngine().cancelExecution(req.params.executionId);
      if (!cancelled) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Execution not found: ${req.params.executionId}`
          }
        });
      }
      res.json({
        success: true,
        data: { cancelled: true }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  return {
    router,
    getWorkflows: () => getEngine().getAllWorkflows(),
    getWorkflow: (id: string) => getEngine().getWorkflow(id),
    createWorkflow: (workflow: Omit<Workflow, 'id'>) =>
      getEngine().createWorkflow(workflow) as Promise<Workflow>,
    updateWorkflow: (id: string, updates: Partial<Workflow>) =>
      getEngine().updateWorkflow(id, updates),
    deleteWorkflow: (id: string) => getEngine().deleteWorkflow(id),
    executeWorkflow: (id: string, input?: Record<string, any>) =>
      getEngine().executeWorkflow(id, input),
    getExecutions: (workflowId: string) =>
      getEngine().getExecutionsByWorkflow(workflowId),
    getExecution: (executionId: string) =>
      getEngine().getExecution(executionId),
    cancelExecution: (executionId: string) =>
      getEngine().cancelExecution(executionId),
    getTemplates: () => getEngine().getTemplates()
  };
}
