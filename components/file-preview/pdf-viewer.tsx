"use client";

import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Set up PDF worker
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

interface PDFViewerProps {
  url: string;
  fileName: string;
  onClose?: () => void;
}

export function PDFViewer({ url, fileName, onClose }: PDFViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [rendering, setRendering] = useState(false);

  // Load PDF
  useEffect(() => {
    let isMounted = true;

    const loadPdf = async () => {
      try {
        setLoading(true);
        setError(null);

        const pdf = await pdfjsLib.getDocument(url).promise;
        if (isMounted) {
          setPdf(pdf);
          setTotalPages(pdf.numPages);
          setCurrentPage(1);
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error
              ? err.message
              : "Erro ao carregar PDF"
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadPdf();

    return () => {
      isMounted = false;
    };
  }, [url]);

  // Render page
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;

    let isMounted = true;

    const renderPage = async (pageNum: number) => {
      try {
        setRendering(true);
        const page = await pdf.getPage(pageNum);

        const viewport = page.getViewport({ scale: zoom / 100 });
        const canvas = canvasRef.current!;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderContext = {
          canvasContext: canvas.getContext("2d")!,
          viewport: viewport,
        };

        await page.render(renderContext).promise;
        if (isMounted) {
          setRendering(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error
              ? err.message
              : "Erro ao renderizar página"
          );
          setRendering(false);
        }
      }
    };

    renderPage(currentPage);

    return () => {
      isMounted = false;
    };
  }, [pdf, currentPage, zoom]);

  const goToPreviousPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const goToNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  const handlePageInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const page = parseInt(e.target.value, 10);
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 25, 400));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 25, 50));
  };

  const handleFullScreen = () => {
    canvasRef.current?.requestFullscreen?.();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-100 rounded">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96 bg-red-50 rounded border border-red-200">
        <div className="text-center">
          <p className="text-red-600 font-medium mb-2">Erro ao carregar PDF</p>
          <p className="text-sm text-red-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 bg-white p-4 rounded">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <p className="font-medium text-sm truncate">{fileName}</p>
          <p className="text-xs text-muted-foreground">
            Página {currentPage} de {totalPages}
          </p>
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

      {/* Canvas */}
      <div className="flex items-center justify-center bg-gray-50 rounded overflow-auto max-h-96">
        <canvas
          ref={canvasRef}
          className={rendering ? "opacity-50" : ""}
        />
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between border-t pt-4">
        <Button
          variant="outline"
          onClick={goToPreviousPage}
          disabled={currentPage === 1 || rendering}
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Anterior
        </Button>

        <div className="flex items-center gap-2">
          <label htmlFor="page-input" className="text-sm text-muted-foreground">
            Página:
          </label>
          <input
            id="page-input"
            type="number"
            min="1"
            max={totalPages}
            value={currentPage}
            onChange={handlePageInput}
            className="w-16 px-2 py-1 border rounded text-sm"
          />
          <span className="text-sm text-muted-foreground">de {totalPages}</span>
        </div>

        <Button
          variant="outline"
          onClick={goToNextPage}
          disabled={currentPage === totalPages || rendering}
        >
          Próxima
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
