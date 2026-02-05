import { Router, Request, Response } from 'express';
import type { Role, RoleTypeAPI } from '../../types/index.js';

export interface RoleRouter {
  getRoles(req: Request, res: Response): Promise<void>;
  getRole(req: Request, res: Response): Promise<void>;
  createRole(req: Request, res: Response): Promise<void>;
  updateRole(req: Request, res: Response): Promise<void>;
  deleteRole(req: Request, res: Response): Promise<void>;
}

export function createRoleRouter(): Router {
  const router = Router();

  router.get('/', async (_req: Request, res: Response) => {
    try {
      const roles = await getRoles(_req, res);
      res.json({
        success: true,
        data: roles,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_ROLES_FAILED',
          message: error.message || 'Failed to get roles',
        },
      });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const role = await getRole(req, res);
      if (!role) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'ROLE_NOT_FOUND',
            message: `Role not found: ${req.params.id}`,
          },
        });
      }
      res.json({
        success: true,
        data: role,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_ROLE_FAILED',
          message: error.message || 'Failed to get role',
        },
      });
    }
  });

  router.post('/', async (req: Request, res: Response) => {
    try {
      const role = await createRole(req, res);
      res.status(201).json({
        success: true,
        data: role,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'CREATE_ROLE_FAILED',
          message: error.message || 'Failed to create role',
        },
      });
    }
  });

  router.patch('/:id', async (req: Request, res: Response) => {
    try {
      const role = await updateRole(req, res);
      res.json({
        success: true,
        data: role,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'UPDATE_ROLE_FAILED',
          message: error.message || 'Failed to update role',
        },
      });
    }
  });

  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      await deleteRole(req, res);
      res.json({
        success: true,
        message: 'Role deleted successfully',
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'DELETE_ROLE_FAILED',
          message: error.message || 'Failed to delete role',
        },
      });
    }
  });

  return router;
}

async function getRoles(_req: Request, _res: Response): Promise<Role[]> {
  return [
    {
      id: 'product-manager',
      name: 'Product Manager',
      type: 'product-manager',
      description: 'Manages project requirements and priorities',
      promptPath: '/prompts/product-manager.txt',
      createdBy: 'system',
      enabled: true,
    },
    {
      id: 'architect',
      name: 'Architect',
      type: 'architect',
      description: 'Designs system architecture',
      promptPath: '/prompts/architect.txt',
      createdBy: 'system',
      enabled: true,
    },
    {
      id: 'developer',
      name: 'Developer',
      type: 'developer',
      description: 'Implements features and fixes bugs',
      promptPath: '/prompts/developer.txt',
      createdBy: 'system',
      enabled: true,
    },
    {
      id: 'tester',
      name: 'Tester',
      type: 'tester',
      description: 'Writes and runs tests',
      promptPath: '/prompts/tester.txt',
      createdBy: 'system',
      enabled: true,
    },
    {
      id: 'doc-writer',
      name: 'Documentation Writer',
      type: 'doc-writer',
      description: 'Writes documentation',
      promptPath: '/prompts/doc-writer.txt',
      createdBy: 'system',
      enabled: true,
    },
  ];
}

async function getRole(req: Request, _res: Response): Promise<Role | null> {
  const { id } = req.params;
  const roles = await getRoles(req, _res as any);
  return roles.find((r) => r.id === id) || null;
}

async function createRole(req: Request, _res: Response): Promise<Role> {
  const { id, name, type, description } = req.body;
  if (!id || !name || !type) {
    throw new Error('Role id, name, and type are required');
  }
  return {
    id,
    name,
    type: type as RoleTypeAPI,
    description: description || '',
    promptPath: `/prompts/${id}.txt`,
    createdBy: 'user',
    enabled: true,
  };
}

async function updateRole(req: Request, _res: Response): Promise<Role> {
  const { id } = req.params;
  const { promptPath } = req.body;
  const existingRole = await getRole(req, _res as any);
  if (!existingRole) {
    throw new Error(`Role not found: ${id}`);
  }
  return {
    ...existingRole,
    promptPath: promptPath || existingRole.promptPath,
  };
}

async function deleteRole(req: Request, _res: Response): Promise<void> {
  const { id } = req.params;
}
