import {
  StorageAdapter,
  StorageAdapterConfig,
  UploadResult,
  DeleteResult,
  GetUrlResult,
} from "./storage-adapter";
import { mkdir, writeFile, unlink, stat } from "fs/promises";
import { join } from "path";

export class LocalStorageAdapter extends StorageAdapter {
  private uploadDir: string;

  constructor(config: StorageAdapterConfig = {}) {
    super({
      baseUrl: "/uploads",
      ...config,
    });

    this.uploadDir = join(process.cwd(), "public", "uploads");
  }

  async upload(
    file: Buffer,
    path: string,
    mimeType: string
  ): Promise<UploadResult> {
    try {
      if (!this.validateFileSize(file.length)) {
        throw new Error(
          `File size exceeds limit of ${this.config.maxFileSize} bytes`
        );
      }

      const normalizedPath = this.normalizePath(path);
      const fullPath = join(this.uploadDir, normalizedPath);

      // Create directory if it doesn't exist
      const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
      await mkdir(dir, { recursive: true });

      // Write file
      await writeFile(fullPath, file);

      return {
        url: `${this.config.baseUrl}/${normalizedPath}`,
        path: normalizedPath,
        size: file.length,
      };
    } catch (error) {
      console.error("Local storage upload error:", error);
      throw error;
    }
  }

  async delete(path: string): Promise<DeleteResult> {
    try {
      const normalizedPath = this.normalizePath(path);
      const fullPath = join(this.uploadDir, normalizedPath);

      await unlink(fullPath);

      return {
        success: true,
        path: normalizedPath,
      };
    } catch (error) {
      console.error("Local storage delete error:", error);
      throw error;
    }
  }

  async getUrl(path: string): Promise<GetUrlResult> {
    try {
      const normalizedPath = this.normalizePath(path);
      const fullPath = join(this.uploadDir, normalizedPath);

      // Check if file exists
      await stat(fullPath);

      return {
        url: `${this.config.baseUrl}/${normalizedPath}`,
        publicUrl: true,
      };
    } catch (error) {
      console.error("Local storage getUrl error:", error);
      throw error;
    }
  }

  async getPresignedUrl(
    path: string,
    expiresIn: number = 3600
  ): Promise<GetUrlResult> {
    // Local storage doesn't have presigned URLs, return regular URL
    return this.getUrl(path);
  }

  async exists(path: string): Promise<boolean> {
    try {
      const normalizedPath = this.normalizePath(path);
      const fullPath = join(this.uploadDir, normalizedPath);
      await stat(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}
