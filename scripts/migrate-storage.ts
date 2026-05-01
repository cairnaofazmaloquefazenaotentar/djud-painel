/**
 * Script de migração de storage
 * Permite migrar arquivos entre diferentes backends de storage
 *
 * Uso:
 * npx ts-node scripts/migrate-storage.ts --from local --to vercel-blob --dry-run
 * npx ts-node scripts/migrate-storage.ts --from local --to vercel-blob
 */

import { db } from "@/lib/db";
import { LocalStorageAdapter } from "@/lib/storage/local-adapter";
import { VercelBlobAdapter } from "@/lib/storage/vercel-blob-adapter";
import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { join } from "path";

type StorageBackend = "local" | "vercel-blob";

interface MigrationOptions {
  from: StorageBackend;
  to: StorageBackend;
  dryRun: boolean;
}

async function calculateSHA256(buffer: Buffer): Promise<string> {
  return createHash("sha256").update(buffer).digest("hex");
}

async function migrateStorage(options: MigrationOptions): Promise<void> {
  console.log(
    `🚀 Starting storage migration: ${options.from} → ${options.to}`
  );
  if (options.dryRun) {
    console.log("📋 DRY RUN MODE - No files will be modified");
  }
  console.log("");

  try {
    // Initialize storage adapters
    const sourceAdapter =
      options.from === "local"
        ? new LocalStorageAdapter()
        : new VercelBlobAdapter();

    const targetAdapter =
      options.to === "local"
        ? new LocalStorageAdapter()
        : new VercelBlobAdapter();

    // Get all attachments from database
    const attachments = await db.attachment.findMany({
      select: {
        id: true,
        demandaId: true,
        fileName: true,
        fileSize: true,
        storagePath: true,
      },
      orderBy: { uploadedAt: "desc" },
    });

    console.log(`📦 Found ${attachments.length} attachments to migrate`);
    console.log("");

    let successCount = 0;
    let failedCount = 0;
    const failedFiles: Array<{
      fileName: string;
      storagePath: string;
      error: string;
    }> = [];

    // Migrate each attachment
    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i];
      const progress = `[${i + 1}/${attachments.length}]`;

      try {
        // Read file from source
        let fileBuffer: Buffer;

        if (options.from === "local") {
          const fullPath = join(
            process.cwd(),
            "public",
            att.storagePath.replace(/^\//, "")
          );
          try {
            fileBuffer = await readFile(fullPath);
          } catch (error) {
            throw new Error(`Cannot read file from disk: ${fullPath}`);
          }
        } else {
          // For Vercel Blob, we would need to download first
          // This is a simplified version - in production, use blob.download()
          throw new Error(
            "Migration from Vercel Blob not yet implemented. Use local as source."
          );
        }

        // Calculate SHA256 before/after
        const sourceSHA256 = await calculateSHA256(fileBuffer);

        if (!options.dryRun) {
          // Upload to target
          const uploadResult = await targetAdapter.upload(
            fileBuffer,
            att.storagePath,
            att.fileName
          );

          // Verify SHA256 after upload (if same storage backend)
          if (options.to === "local") {
            const targetFullPath = join(
              process.cwd(),
              "public",
              uploadResult.path.replace(/^\//, "")
            );
            const targetBuffer = await readFile(targetFullPath);
            const targetSHA256 = await calculateSHA256(targetBuffer);

            if (sourceSHA256 !== targetSHA256) {
              throw new Error(
                `SHA256 mismatch: ${sourceSHA256} != ${targetSHA256}`
              );
            }
          }

          // Update database
          await db.attachment.update({
            where: { id: att.id },
            data: {
              storagePath: uploadResult.path,
            },
          });

          // Delete from source (if different backend and not dry-run)
          if (options.from !== options.to) {
            try {
              await sourceAdapter.delete(att.storagePath);
              console.log(
                `${progress} ✅ ${att.fileName} (${(att.fileSize / 1024 / 1024).toFixed(2)}MB) - Migrated & Deleted`
              );
            } catch (error) {
              console.log(
                `${progress} ⚠️ ${att.fileName} - Migrated but couldn't delete from source`
              );
            }
          } else {
            console.log(
              `${progress} ✅ ${att.fileName} (${(att.fileSize / 1024 / 1024).toFixed(2)}MB) - Migrated`
            );
          }
        } else {
          console.log(
            `${progress} 📋 [DRY] ${att.fileName} (${(att.fileSize / 1024 / 1024).toFixed(2)}MB) - Would migrate`
          );
        }

        successCount++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`${progress} ❌ ${att.fileName} - Error: ${errorMsg}`);
        failedCount++;
        failedFiles.push({
          fileName: att.fileName,
          storagePath: att.storagePath,
          error: errorMsg,
        });
      }
    }

    // Summary
    console.log("");
    console.log("=" .repeat(60));
    console.log("📊 Migration Summary:");
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Failed: ${failedCount}`);
    console.log(`   📦 Total: ${attachments.length}`);

    if (failedFiles.length > 0) {
      console.log("");
      console.log("Failed files:");
      failedFiles.forEach((f) => {
        console.log(`   - ${f.fileName}: ${f.error}`);
      });
    }

    if (options.dryRun) {
      console.log("");
      console.log(
        "🔄 DRY RUN complete. Run without --dry-run to apply changes."
      );
    }

    console.log("=" .repeat(60));
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

// Parse CLI arguments
function parseArgs(): MigrationOptions {
  const args = process.argv.slice(2);

  let from: StorageBackend = "local";
  let to: StorageBackend = "vercel-blob";
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--from" && i + 1 < args.length) {
      from = args[i + 1] as StorageBackend;
      i++;
    } else if (args[i] === "--to" && i + 1 < args.length) {
      to = args[i + 1] as StorageBackend;
      i++;
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    }
  }

  return { from, to, dryRun };
}

// Run migration
const options = parseArgs();
migrateStorage(options).catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
