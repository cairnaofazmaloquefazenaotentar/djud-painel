"use client";

import { useState, useRef, ChangeEvent, DragEvent } from "react";
import { CloudUpload, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FormFileInputProps {
  label: string;
  error?: string;
  accept?: string;
  multiple?: boolean;
  maxSize?: number; // in bytes
  helperText?: string;
  onFilesSelected: (files: File[]) => void;
  isLoading?: boolean;
  selectedFiles?: File[];
  onRemoveFile?: (index: number) => void;
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
};

export function FormFileInput({
  label,
  error,
  accept = ".pdf,.jpg,.jpeg,.png,.doc,.docx",
  multiple = true,
  maxSize = 10 * 1024 * 1024, // 10MB
  helperText,
  onFilesSelected,
  isLoading = false,
  selectedFiles = [],
  onRemoveFile,
}: FormFileInputProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const validateFiles = (files: File[]): { valid: File[]; errors: string[] } => {
    const errors: string[] = [];
    const valid: File[] = [];

    files.forEach((file) => {
      // Check file size
      if (file.size > maxSize) {
        errors.push(
          `${file.name} excede o tamanho máximo (${formatFileSize(maxSize)})`
        );
      } else {
        valid.push(file);
      }
    });

    return { valid, errors };
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;

    const fileArray = Array.from(files);
    const { valid, errors } = validateFiles(fileArray);

    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    setValidationErrors([]);
    onFilesSelected(valid);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-foreground">
          {label}
        </label>
      )}

      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border bg-muted/30 hover:bg-muted/50",
          error && "border-destructive bg-destructive/5"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleInputChange}
          disabled={isLoading}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center gap-3">
          <div className="rounded-full bg-primary/10 p-3">
            <CloudUpload className="h-6 w-6 text-primary" />
          </div>

          <div>
            <p className="text-sm font-medium text-foreground">
              Clique ou arraste arquivos aqui
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {accept} até {formatFileSize(maxSize)}
            </p>
          </div>

          {isLoading && (
            <p className="text-xs text-muted-foreground animate-pulse">
              Enviando...
            </p>
          )}
        </div>
      </div>

      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {validationErrors.length > 0 && (
        <div className="rounded-md bg-destructive/10 p-3">
          {validationErrors.map((err, idx) => (
            <p key={idx} className="text-xs text-destructive">
              • {err}
            </p>
          ))}
        </div>
      )}

      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            Arquivo{selectedFiles.length > 1 ? "s" : ""} selecionado{selectedFiles.length > 1 ? "s" : ""}
          </p>
          <div className="space-y-2">
            {selectedFiles.map((file, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-lg border border-border bg-muted/50 p-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                  </p>
                </div>
                {onRemoveFile && (
                  <button
                    type="button"
                    onClick={() => onRemoveFile(idx)}
                    className="ml-2 p-1 hover:bg-destructive/20 rounded transition-colors"
                    title="Remover arquivo"
                  >
                    <X className="h-4 w-4 text-destructive" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
