import { IFileStore, FileMetadata } from '../../infrastructure/file-store/index.js';
import { IEventBus, DomainEvent } from '../../infrastructure/event-bus/index.js';
import { generateId } from '../../infrastructure/utils/id.js';
import * as path from 'path';

export type ArtifactType = 'code' | 'document' | 'test' | 'config' | 'diagram' | 'data';

export interface Artifact {
  id: string;
  taskId: string;
  type: ArtifactType;
  name: string;
  path: string;
  size: number;
  mimeType: string;
  createdAt: Date;
  checksum: string;
}

export interface IArtifactRepository {
  save(artifact: Artifact): Promise<void>;
  findByTaskId(taskId: string): Promise<Artifact[]>;
  findById(id: string): Promise<Artifact | null>;
}

export class ArtifactRepository implements IArtifactRepository {
  private basePath = 'artifacts';
  private indexCache: Map<string, string[]> = new Map();

  constructor(private fileStore: IFileStore) {}

  async save(artifact: Artifact): Promise<void> {
    const artifactPath = `${this.basePath}/${artifact.taskId}/${artifact.id}.json`;
    await this.fileStore.write(artifactPath, JSON.stringify(artifact, null, 2));

    const list = this.indexCache.get(artifact.taskId) || [];
    list.push(artifact.id);
    this.indexCache.set(artifact.taskId, list);
  }

  async findByTaskId(taskId: string): Promise<Artifact[]> {
    const dir = `${this.basePath}/${taskId}`;
    const files = await this.fileStore.list(dir);
    const artifacts: Artifact[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      try {
        const content = await this.fileStore.readText(`${dir}/${file}`);
        artifacts.push(JSON.parse(content));
      } catch {
        // 忽略错误
      }
    }

    return artifacts;
  }

  async findById(id: string): Promise<Artifact | null> {
    // 需要遍历查找
    const baseDir = this.basePath;
    const taskDirs = await this.fileStore.list(baseDir);

    for (const taskDir of taskDirs) {
      const artifactPath = `${baseDir}/${taskDir}/${id}.json`;
      try {
        const content = await this.fileStore.readText(artifactPath);
        return JSON.parse(content);
      } catch {
        continue;
      }
    }

    return null;
  }
}

export class ArtifactService {
  private artifactRepo: ArtifactRepository;

  constructor(
    private fileStore: IFileStore,
    private eventBus: IEventBus
  ) {
    this.artifactRepo = new ArtifactRepository(fileStore);
    
    // 订阅文件创建事件
    this.eventBus.subscribe('file.created', this.onFileCreated.bind(this));
  }

  private async onFileCreated(event: DomainEvent): Promise<void> {
    const { taskId, filePath, fileSize } = event.payload;

    const artifact: Artifact = {
      id: generateId(),
      taskId,
      type: this.classifyFile(filePath),
      name: path.basename(filePath),
      path: filePath,
      size: fileSize,
      mimeType: this.getMimeType(filePath),
      createdAt: new Date(),
      checksum: '' // 实际实现需要计算
    };

    await this.artifactRepo.save(artifact);

    await this.eventBus.publish({
      type: 'artifact.created',
      timestamp: new Date(),
      payload: artifact
    });
  }

  async getByTaskId(taskId: string): Promise<Artifact[]> {
    return this.artifactRepo.findByTaskId(taskId);
  }

  async getById(id: string): Promise<Artifact | null> {
    return this.artifactRepo.findById(id);
  }

  async registerArtifact(taskId: string, filePath: string, content: string | Buffer): Promise<Artifact> {
    const artifact: Artifact = {
      id: generateId(),
      taskId,
      type: this.classifyFile(filePath),
      name: path.basename(filePath),
      path: filePath,
      size: Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content),
      mimeType: this.getMimeType(filePath),
      createdAt: new Date(),
      checksum: '' // 实际实现需要计算
    };

    await this.artifactRepo.save(artifact);

    await this.eventBus.publish({
      type: 'artifact.created',
      timestamp: new Date(),
      payload: artifact
    });

    return artifact;
  }

  private classifyFile(filePath: string): ArtifactType {
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath).toLowerCase();

    if (fileName.includes('.test.') || fileName.includes('.spec.')) return 'test';
    if (['.ts', '.js', '.py', '.java', '.go', '.rs'].includes(ext)) return 'code';
    if (['.md', '.doc', '.docx', '.txt'].includes(ext)) return 'document';
    if (['.json', '.yaml', '.yml', '.toml', '.ini'].includes(ext)) return 'config';
    if (['.png', '.jpg', '.jpeg', '.svg', '.gif'].includes(ext)) return 'diagram';
    return 'data';
  }

  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.ts': 'text/typescript',
      '.js': 'text/javascript',
      '.json': 'application/json',
      '.md': 'text/markdown',
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.css': 'text/css',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}
