import {
  StorageAdapter,
  StorageAdapterConfig,
  UploadResult,
  DeleteResult,
  GetUrlResult,
} from "./storage-adapter";
import { put, del, head } from "@vercel/blob";

export class VercelBlobAdapter extends StorageAdapter {
  constructor(config: StorageAdapterConfig = {}) {
    super({
      baseUrl: process.env.BLOB_READ_WRITE_TOKEN ? "https://blob.vercel-storage.com" : undefined,
      ...config,
    });
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

      // Upload to Vercel Blob
      const response = await put(normalizedPath, file, {
        contentType: mimeType,
        access: "public",
      });

      return {
        url: response.url,
        path: normalizedPath,
        size: file.length,
      };
    } catch (error) {
      console.error("Vercel Blob upload error:", error);
      throw error;
    }
  }

  async delete(path: string): Promise<DeleteResult> {
    try {
      const normalizedPath = this.normalizePath(path);

      await del(normalizedPath);

      return {
        success: true,
        path: normalizedPath,
      };
    } catch (error) {
      console.error("Vercel Blob delete error:", error);
      throw error;
    }
  }

  async getUrl(path: string): Promise<GetUrlResult> {
    try {
      const normalizedPath = this.normalizePath(path);

      // Verify file exists
      try {
        await head(normalizedPath);
      } catch {
        throw new Error("File not found");
      }

      // Return Vercel Blob CDN URL
      const url = `https://blob.vercel-storage.com/${normalizedPath}`;

      return {
        url,
        publicUrl: true,
      };
    } catch (error) {
      console.error("Vercel Blob getUrl error:", error);
      throw error;
    }
  }

  async getPresignedUrl(
    path: string,
    expiresIn: number = 3600
  ): Promise<GetUrlResult> {
    // Vercel Blob URLs are publicly accessible, so presigned URLs are the same
    // In a real scenario with private buckets, this would generate time-limited URLs
    return this.getUrl(path);
  }

  async exists(path: string): Promise<boolean> {
    try {
      const normalizedPath = this.normalizePath(path);
      await head(normalizedPath);
      return true;
    } catch {
      return false;
    }
  }
}
