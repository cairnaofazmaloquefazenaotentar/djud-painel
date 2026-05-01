"use client";

import { useState } from "react";
import Image from "next/image";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImageViewerProps {
  url: string;
  fileName: string;
  mimeType: string;
  onClose?: () => void;
}

export function ImageViewer({
  url,
  fileName,
  mimeType,
  onClose,
}: ImageViewerProps) {
  const [zoom, setZoom] = useState(100);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 25, 400));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 25, 50));
  };

  const handleFullScreen = () => {
    const element = document.getElementById("image-container");
    if (element) {
      if (!isFullScreen) {
        element.requestFullscreen?.().catch(() => {
          setIsFullScreen(true);
        });
      } else {
        document.exitFullscreen?.();
      }
    }
  };

  return (
    <div className="flex flex-col gap-4 bg-white p-4 rounded">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <p className="font-medium text-sm truncate">{fileName}</p>
          <p className="text-xs text-muted-foreground">Zoom: {zoom}%</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom Controls */}
          <div className="flex items-center gap-2 border-r pr-2">
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={handleZoomOut}
              disabled={zoom <= 50}
              title="Reduzir zoom"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>

            <span className="text-sm w-10 text-center">{zoom}%</span>

            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={handleZoomIn}
              disabled={zoom >= 400}
              title="Aumentar zoom"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>

          {/* Full Screen */}
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={handleFullScreen}
            title="Tela cheia"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Image Container */}
      <div
        id="image-container"
        className="flex items-center justify-center bg-gray-50 rounded overflow-auto"
        style={{
          maxHeight: isFullScreen ? "100vh" : "400px",
        }}
      >
        <div
          style={{
            transform: `scale(${zoom / 100})`,
            transformOrigin: "center center",
            transition: "transform 0.2s ease-in-out",
          }}
        >
          <img
            src={url}
            alt={fileName}
            className="max-w-full h-auto"
            style={{
              maxWidth: isFullScreen ? "100vw" : "100%",
              maxHeight: isFullScreen ? "100vh" : "100%",
            }}
          />
        </div>
      </div>

      {/* Info */}
      <div className="text-xs text-muted-foreground border-t pt-4">
        <p>Tipo: {mimeType}</p>
        <p className="text-xs text-gray-500 mt-1">
          Dica: Use Ctrl+scroll para fazer zoom ou use os botões acima
        </p>
      </div>
    </div>
  );
}
