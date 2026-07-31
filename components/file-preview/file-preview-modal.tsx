"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { X, AlertCircle } from "lucide-react";
import { PDFViewer } from "./pdf-viewer";
import { ImageViewer } from "./image-viewer";
import { DocumentPreview } from "./document-preview";
import { isPreviewable } from "@/lib/file-utils";
import { apiPath } from "@/lib/url";
import { useState, useEffect } from "react";

interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  attachmentId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: Date;
  uploadedBy: { id: string; name: string | null } | null;
}

export function FilePreviewModal({
  isOpen,
  onClose,
  attachmentId,
  fileName,
  mimeType,
  fileSize,
  uploadedAt,
  uploadedBy,
}: FilePreviewModalProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get preview URL
  useEffect(() => {
    if (!isOpen) return;

    const fetchPreviewUrl = async () => {
      try {
        setLoading(true);
        setError(null);
        // URL para preview endpoint
        setPreviewUrl(apiPath(`/api/attachments/${attachmentId}/preview`));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Erro ao carregar preview"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchPreviewUrl();
  }, [isOpen, attachmentId]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="border-b">
          <div className="flex items-center justify-between w-full">
            <DialogTitle className="truncate">{fileName}</DialogTitle>
            <DialogClose className="ml-auto">
              <X className="h-4 w-4" />
            </DialogClose>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-sm text-muted-foreground">
                  Carregando preview...
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                <p className="font-medium mb-2">Erro ao carregar preview</p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            </div>
          ) : !previewUrl ? (
            <div className="flex items-center justify-center h-96">
              <p className="text-muted-foreground">Não foi possível carregar o preview</p>
            </div>
          ) : mimeType === "application/pdf" ? (
            <PDFViewer url={previewUrl} fileName={fileName} onClose={onClose} />
          ) : mimeType.startsWith("image/") ? (
            <ImageViewer
              url={previewUrl}
              fileName={fileName}
              mimeType={mimeType}
              onClose={onClose}
            />
          ) : (
            <DocumentPreview
              url={previewUrl}
              fileName={fileName}
              mimeType={mimeType}
              fileSize={fileSize}
              uploadedAt={uploadedAt}
              uploadedBy={uploadedBy}
              onClose={onClose}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
