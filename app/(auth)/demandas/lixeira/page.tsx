"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Trash2, RotateCcw, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/utils";
import { rolePermissions } from "@/lib/permissions";

interface DeletedDemanda {
  id: string;
  numero: string;
  titulo: string;
  status?: string;
  prioridade?: string;
  deletedAt: string;
  criadoEm: string;
  responsavel?: { id: string; name: string } | null;
}

export default function LixeiraPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [demandas, setDemandas] = useState<DeletedDemanda[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);

  const userRole = (session?.user as any)?.role || "OPERATOR";
  const permissions = rolePermissions[userRole as keyof typeof rolePermissions] || [];
  const canWrite = permissions.includes("demandas:write");

  useEffect(() => {
    const fetchLixeira = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/demandas/lixeira?pageSize=50");
        if (res.ok) {
          const data = await res.json();
          setDemandas(data.data);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchLixeira();
  }, []);

  const handleRestore = async (id: string, numero: string) => {
    if (!canWrite) {
      toast.error("Sem permissão para restaurar demandas.");
      return;
    }
    setRestoring(id);
    try {
      const res = await fetch(`/api/demandas/${id}/restore`, { method: "POST" });
      if (res.ok) {
        setDemandas((prev) => prev.filter((d) => d.id !== id));
        toast.success(`Demanda "${numero}" restaurada com sucesso.`);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Erro ao restaurar demanda.");
      }
    } finally {
      setRestoring(null);
    }
  };

  // Calcula dias restantes na lixeira
  const daysLeft = (deletedAt: string) => {
    const deleted = new Date(deletedAt);
    const expiresAt = new Date(deleted.getTime() + 30 * 24 * 60 * 60 * 1000);
    const remaining = Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    return Math.max(0, remaining);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lixeira"
        description="Demandas excluídas são mantidas por 30 dias antes de serem permanentemente removidas."
        actions={
          <Button variant="outline" onClick={() => router.push("/demandas")}>
            ← Voltar às Demandas
          </Button>
        }
      />

      {/* Aviso */}
      <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <p className="text-sm text-amber-700 dark:text-amber-300">
          Demandas na lixeira podem ser restauradas dentro de 30 dias após a exclusão.
          Após este prazo, são removidas permanentemente.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : demandas.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
          <Trash2 className="h-10 w-10 opacity-30" />
          <p className="text-sm">Lixeira vazia</p>
        </div>
      ) : (
        <div className="space-y-2">
          {demandas.map((d) => {
            const days = daysLeft(d.deletedAt);
            return (
              <div
                key={d.id}
                className="flex items-center justify-between gap-4 p-4 bg-card border border-border rounded-lg hover:bg-muted/30 transition-colors"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-muted-foreground">{d.numero}</span>
                    {d.status && (
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full border border-border">
                        {d.status}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium truncate" title={d.titulo}>
                    {d.titulo}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Excluída em {formatDateTime(d.deletedAt)}</span>
                    <span
                      className={`font-medium ${days <= 5 ? "text-destructive" : days <= 10 ? "text-amber-600" : "text-muted-foreground"}`}
                    >
                      {days} dias restantes
                    </span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canWrite || restoring === d.id}
                  onClick={() => handleRestore(d.id, d.numero)}
                  className="shrink-0 gap-1.5"
                >
                  {restoring === d.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  Restaurar
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
