import type { IFileStore } from '../../infrastructure/file-store/index.js';

const CONFIG_REL = 'config/review-role-mapping.json';

/** 工人 roleId → 审查员 roleId；未命中时使用 defaultReviewerRoleId */
export interface ReviewRoleMappingConfig {
  defaultReviewerRoleId: string;
  roleToReviewer: Record<string, string>;
}

export const DEFAULT_REVIEW_ROLE_MAPPING: ReviewRoleMappingConfig = {
  defaultReviewerRoleId: 'output-reviewer',
  roleToReviewer: {
    'frontend-dev': 'ui-reviewer',
    'backend-dev': 'security-reviewer',
    'doc-writer': 'doc-reviewer',
    'product-manager': 'doc-reviewer',
    architect: 'doc-reviewer',
    tester: 'output-reviewer',
  },
};

/**
 * 审查员映射配置（存于 data/config/review-role-mapping.json）。
 * 文件为唯一真源；首次缺失时写入内置默认并返回。
 */
export class ReviewRoleMappingStore {
  constructor(private fileStore: IFileStore) {}

  async get(): Promise<ReviewRoleMappingConfig> {
    try {
      const txt = await this.fileStore.readText(CONFIG_REL);
      const parsed = JSON.parse(txt) as Partial<ReviewRoleMappingConfig>;
      const def = String(parsed.defaultReviewerRoleId ?? '').trim();
      const raw = parsed.roleToReviewer;
      const roleToReviewer: Record<string, string> = {};
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [k, v] of Object.entries(raw)) {
          const kk = String(k || '').trim();
          const vv = String(v || '').trim();
          if (kk && vv) roleToReviewer[kk] = vv;
        }
      }
      return {
        defaultReviewerRoleId: def || DEFAULT_REVIEW_ROLE_MAPPING.defaultReviewerRoleId,
        roleToReviewer,
      };
    } catch {
      await this.fileStore.write(
        CONFIG_REL,
        JSON.stringify(DEFAULT_REVIEW_ROLE_MAPPING, null, 2)
      );
      return { ...DEFAULT_REVIEW_ROLE_MAPPING, roleToReviewer: { ...DEFAULT_REVIEW_ROLE_MAPPING.roleToReviewer } };
    }
  }

  async save(cfg: ReviewRoleMappingConfig): Promise<void> {
    const def = String(cfg.defaultReviewerRoleId || '').trim();
    if (!def) {
      throw new Error('defaultReviewerRoleId required');
    }
    const roleToReviewer: Record<string, string> = {};
    if (cfg.roleToReviewer && typeof cfg.roleToReviewer === 'object' && !Array.isArray(cfg.roleToReviewer)) {
      for (const [k, v] of Object.entries(cfg.roleToReviewer)) {
        const kk = String(k || '').trim();
        const vv = String(v || '').trim();
        if (kk && vv) roleToReviewer[kk] = vv;
      }
    }
    await this.fileStore.write(
      CONFIG_REL,
      JSON.stringify({ defaultReviewerRoleId: def, roleToReviewer }, null, 2)
    );
  }
}
