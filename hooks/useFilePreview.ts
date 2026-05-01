import { useState } from "react";

export interface FileData {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: Date;
  uploadedBy: { id: string; name: string | null } | null;
}

export function useFilePreview() {
  const [isOpen, setIsOpen] = useState(false);
  const [fileData, setFileData] = useState<FileData | null>(null);

  const open = (file: FileData) => {
    setFileData(file);
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    // Delay clearing data to allow modal animation
    setTimeout(() => setFileData(null), 300);
  };

  return {
    isOpen,
    fileData,
    open,
    close,
  };
}
