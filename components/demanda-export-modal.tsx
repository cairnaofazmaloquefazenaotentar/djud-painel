"use client";

import { useState } from "react";
import { Download, Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";

interface DemandaExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  demandaId: string;
  demandaNumero: string;
}

export function DemandaExportModal({
  isOpen,
  onClose,
  demandaId,
  demandaNumero,
}: DemandaExportModalProps) {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleDownloadPDF = () => {
    // Abrir novo janela para imprimir/salvar como PDF
    window.open(`/api/demandas/${demandaId}/export-pdf`, "_blank");
    onClose();
  };

  const handleSendEmail = async () => {
    if (!email.trim()) {
      setError("Email inválido");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/relatorios/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          demandaId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Erro ao enviar email");
      }

      setSuccess("Email enviado com sucesso!");
      setEmail("");
      setTimeout(() => onClose(), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar email");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Exportar Demanda #{demandaNumero}</DialogTitle>
          <DialogClose />
        </DialogHeader>

        <div className="space-y-6 p-4">
          {/* Download Option */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Opção 1: Baixar PDF</h3>
            <p className="text-sm text-muted-foreground">
              Gera um documento PDF que você pode salvar no seu computador
            </p>
            <Button onClick={handleDownloadPDF} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Baixar PDF
            </Button>
          </div>

          <div className="border-t" />

          {/* Email Option */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Opção 2: Enviar por Email</h3>
            <p className="text-sm text-muted-foreground">
              Envia um link para visualizar o documento por email
            </p>

            {error && (
              <div className="rounded-md bg-red-50 p-3">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {success && (
              <div className="rounded-md bg-green-50 p-3">
                <p className="text-sm text-green-600">{success}</p>
              </div>
            )}

            <input
              type="email"
              placeholder="seu.email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />

            <Button
              onClick={handleSendEmail}
              disabled={isLoading || !email.trim()}
              className="w-full"
              variant="outline"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Enviar por Email
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
