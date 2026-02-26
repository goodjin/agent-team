import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { generateId } from '../utils/id.js';

export interface FileMetadata {
  id: string;
  path: string;
  size: number;
  checksum: string;
  createdAt: Date;
  modifiedAt: Date;
}

export interface IFileStore {
  write(relativePath: string, content: Buffer | string): Promise<FileMetadata>;
  read(relativePath: string): Promise<Buffer>;
  readText(relativePath: string): Promise<string>;
  append(relativePath: string, content: string): Promise<void>;
  delete(relativePath: string): Promise<void>;
  exists(relativePath: string): Promise<boolean>;
  list(dir: string): Promise<string[]>;
  ensureDir(dir: string): Promise<void>;
}

export class FileStore implements IFileStore {
  private basePath: string;

  constructor(basePath: string = './data') {
    this.basePath = basePath;
  }

  private getFullPath(relativePath: string): string {
    return path.join(this.basePath, relativePath);
  }

  async ensureDir(dir: string): Promise<void> {
    const fullPath = this.getFullPath(dir);
    await fs.mkdir(fullPath, { recursive: true });
  }

  async write(relativePath: string, content: Buffer | string): Promise<FileMetadata> {
    const fullPath = this.getFullPath(relativePath);
    await this.ensureDir(path.dirname(relativePath));

    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
    await fs.writeFile(fullPath, buffer);

    return {
      id: generateId(),
      path: relativePath,
      size: buffer.length,
      checksum: crypto.createHash('sha256').update(buffer).digest('hex'),
      createdAt: new Date(),
      modifiedAt: new Date()
    };
  }

  async read(relativePath: string): Promise<Buffer> {
    const fullPath = this.getFullPath(relativePath);
    return await fs.readFile(fullPath);
  }

  async readText(relativePath: string): Promise<string> {
    const buffer = await this.read(relativePath);
    return buffer.toString('utf-8');
  }

  async append(relativePath: string, content: string): Promise<void> {
    const fullPath = this.getFullPath(relativePath);
    await this.ensureDir(path.dirname(relativePath));
    await fs.appendFile(fullPath, content, 'utf-8');
  }

  async delete(relativePath: string): Promise<void> {
    const fullPath = this.getFullPath(relativePath);
    await fs.unlink(fullPath);
  }

  async exists(relativePath: string): Promise<boolean> {
    const fullPath = this.getFullPath(relativePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async list(dir: string): Promise<string[]> {
    const fullPath = this.getFullPath(dir);
    try {
      const files = await fs.readdir(fullPath);
      return files;
    } catch {
      return [];
    }
  }
}
