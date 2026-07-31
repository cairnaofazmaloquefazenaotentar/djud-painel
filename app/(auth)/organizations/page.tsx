"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/layout/page-header";
import {
  DataTable,
  FilterBar,
  FilterInput,
  StatusBadge,
  ConfirmDialog,
  EmptyState,
} from "@/components/backoffice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Edit2, Lock, Building2, Users, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { rolePermissions } from "@/lib/permissions";
import { apiPath } from "@/lib/url";
import { toast } from "sonner";

interface Organization {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  usersCount: number;
  demandasCount: number;
  createdAt: string;
}

export default function OrganizationsPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState("1");
  const [busca, setBusca] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [formData, setFormData] = useState({ name: "", slug: "", active: true });
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean; orgId?: string; orgName?: string;
  }>({ open: false });

  const userRole = (session?.user as any)?.role || "OPERATOR";
  const permissions = rolePermissions[userRole as keyof typeof rolePermissions] || [];
  const canWrite  = permissions.includes("users:write");
  const canDelete = permissions.includes("users:delete");

  const fetchOrganizations = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, pageSize: "20" });
      if (busca) params.append("busca", busca);
      const res = await fetch(apiPath(`/api/organizations?${params}`));
      if (res.ok) {
        const data = await res.json();
        setOrganizations(data.data);
        setTotal(data.pagination?.total ?? data.data.length);
        setTotalPages(data.pagination?.totalPages ?? 1);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrganizations(); }, [page, busca]);

  const generateSlug = (name: string) =>
    name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");

  const openCreate = () => {
    setEditingOrg(null);
    setFormData({ name: "", slug: "", active: true });
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (org: Organization) => {
    setEditingOrg(org);
    setFormData({ name: org.name, slug: org.slug, active: org.active });
    setFormError("");
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError("");
    try {
      const method = editingOrg ? "PUT" : "POST";
      const url    = apiPath(editingOrg ? `/api/organizations/${editingOrg.id}` : "/api/organizations");
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setShowForm(false);
        fetchOrganizations();
        toast.success(editingOrg ? "Organização atualizada." : "Organização criada com sucesso.");
      } else {
        const err = await res.json();
        setFormError(err.error || "Erro ao salvar organização");
        toast.error(err.error || "Erro ao salvar organização");
      }
    } catch {
      setFormError("Erro ao salvar organização");
      toast.error("Não foi possível conectar ao servidor.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.orgId) return;
    const orgName = deleteDialog.orgName;
    try {
      const res = await fetch(apiPath(`/api/organizations/${deleteDialog.orgId}`), { method: "DELETE" });
      setDeleteDialog({ open: false });
      if (res.ok) {
        fetchOrganizations();
        toast.success(`Organização "${orgName}" desativada.`);
      } else {
        toast.error("Erro ao desativar organização.");
      }
    } catch {
      toast.error("Não foi possível conectar ao servidor.");
    }
  };

  const columns: ColumnDef<Organization>[] = [
    {
      accessorKey: "name",
      header: "Nome",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-medium text-sm">{row.original.name}</p>
            <p className="text-xs text-muted-foreground font-mono">{row.original.slug}</p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "active",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge status={row.original.active ? "active" : "inactive"}>
          {row.original.active ? "Ativa" : "Inativa"}
        </StatusBadge>
      ),
    },
    {
      accessorKey: "usersCount",
      header: "Usuários",
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {row.original.usersCount}
        </div>
      ),
    },
    {
      accessorKey: "demandasCount",
      header: "Demandas",
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          {row.original.demandasCount.toLocaleString("pt-BR")}
        </div>
      ),
    },
    {
      id: "actions",
      header: "Ações",
      cell: ({ row }) => (
        <div className="flex gap-1">
          {canWrite ? (
            <Button variant="ghost" size="sm" className="h-8 px-2 gap-1.5"
              onClick={() => openEdit(row.original)}>
              <Edit2 className="h-3.5 w-3.5" />
              <span className="text-xs hidden sm:inline">Editar</span>
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="h-8 px-2 opacity-40" disabled title="Sem permissão para editar">
              <Lock className="h-3.5 w-3.5" />
            </Button>
          )}
          {canDelete ? (
            <Button variant="ghost" size="sm"
              className="h-8 px-2 gap-1.5 text-destructive hover:text-destructive/90 hover:bg-destructive/10"
              onClick={() => setDeleteDialog({ open: true, orgId: row.original.id, orgName: row.original.name })}>
              <Trash2 className="h-3.5 w-3.5" />
              <span className="text-xs hidden sm:inline">Desativar</span>
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="h-8 px-2 opacity-40" disabled title="Sem permissão para desativar">
              <Lock className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Organizações"
        description={`${total} organização${total !== 1 ? "s" : ""} cadastrada${total !== 1 ? "s" : ""}`}
        actions={
          canWrite ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Organização
            </Button>
          ) : undefined
        }
      />

      {/* Formulário inline de criação/edição */}
      {showForm && (
        <div className="bg-card border border-border rounded-xl p-6 max-w-lg shadow-sm">
          <h3 className="text-base font-semibold mb-1">
            {editingOrg ? "Editar Organização" : "Nova Organização"}
          </h3>
          <p className="text-sm text-muted-foreground mb-5">
            {editingOrg
              ? "Atualize os dados da organização."
              : "Preencha os dados para criar uma nova unidade organizacional."}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nome */}
            <div className="space-y-1.5">
              <Label htmlFor="org-name">
                Nome <span className="text-destructive">*</span>
              </Label>
              <Input
                id="org-name"
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    name: e.target.value,
                    slug: prev.slug || generateSlug(e.target.value),
                  }))
                }
                placeholder="Ex: COAJUD — Coordenação de Atenção Judiciária"
                required
              />
            </div>

            {/* Slug */}
            <div className="space-y-1.5">
              <Label htmlFor="org-slug">
                Slug <span className="text-destructive">*</span>
              </Label>
              <Input
                id="org-slug"
                type="text"
                value={formData.slug}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, slug: e.target.value }))
                }
                placeholder="Ex: coajud"
                className="font-mono"
                required
              />
              <p className="text-xs text-muted-foreground">
                Apenas letras minúsculas, números e hífens
              </p>
            </div>

            {/* Ativa */}
            <div className="flex items-center gap-2.5 p-3 bg-muted/40 rounded-lg">
              <input
                type="checkbox"
                id="org-active"
                checked={formData.active}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, active: e.target.checked }))
                }
                className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
              />
              <Label htmlFor="org-active" className="cursor-pointer font-normal">
                Organização ativa
              </Label>
            </div>

            {/* Erro */}
            {formError && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                {formError}
              </p>
            )}

            {/* Ações */}
            <div className="flex gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowForm(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Salvando..." : editingOrg ? "Salvar alterações" : "Criar organização"}
              </Button>
            </div>
          </form>
        </div>
      )}

      <FilterBar
        onReset={busca ? () => { setBusca(""); setPage("1"); } : undefined}
        isActive={!!busca}
      >
        <FilterInput
          label="Buscar"
          placeholder="Nome da organização..."
          value={busca}
          onChange={(v) => { setBusca(v); setPage("1"); }}
        />
      </FilterBar>

      <DataTable<Organization>
        columns={columns}
        data={organizations}
        loading={loading}
        pageSize={20}
        renderEmptyState={() => (
          <EmptyState
            title="Nenhuma organização encontrada"
            description="Crie a primeira organização para começar a associar usuários e demandas."
            action={
              canWrite ? (
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Organização
                </Button>
              ) : undefined
            }
          />
        )}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">
            Página{" "}
            <span className="font-semibold text-foreground">{page}</span>{" "}
            de{" "}
            <span className="font-semibold text-foreground">{totalPages}</span>
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0 transition-all hover:border-primary/40 hover:text-primary disabled:opacity-30"
              disabled={page === "1"}
              onClick={() => setPage(String(Math.max(1, parseInt(page) - 1)))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0 transition-all hover:border-primary/40 hover:text-primary disabled:opacity-30"
              disabled={parseInt(page) >= totalPages}
              onClick={() => setPage(String(Math.min(totalPages, parseInt(page) + 1)))}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}
        title="Desativar organização"
        description={`Deseja desativar a organização "${deleteDialog.orgName}"? Ela não será excluída permanentemente.`}
        actionLabel="Desativar"
        isDestructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
