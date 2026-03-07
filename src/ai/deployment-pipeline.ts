/**
 * Deployment Pipeline - Automatic deployment with build, test, and deploy stages
 */

import { spawn, execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

export type Environment = 'development' | 'staging' | 'production';
export type DeployTarget = 'npm' | 'docker' | 'vercel' | 'netlify' | 'custom';
export type PipelineStage = 'install' | 'build' | 'test' | 'deploy' | 'verify';
export type StageStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

export interface PipelineConfig {
  environment: Environment;
  target: DeployTarget;
  installCommand: string;
  buildCommand: string;
  testCommand: string;
  deployCommand: string;
  verifyCommand: string;
  artifactsDir: string;
  keepArtifacts: boolean;
  timeout: number;
}

export interface StageResult {
  stage: PipelineStage;
  status: StageStatus;
  duration: number;
  output: string;
  error?: string;
}

export interface PipelineResult {
  success: boolean;
  environment: Environment;
  target: DeployTarget;
  stages: StageResult[];
  totalDuration: number;
  artifacts: string[];
  version: string;
  commit: string;
  deployedAt: Date;
}

export interface DeploymentStatus {
  pipelineId: string;
  environment: Environment;
  target: DeployTarget;
  status: StageStatus;
  currentStage?: PipelineStage;
  progress: number;
  result?: PipelineResult;
}

const DEFAULT_CONFIG: Record<Environment, PipelineConfig> = {
  development: {
    environment: 'development',
    target: 'npm',
    installCommand: 'npm install',
    buildCommand: 'npm run build',
    testCommand: 'npm test',
    deployCommand: 'npm run deploy:dev',
    verifyCommand: 'npm run verify:dev',
    artifactsDir: 'dist',
    keepArtifacts: true,
    timeout: 300000,
  },
  staging: {
    environment: 'staging',
    target: 'npm',
    installCommand: 'npm ci',
    buildCommand: 'npm run build',
    testCommand: 'npm run test:ci',
    deployCommand: 'npm run deploy:staging',
    verifyCommand: 'npm run verify:staging',
    artifactsDir: 'dist',
    keepArtifacts: true,
    timeout: 600000,
  },
  production: {
    environment: 'production',
    target: 'npm',
    installCommand: 'npm ci',
    buildCommand: 'npm run build',
    testCommand: 'npm run test:ci',
    deployCommand: 'npm run deploy:prod',
    verifyCommand: 'npm run verify:prod',
    artifactsDir: 'dist',
    keepArtifacts: false,
    timeout: 600000,
  },
};

export class DeploymentPipeline {
  private config: PipelineConfig;
  private status: DeploymentStatus;
  private results: StageResult[] = [];
  private pipelineId: string;

  constructor(environment: Environment = 'development', target: DeployTarget = 'npm') {
    const defaultConfig = DEFAULT_CONFIG[environment];
    this.config = { ...defaultConfig, environment, target };
    this.pipelineId = this.generatePipelineId();
    this.status = {
      pipelineId: this.pipelineId,
      environment,
      target,
      status: 'pending',
      progress: 0,
    };
  }

  private generatePipelineId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `pipeline-${timestamp}-${random}`;
  }

  getStatus(): DeploymentStatus {
    return this.status;
  }

  async run(): Promise<PipelineResult> {
    const startTime = Date.now();
    this.status.status = 'running';
    this.results = [];

    try {
      // Stage 1: Install dependencies
      await this.runStage('install');

      // Stage 2: Build
      await this.runStage('build');

      // Stage 3: Test
      await this.runStage('test');

      // Stage 4: Deploy
      await this.runStage('deploy');

      // Stage 5: Verify
      await this.runStage('verify');

      this.status.status = 'passed';
    } catch (error: any) {
      this.status.status = 'failed';
      console.error(`Pipeline failed:`, error.message);
    }

    const totalDuration = Date.now() - startTime;

    const result: PipelineResult = {
      success: this.status.status === 'passed',
      environment: this.config.environment,
      target: this.config.target,
      stages: this.results,
      totalDuration,
      artifacts: await this.collectArtifacts(),
      version: this.getVersion(),
      commit: this.getCommit(),
      deployedAt: new Date(),
    };

    this.status.result = result;
    return result;
  }

  private async runStage(stage: PipelineStage): Promise<void> {
    const stageStartTime = Date.now();
    this.status.currentStage = stage;

    const stageResult: StageResult = {
      stage,
      status: 'running',
      duration: 0,
      output: '',
    };

    try {
      let command: string;
      switch (stage) {
        case 'install':
          command = this.config.installCommand;
          break;
        case 'build':
          command = this.config.buildCommand;
          break;
        case 'test':
          command = this.config.testCommand;
          break;
        case 'deploy':
          command = this.config.deployCommand;
          break;
        case 'verify':
          command = this.config.verifyCommand;
          break;
      }

      if (!command) {
        stageResult.status = 'skipped';
        stageResult.duration = Date.now() - stageStartTime;
        this.results.push(stageResult);
        this.updateProgress(stage);
        return;
      }

      const output = await this.runCommand(command, this.config.timeout);

      stageResult.status = 'passed';
      stageResult.output = output;
      stageResult.duration = Date.now() - stageStartTime;

    } catch (error: any) {
      stageResult.status = 'failed';
      stageResult.error = error.message;
      stageResult.duration = Date.now() - stageStartTime;
      this.results.push(stageResult);

      // Don't fail on test stage if configured to continue
      if (stage === 'test' && this.config.keepArtifacts) {
        console.warn('Tests failed but continuing with deployment...');
        this.updateProgress(stage);
        return;
      }

      throw error;
    }

    this.results.push(stageResult);
    this.updateProgress(stage);
  }

  private runCommand(command: string, timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command.split(' ');
      const proc = spawn(cmd, args, {
        shell: true,
        stdio: 'pipe',
        env: {
          ...process.env,
          NODE_ENV: this.config.environment,
        },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
        process.stdout.write(data);
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
        process.stderr.write(data);
      });

      const timeoutHandle = setTimeout(() => {
        proc.kill();
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      proc.on('close', (code) => {
        clearTimeout(timeoutHandle);
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
        }
      });

      proc.on('error', (error) => {
        clearTimeout(timeoutHandle);
        reject(error);
      });
    });
  }

  private updateProgress(completedStage: PipelineStage): void {
    const stages: PipelineStage[] = ['install', 'build', 'test', 'deploy', 'verify'];
    const index = stages.indexOf(completedStage);
    this.status.progress = ((index + 1) / stages.length) * 100;
  }

  private async collectArtifacts(): Promise<string[]> {
    const artifacts: string[] = [];

    try {
      const artifactsDir = this.config.artifactsDir;
      await fs.access(artifactsDir);

      const files = await fs.readdir(artifactsDir, { withFileTypes: true });

      for (const file of files) {
        const fullPath = path.join(artifactsDir, file.name);
        if (file.isFile()) {
          artifacts.push(fullPath);
        } else if (file.isDirectory()) {
          artifacts.push(fullPath + '/');
        }
      }
    } catch {
      // Artifacts directory doesn't exist
    }

    return artifacts;
  }

  private getVersion(): string {
    try {
      const pkg = JSON.parse(require('fs').readFileSync('package.json', 'utf-8'));
      return pkg.version || '0.0.0';
    } catch {
      return '0.0.0';
    }
  }

  private getCommit(): string {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim().substring(0, 7);
    } catch {
      return 'unknown';
    }
  }

  async rollback(): Promise<void> {
    if (this.config.target !== 'npm') {
      throw new Error('Rollback is only supported for npm deployments');
    }

    // Get previous version
    const currentVersion = this.getVersion();
    const versionParts = currentVersion.split('.');
    const prevVersion = versionParts.length >= 3
      ? `${versionParts[0]}.${versionParts[1]}.${parseInt(versionParts[2]) - 1}`
      : currentVersion;

    console.log(`Rolling back from ${currentVersion} to ${prevVersion}`);

    try {
      // Try to publish previous version (if it exists)
      await this.runCommand(`npm publish --tag previous`, 120000);
    } catch {
      console.warn('Could not rollback - previous version may not exist');
    }
  }

  async cleanup(): Promise<void> {
    if (!this.config.keepArtifacts) {
      try {
        await fs.rm(this.config.artifactsDir, { recursive: true, force: true });
        console.log('Cleaned up artifacts');
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  generateReport(result: PipelineResult): string {
    const statusEmoji = result.success ? '✅' : '❌';

    let report = `# Deployment Report\n\n`;
    report += `${statusEmoji} **${result.success ? 'Deployment Successful' : 'Deployment Failed'}**\n\n`;
    report += `## Details\n`;
    report += `- Environment: ${result.environment}\n`;
    report += `- Target: ${result.target}\n`;
    report += `- Version: ${result.version}\n`;
    report += `- Commit: ${result.commit}\n`;
    report += `- Duration: ${(result.totalDuration / 1000).toFixed(2)}s\n`;
    report += `- Deployed At: ${result.deployedAt.toISOString()}\n\n`;

    report += `## Stages\n`;
    report += `| Stage | Status | Duration |\n`;
    report += `|-------|--------|----------|\n`;

    for (const stage of result.stages) {
      const statusIcon = stage.status === 'passed' ? '✅' :
                        stage.status === 'failed' ? '❌' :
                        stage.status === 'skipped' ? '⏭️' : '🔄';
      report += `| ${stage.stage} | ${statusIcon} ${stage.status} | ${stage.duration}ms |\n`;
    }

    if (result.artifacts.length > 0) {
      report += `\n## Artifacts\n`;
      for (const artifact of result.artifacts) {
        report += `- ${artifact}\n`;
      }
    }

    if (!result.success) {
      const failedStage = result.stages.find(s => s.status === 'failed');
      if (failedStage) {
        report += `\n## Error\n`;
        report += `\`\`\`\n${failedStage.error || 'Unknown error'}\n\`\`\`\n`;
      }
    }

    return report;
  }
}

// Quick deployment function
export async function deploy(
  environment: Environment = 'development',
  target: DeployTarget = 'npm'
): Promise<PipelineResult> {
  const pipeline = new DeploymentPipeline(environment, target);
  const result = await pipeline.run();

  if (!result.success) {
    await pipeline.cleanup();
  }

  return result;
}

// Get deployment status
export async function getDeploymentStatus(): Promise<DeploymentStatus | null> {
  const statusFile = '.deploy-status';

  try {
    const content = await fs.readFile(statusFile, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// Save deployment status
export async function saveDeploymentStatus(status: DeploymentStatus): Promise<void> {
  await fs.writeFile('.deploy-status', JSON.stringify(status, null, 2));
}

export function createDeploymentPipeline(
  environment: Environment = 'development',
  target: DeployTarget = 'npm',
  config?: Partial<PipelineConfig>
): DeploymentPipeline {
  const pipeline = new DeploymentPipeline(environment, target);

  if (config) {
    Object.assign(pipeline['config'], config);
  }

  return pipeline;
}
