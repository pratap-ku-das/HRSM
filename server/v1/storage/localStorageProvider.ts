import fs from 'node:fs';
import { mkdir, readFile, stat, unlink, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Readable } from 'node:stream';
import {
  type StorageService,
  type PutObjectResult,
  type GetObjectResult,
  type OpenReadStreamResult,
  StorageObjectNotFoundError,
  StorageKeyInvalidError,
  assertValidStorageKey,
} from './storageService.js';

export class LocalStorageProvider implements StorageService {
  readonly providerName = 'local' as const;
  readonly storageRoot: string;

  constructor(storageRoot: string) {
    this.storageRoot = path.resolve(storageRoot);
  }

  private resolveSafePath(key: string): string {
    assertValidStorageKey(key);
    const resolved = path.resolve(this.storageRoot, key);
    if (!resolved.startsWith(this.storageRoot + path.sep) && resolved !== this.storageRoot) {
      throw new StorageKeyInvalidError(`Path traversal attempt detected: "${key}"`);
    }
    return resolved;
  }

  async putObject(params: {
    key: string;
    buffer: Buffer;
    contentType: string;
    metadata?: Record<string, string>;
  }): Promise<PutObjectResult> {
    const fullPath = this.resolveSafePath(params.key);
    const parentDir = path.dirname(fullPath);
    await mkdir(parentDir, { recursive: true });

    const tempFile = `${fullPath}.tmp.${crypto.randomUUID()}`;
    const sha256 = crypto.createHash('sha256').update(params.buffer).digest('hex');

    try {
      await writeFile(tempFile, params.buffer, { flag: 'wx' });
      await rename(tempFile, fullPath);
      return {
        key: params.key,
        sha256,
        sizeBytes: params.buffer.length,
      };
    } catch (error) {
      await unlink(tempFile).catch(() => {});
      throw error;
    }
  }

  async getObject(key: string): Promise<GetObjectResult> {
    const fullPath = this.resolveSafePath(key);
    try {
      const [buffer, fileStat] = await Promise.all([
        readFile(fullPath),
        stat(fullPath),
      ]);
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      const contentType = this.inferContentType(key);

      return {
        buffer,
        contentType,
        contentLength: buffer.length,
        sha256,
        lastModified: fileStat.mtime,
      };
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        throw new StorageObjectNotFoundError(key);
      }
      throw error;
    }
  }

  async openReadStream(key: string): Promise<OpenReadStreamResult> {
    const fullPath = this.resolveSafePath(key);
    try {
      const fileStat = await stat(fullPath);
      const stream: Readable = fs.createReadStream(fullPath);
      const contentType = this.inferContentType(key);

      return {
        stream,
        contentType,
        contentLength: fileStat.size,
        lastModified: fileStat.mtime,
      };
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        throw new StorageObjectNotFoundError(key);
      }
      throw error;
    }
  }

  async createPresignedDownloadUrl(params: {
    key: string;
    expiresInSeconds?: number;
    fileName?: string;
    contentType?: string;
  }): Promise<string> {
    assertValidStorageKey(params.key);
    const expires = Math.floor(Date.now() / 1000) + (params.expiresInSeconds || 900);
    const secret = process.env.JWT_ACCESS_SECRET || 'local-presign-secret';
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${params.key}:${expires}`)
      .digest('hex');

    const query = new URLSearchParams({
      key: params.key,
      expires: String(expires),
      sig: signature,
    });
    if (params.fileName) query.set('fileName', params.fileName);
    if (params.contentType) query.set('contentType', params.contentType);

    return `/api/v1/storage/download?${query.toString()}`;
  }

  async deleteObject(key: string): Promise<void> {
    const fullPath = this.resolveSafePath(key);
    try {
      await unlink(fullPath);
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      const fullPath = this.resolveSafePath(key);
      await stat(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  private inferContentType(key: string): string {
    const ext = path.extname(key).toLowerCase();
    switch (ext) {
      case '.pdf': return 'application/pdf';
      case '.jpg':
      case '.jpeg': return 'image/jpeg';
      case '.png': return 'image/png';
      case '.doc': return 'application/msword';
      case '.docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      default: return 'application/octet-stream';
    }
  }
}
