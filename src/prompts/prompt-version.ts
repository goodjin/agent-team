/**
 * 提示词版本管理
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import type { PromptDefinition, PromptSnapshot } from './types.js';

const SNAPSHOTS_DIR = 'snapshots';

/**
 * 提示词版本管理器
 */
export class PromptVersionManager {
  private snapshotsDir: string;

  constructor(snapshotsDir?: string) {
    this.snapshotsDir = snapshotsDir || path.join(os.homedir(), '.agent-team', 'prompts', SNAPSHOTS_DIR);
  }

  /**
   * 创建快照
   */
  async createSnapshot(
    prompt: PromptDefinition,
    description?: string
  ): Promise<PromptSnapshot> {
    // 确保目录存在
    await fs.mkdir(this.snapshotsDir, { recursive: true });

    const snapshot: PromptSnapshot = {
      id: uuidv4(),
      roleId: prompt.roleId,
      version: prompt.version,
      content: prompt.systemPrompt,
      createdAt: new Date().toISOString(),
      description,
    };

    // 保存快照
    const snapshotPath = path.join(this.snapshotsDir, `${snapshot.id}.json`);
    await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8');

    return snapshot;
  }

  /**
   * 获取快照列表
   */
  async getSnapshots(roleId?: string): Promise<PromptSnapshot[]> {
    const snapshots: PromptSnapshot[] = [];

    try {
      const files = await fs.readdir(this.snapshotsDir);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));

      for (const file of jsonFiles) {
        try {
          const filePath = path.join(this.snapshotsDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const snapshot = JSON.parse(content) as PromptSnapshot;

          if (!roleId || snapshot.roleId === roleId) {
            snapshots.push(snapshot);
          }
        } catch {
          // 忽略无效的快照文件
        }
      }
    } catch {
      // 目录不存在，返回空列表
    }

    // 按时间倒序排列
    snapshots.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return snapshots;
  }

  /**
   * 获取特定快照
   */
  async getSnapshot(snapshotId: string): Promise<PromptSnapshot | null> {
    const snapshotPath = path.join(this.snapshotsDir, `${snapshotId}.json`);

    try {
      const content = await fs.readFile(snapshotPath, 'utf-8');
      return JSON.parse(content) as PromptSnapshot;
    } catch {
      return null;
    }
  }

  /**
   * 删除快照
   */
  async deleteSnapshot(snapshotId: string): Promise<boolean> {
    const snapshotPath = path.join(this.snapshotsDir, `${snapshotId}.json`);

    try {
      await fs.unlink(snapshotPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 清理旧快照（保留最近 N 个）
   */
  async cleanupOldSnapshots(roleId: string, keepCount: number): Promise<number> {
    const snapshots = await this.getSnapshots(roleId);

    // 按版本排序
    snapshots.sort((a, b) => {
      const versionCompare = a.version.localeCompare(b.version, undefined, { numeric: true });
      if (versionCompare !== 0) return versionCompare;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // 删除旧快照
    let deleted = 0;
    for (let i = keepCount; i < snapshots.length; i++) {
      const deletedCount = await this.deleteSnapshot(snapshots[i].id);
      if (deletedCount) deleted++;
    }

    return deleted;
  }

  /**
   * 恢复到特定快照
   */
  async restoreFromSnapshot(snapshotId: string): Promise<PromptDefinition | null> {
    const snapshot = await this.getSnapshot(snapshotId);

    if (!snapshot) {
      return null;
    }

    return {
      roleId: snapshot.roleId,
      version: snapshot.version,
      lastUpdated: snapshot.createdAt,
      systemPrompt: snapshot.content,
      taskTemplates: {
        featureDevelopment: { template: '' },
        bugFix: { template: '' },
        codeReview: { template: '' },
        requirementAnalysis: { template: '' },
        architectureDesign: { template: '' },
        testing: { template: '' },
        documentation: { template: '' },
      },
      contexts: {},
      outputFormat: {
        code: { language: 'typescript', style: 'pretty' },
        tests: { framework: 'jest', coverage: true },
        documentation: { style: 'markdown' },
      },
      tags: [],
    };
  }

  /**
   * 比较两个快照的差异
   */
  async compareSnapshots(
    snapshotId1: string,
    snapshotId2: string
  ): Promise<{
    identical: boolean;
    diff: string[];
  }> {
    const snapshot1 = await this.getSnapshot(snapshotId1);
    const snapshot2 = await this.getSnapshot(snapshotId2);

    if (!snapshot1 || !snapshot2) {
      return { identical: false, diff: ['快照不存在'] };
    }

    if (snapshot1.content === snapshot2.content) {
      return { identical: true, diff: [] };
    }

    // 简单的行对比
    const lines1 = snapshot1.content.split('\n');
    const lines2 = snapshot2.content.split('\n');
    const diff: string[] = [];

    const maxLines = Math.max(lines1.length, lines2.length);
    for (let i = 0; i < maxLines; i++) {
      const line1 = lines1[i] || '';
      const line2 = lines2[i] || '';

      if (line1 !== line2) {
        if (line1 && line2) {
          diff.push(`第 ${i + 1} 行不同:`);
          diff.push(`  - ${line1}`);
          diff.push(`  + ${line2}`);
        } else if (line1) {
          diff.push(`第 ${i + 1} 行删除: ${line1}`);
        } else {
          diff.push(`第 ${i + 1} 行新增: ${line2}`);
        }
      }
    }

    return { identical: false, diff };
  }

  /**
   * 获取快照统计
   */
  async getStats(): Promise<{
    totalSnapshots: number;
    byRole: { [roleId: string]: number };
  }> {
    const snapshots = await this.getSnapshots();
    const byRole: { [roleId: string]: number } = {};

    for (const snapshot of snapshots) {
      byRole[snapshot.roleId] = (byRole[snapshot.roleId] || 0) + 1;
    }

    return {
      totalSnapshots: snapshots.length,
      byRole,
    };
  }
}

/**
 * 版本管理器单例
 */
let versionManagerInstance: PromptVersionManager | null = null;

export function getVersionManager(): PromptVersionManager {
  if (!versionManagerInstance) {
    versionManagerInstance = new PromptVersionManager();
  }
  return versionManagerInstance;
}

export function resetVersionManager(): void {
  versionManagerInstance = null;
}

/**
 * 检查版本是否需要更新
 */
export function shouldUpdateVersion(currentVersion: string, newContent: string): boolean {
  // 简单版本号检查（如果内容变化，版本号应该变化）
  // 实际使用中可能需要更复杂的版本比较逻辑
  return true;
}

/**
 * 生成新版本号
 */
export function generateNextVersion(currentVersion: string): string {
  // 简单的语义化版本号生成
  const parts = currentVersion.split('.');
  if (parts.length === 3) {
    const patch = parseInt(parts[2], 10) + 1;
    return `${parts[0]}.${parts[1]}.${patch}`;
  }
  return '1.0.0';
}
