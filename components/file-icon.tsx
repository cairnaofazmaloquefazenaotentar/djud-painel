"use client";

import { File, FileText, Image as ImageIcon, FileJson } from "lucide-react";
import { getFileIconName } from "@/lib/file-utils";

interface FileIconProps {
  mimeType: string;
  size?: number;
  className?: string;
}

export function FileIcon({
  mimeType,
  size = 24,
  className = "text-muted-foreground",
}: FileIconProps) {
  const iconName = getFileIconName(mimeType);

  const iconProps = { size, className };

  switch (iconName) {
    case "image":
      return <ImageIcon {...iconProps} />;
    case "file-pdf":
      return (
        <File
          {...iconProps}
          className={className === "text-muted-foreground" ? "text-red-500" : className}
        />
      );
    case "file-text":
      return <FileText {...iconProps} />;
    case "spreadsheet":
      return (
        <FileText
          {...iconProps}
          className={className === "text-muted-foreground" ? "text-green-500" : className}
        />
      );
    case "file-json":
      return <FileJson {...iconProps} />;
    default:
      return <File {...iconProps} />;
  }
}
