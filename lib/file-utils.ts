/**
 * Detecta o MIME type baseado na extensão do arquivo
 */
export function getMimeType(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop() || "";

  const mimeMap: Record<string, string> = {
    // PDF
    pdf: "application/pdf",

    // Imagens
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    tiff: "image/tiff",

    // Documentos Office
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",

    // Textos
    txt: "text/plain",
    csv: "text/csv",
    json: "application/json",
    xml: "application/xml",

    // Arquivos
    zip: "application/zip",
    rar: "application/x-rar-compressed",
    "7z": "application/x-7z-compressed",

    // Áudio/Vídeo
    mp3: "audio/mpeg",
    wav: "audio/wav",
    mp4: "video/mp4",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
  };

  return mimeMap[ext] || "application/octet-stream";
}

/**
 * Retorna o nome do ícone Lucide baseado no MIME type
 * Use com componentes UI para renderizar o ícone correto
 */
export function getFileIconName(mimeType: string): string {
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType === "application/pdf") {
    return "file-pdf";
  }
  if (
    mimeType.includes("word") ||
    mimeType.includes("text") ||
    mimeType === "text/plain"
  ) {
    return "file-text";
  }
  if (mimeType.includes("sheet") || mimeType === "text/csv") {
    return "spreadsheet";
  }
  if (mimeType === "application/json") {
    return "file-json";
  }

  return "file";
}

/**
 * Formata tamanho de arquivo em bytes para formato legível
 * Exemplo: 1024 -> "1 KB", 1048576 -> "1 MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
}

/**
 * Verifica se um arquivo pode ser visualizado inline
 * Retorna true para tipos que temos viewers: PDF, imagens, etc
 */
export function isPreviewable(mimeType: string): boolean {
  const previewableMimeTypes = [
    // PDFs
    "application/pdf",

    // Imagens
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "image/bmp",
    "image/tiff",

    // Textos
    "text/plain",
    "text/csv",
    "application/json",
    "application/xml",
    "text/xml",
  ];

  return previewableMimeTypes.some((type) =>
    mimeType.startsWith(type.split("/")[0])
  );
}

/**
 * Retorna extensão do arquivo
 */
export function getFileExtension(fileName: string): string {
  return fileName.toLowerCase().split(".").pop() || "";
}

/**
 * Retorna nome do arquivo sem extensão
 */
export function getFileNameWithoutExtension(fileName: string): string {
  return fileName.substring(0, fileName.lastIndexOf(".")) || fileName;
}

/**
 * Valida tamanho máximo do arquivo
 */
export function isFileSizeValid(
  fileSizeBytes: number,
  maxSizeMB: number = 10
): boolean {
  return fileSizeBytes <= maxSizeMB * 1024 * 1024;
}

/**
 * Valida tipos MIME permitidos
 */
export function isFileTypeAllowed(
  mimeType: string,
  allowedTypes: string[] = [
    "application/pdf",
    "image/*",
    "text/*",
    "application/json",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]
): boolean {
  return allowedTypes.some((allowed) => {
    if (allowed.endsWith("/*")) {
      const prefix = allowed.split("/")[0];
      return mimeType.startsWith(prefix);
    }
    return mimeType === allowed;
  });
}
