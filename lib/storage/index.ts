import { StorageAdapter, StorageAdapterConfig } from "./storage-adapter";
import { LocalStorageAdapter } from "./local-adapter";
import { VercelBlobAdapter } from "./vercel-blob-adapter";

export type StorageBackend = "local" | "vercel-blob" | "s3";

let storageInstance: StorageAdapter | null = null;

/**
 * Factory function to get the appropriate storage adapter
 * Based on environment configuration
 */
export function getStorageAdapter(config?: StorageAdapterConfig): StorageAdapter {
  // Return cached instance if already initialized
  if (storageInstance) {
    return storageInstance;
  }

  const backend = (process.env.STORAGE_ADAPTER || "local") as StorageBackend;

  switch (backend) {
    case "vercel-blob": {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        console.warn(
          "BLOB_READ_WRITE_TOKEN not configured, falling back to local storage"
        );
        storageInstance = new LocalStorageAdapter(config);
      } else {
        storageInstance = new VercelBlobAdapter(config);
      }
      break;
    }

    case "s3": {
      // S3 implementation would go here
      // For now, fall back to local
      console.warn("S3 storage not yet implemented, using local storage");
      storageInstance = new LocalStorageAdapter(config);
      break;
    }

    case "local":
    default: {
      storageInstance = new LocalStorageAdapter(config);
      break;
    }
  }

  console.log(`Storage adapter initialized: ${backend}`);
  return storageInstance;
}

/**
 * Reset storage instance (useful for testing)
 */
export function resetStorageAdapter(): void {
  storageInstance = null;
}

// Re-export adapter classes and types
export { StorageAdapter };
export type { StorageAdapterConfig, UploadResult, DeleteResult, GetUrlResult } from "./storage-adapter";
export { LocalStorageAdapter };
export { VercelBlobAdapter };
