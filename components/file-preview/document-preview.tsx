"use client";

import { Download, FileText, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileIcon } from "@/components/file-icon";
import { formatFileSize } from "@/lib/file-utils";
import { useState } from "react";

interface DocumentPreviewProps {
  url: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: Date;
  uploadedBy: { id: string; name: string | null } | null;
  onClose?: () => void;
}

export function DocumentPreview({
  url,
  fileName,
  mimeType,
  fileSize,
  uploadedAt,
  uploadedBy,
  onClose,
}: DocumentPreviewProps) {
  const [copied, setCopied] = useState(false);

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-6 bg-white p-6 rounded">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="p-3 bg-gray-100 rounded-lg">
          <FileIcon mimeType={mimeType} size={32} className="text-gray-700" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-lg truncate">{fileName}</h3>
          <p className="text-sm text-muted-foreground mt-1">{mimeType}</p>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Tamanho
          </p>
          <p className="text-sm font-semibold mt-1">{formatFileSize(fileSize)}</p>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Data Upload
          </p>
          <p className="text-sm font-semibold mt-1">
            {new Date(uploadedAt).toLocaleDateString("pt-BR", {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>

        {uploadedBy && (
          <div className="col-span-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Enviado por
            </p>
            <p className="text-sm font-semibold mt-1">
              {uploadedBy.name || "Desconhecido"}
            </p>
          </div>
        )}
      </div>

      {/* Message */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-900">
          <FileText className="inline h-4 w-4 mr-2 align-middle" />
          Este tipo de arquivo não pode ser visualizado inline. Você pode baixá-lo
          para abrir em seu aplicativo.
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button onClick={handleDownload} className="flex-1">
          <Download className="h-4 w-4 mr-2" />
          Baixar Arquivo
        </Button>

        <Button
          variant="outline"
          onClick={handleCopyUrl}
          className="flex-1"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 mr-2" />
              Copiado!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-2" />
              Copiar URL
            </>
          )}
        </Button>
      </div>

      {/* Technical Details */}
      <div className="border-t pt-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          Detalhes Técnicos
        </p>
        <div className="space-y-1 text-xs text-muted-foreground font-mono bg-gray-50 p-3 rounded">
          <p>
            <span className="text-gray-600">Tipo MIME:</span>{" "}
            <span className="text-gray-900">{mimeType}</span>
          </p>
          <p className="break-all">
            <span className="text-gray-600">URL:</span>{" "}
            <span className="text-gray-900">{url.substring(0, 80)}...</span>
          </p>
        </div>
      </div>
    </div>
  );
}
