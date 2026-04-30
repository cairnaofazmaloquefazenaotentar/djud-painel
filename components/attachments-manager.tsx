"use client";

import { useState } from "react";
import { Trash2, Download, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormFileInput } from "@/components/ui/form-file-input";
import { cn } from "@/lib/utils";

interface Attachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
  uploadedBy: {
    id: string;
    name: string;
  };
  storagePath: string;
}

interface AttachmentsManagerProps {
  demandaId: string;
  existingAttachments?: Attachment[];
  onAttachmentsChange?: (attachments: Attachment[]) => void;
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k)) ;
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
};

export function AttachmentsManager({
  demandaId,
  existingAttachments = [],
  onAttachmentsChange,
}: AttachmentsManagerProps) {
  const [attachments, setAttachments] = useState<Attachment[]>(existingAttachments);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const [deleteError, setDeleteError] = useState<string>();

  const handleFilesSelected = (files: File[]) => {
    setSelectedFiles((prev) => [...prev, ...files]);
    setUploadError(undefined);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    setUploadError(undefined);

    try {
      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(
          `/api/demandas/${demandaId}/attachments`,
          {
            method: "POST",
            body: formData,
          }
        );

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Erro ao fazer upload do arquivo");
        }

        const newAttachment = await response.json();
        setAttachments((prev) => [newAttachment, ...prev]);
      }

      setSelectedFiles([]);
      onAttachmentsChange?.(attachments);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao fazer upload";
      setUploadError(message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (attachmentId: string) => {
    if (!confirm("Deseja remover este anexo?")) return;

    setDeleteError(undefined);

    try {
      const response = await fetch(
        `/api/demandas/${demandaId}/attachments/${attachmentId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Erro ao deletar anexo");
      }

      setAttachments((prev) =>
        prev.filter((att) => att.id !== attachmentId)
      );
      onAttachmentsChange?.(attachments.filter((att) => att.id !== attachmentId));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao deletar anexo";
      setDeleteError(message);
    }
  };

  const handleDownload = (attachment: Attachment) => {
    // Create a link and trigger download
    const link = document.createElement("a");
    link.href = attachment.storagePath;
    link.download = attachment.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Anexos</h3>

        <FormFileInput
          label="Adicionar novo anexo"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          multiple
          helperText="Formatos aceitos: PDF, JPEG, PNG, DOC/DOCX. Máximo 10MB por arquivo."
          onFilesSelected={handleFilesSelected}
          isLoading={isUploading}
          selectedFiles={selectedFiles}
          onRemoveFile={handleRemoveFile}
          error={uploadError}
        />

        {selectedFiles.length > 0 && (
          <Button
            onClick={handleUpload}
            disabled={isUploading}
            className="mt-4"
          >
            {isUploading ? "Enviando..." : "Enviar Arquivo(s)"}
          </Button>
        )}
      </div>

      {deleteError && (
        <div className="rounded-md bg-destructive/10 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{deleteError}</p>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              Anexos ({attachments.length})
            </p>
          </div>

          <div className="space-y-2">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {attachment.fileName}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    <span>{formatFileSize(attachment.fileSize)}</span>
                    <span>•</span>
                    <span>
                      {new Date(attachment.uploadedAt).toLocaleDateString(
                        "pt-BR"
                      )}
                    </span>
                    <span>•</span>
                    <span>por {attachment.uploadedBy.name}</span>
                  </div>
                </div>

                <div className="flex gap-2 ml-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownload(attachment)}
                    title="Baixar arquivo"
                    className="h-8 px-2"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(attachment.id)}
                    title="Deletar arquivo"
                    className="h-8 px-2 text-destructive hover:text-destructive/90"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {attachments.length === 0 && selectedFiles.length === 0 && (
        <div className="rounded-lg border border-border bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhum anexo adicionado ainda
          </p>
        </div>
      )}
    </div>
  );
}
