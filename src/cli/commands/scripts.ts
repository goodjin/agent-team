/**
 * package.json 脚本更新
 */

import { promises as fs } from 'fs';

/**
 * 更新 package.json 脚本
 */
export async function updatePackageScripts(): Promise<void> {
  const packageJsonPath = './package.json';
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

  packageJson.scripts = {
    ...packageJson.scripts,
    init: 'tsx src/cli/index.ts init',
    config: 'tsx src/cli/index.ts config',
    role: 'tsx src/cli/index.ts role',
    prompt: 'tsx src/cli/index.ts prompt',
    rule: 'tsx src/cli/index.ts rule',
    chat: 'tsx src/cli/index.ts chat',
  };

  await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

  console.log('package.json 脚本已更新');
}

/**
 * 添加依赖
 */
export async function addDependencies(): Promise<void> {
  const packageJsonPath = './package.json';
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

  // 检查是否已有需要的依赖
  if (!packageJson.dependencies.inquirer) {
    packageJson.dependencies.inquirer = '^9.0.0';
  }

  await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

  console.log('依赖已添加到 package.json');
}
