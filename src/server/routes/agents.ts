import { Router, Request, Response } from 'express';
import { AgentMgr } from '../../core/agent-mgr.js';
import type { Agent, AgentStatus } from '../../types/index.js';

export interface AgentRouter {}

export function createAgentRouter(agentMgr: AgentMgr): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      const { projectId, roleId, status } = req.query;
      const agents = await agentMgr.getAgents({
        projectId: projectId as string | undefined,
        roleId: roleId as string | undefined,
        status: status as AgentStatus | undefined,
      });
      res.json({
        success: true,
        data: agents,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_AGENTS_FAILED',
          message: error.message || 'Failed to get agents',
        },
      });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const agent = agentMgr.getAgent(req.params.id);
      if (!agent) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'AGENT_NOT_FOUND',
            message: `Agent not found: ${req.params.id}`,
          },
        });
      }
      res.json({
        success: true,
        data: agent,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_AGENT_FAILED',
          message: error.message || 'Failed to get agent',
        },
      });
    }
  });

  router.post('/', async (req: Request, res: Response) => {
    try {
      const { roleId, projectId, name, llmProvider, llmModel } = req.body;
      if (!roleId || !projectId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: 'Role ID and Project ID are required',
          },
        });
      }
      const agent = await agentMgr.createAgent({
        roleId,
        projectId,
        name,
        llmProvider,
        llmModel,
      });
      res.status(201).json({
        success: true,
        data: agent,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'CREATE_AGENT_FAILED',
          message: error.message || 'Failed to create agent',
        },
      });
    }
  });

  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const { name, llmProvider, llmModel } = req.body;
      const agent = agentMgr.getAgent(req.params.id);
      if (!agent) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'AGENT_NOT_FOUND',
            message: `Agent not found: ${req.params.id}`,
          },
        });
      }
      if (name) agent.name = name;
      if (llmProvider) agent.llmProvider = llmProvider;
      if (llmModel) agent.llmModel = llmModel;
      res.json({
        success: true,
        data: agent,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'UPDATE_AGENT_FAILED',
          message: error.message || 'Failed to update agent',
        },
      });
    }
  });

  router.post('/:id/restart', async (req: Request, res: Response) => {
    try {
      await agentMgr.restartAgent(req.params.id);
      const agent = agentMgr.getAgent(req.params.id);
      res.json({
        success: true,
        data: agent,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'RESTART_AGENT_FAILED',
          message: error.message || 'Failed to restart agent',
        },
      });
    }
  });

  router.post('/:id/stop', async (req: Request, res: Response) => {
    try {
      await agentMgr.setAgentStatus(req.params.id, 'stopped');
      const agent = agentMgr.getAgent(req.params.id);
      res.json({
        success: true,
        data: agent,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'STOP_AGENT_FAILED',
          message: error.message || 'Failed to stop agent',
        },
      });
    }
  });

  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      await agentMgr.deleteAgent(req.params.id);
      res.json({
        success: true,
        message: 'Agent deleted successfully',
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'DELETE_AGENT_FAILED',
          message: error.message || 'Failed to delete agent',
        },
      });
    }
  });

  router.get('/:id/stats', async (req: Request, res: Response) => {
    try {
      const agent = agentMgr.getAgent(req.params.id);
      if (!agent) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'AGENT_NOT_FOUND',
            message: `Agent not found: ${req.params.id}`,
          },
        });
      }
      const status = await agentMgr.checkAgentStatus(req.params.id);
      res.json({
        success: true,
        data: status,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_STATS_FAILED',
          message: error.message || 'Failed to get agent stats',
        },
      });
    }
  });

  return router;
}
