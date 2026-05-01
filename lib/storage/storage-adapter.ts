/**
 * Interface abstrata para diferentes backends de storage
 * Permite múltiplas implementações: Local, Vercel Blob, S3, etc
 */

export interface StorageAdapterConfig {
  baseUrl?: string;
  maxFileSize?: number;
}

export interface UploadResult {
  url: string;
  path: string;
  size: number;
}

export interface DeleteResult {
  success: boolean;
  path: string;
}

export interface GetUrlResult {
  url: string;
  publicUrl: boolean;
}

export abstract class StorageAdapter {
  protected config: StorageAdapterConfig;

  constructor(config: StorageAdapterConfig = {}) {
    this.config = {
      maxFileSize: 10 * 1024 * 1024, // 10MB default
      ...config,
    };
  }

  /**
   * Upload file to storage
   * @param file File to upload
   * @param path Destination path (e.g., "uploads/demandas/{id}/file.pdf")
   * @returns Upload result with public URL
   */
  abstract upload(file: Buffer, path: string, mimeType: string): Promise<UploadResult>;

  /**
   * Delete file from storage
   * @param path File path to delete
   * @returns Delete result
   */
  abstract delete(path: string): Promise<DeleteResult>;

  /**
   * Get public URL for a file
   * @param path File path
   * @returns Public URL (for display/download)
   */
  abstract getUrl(path: string): Promise<GetUrlResult>;

  /**
   * Get presigned/temporary URL (for secure access)
   * @param path File path
   * @param expiresIn Expiration time in seconds (default 1 hour)
   * @returns Presigned URL
   */
  abstract getPresignedUrl(path: string, expiresIn?: number): Promise<GetUrlResult>;

  /**
   * Check if file exists
   * @param path File path
   * @returns true if file exists
   */
  abstract exists(path: string): Promise<boolean>;

  /**
   * Validate file size
   * @param fileSize File size in bytes
   * @returns true if size is within limits
   */
  protected validateFileSize(fileSize: number): boolean {
    return fileSize <= this.config.maxFileSize!;
  }

  /**
   * Normalize path (remove leading/trailing slashes)
   */
  protected normalizePath(path: string): string {
    return path.replace(/^\/+|\/+$/g, "");
  }
}
