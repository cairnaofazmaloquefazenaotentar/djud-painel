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
import { Plus, Trash2, Edit2, Lock, Building2, Users, FileText } from "lucide-react";
import { rolePermissions } from "@/lib/permissions";

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
      const res = await fetch(`/api/organizations?${params}`);
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
      const url    = editingOrg ? `/api/organizations/${editingOrg.id}` : "/api/organizations";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setShowForm(false);
        fetchOrganizations();
      } else {
        const err = await res.json();
        setFormError(err.error || "Erro ao salvar organização");
      }
    } catch {
      setFormError("Erro ao salvar organização");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.orgId) return;
    try {
      await fetch(`/api/organizations/${deleteDialog.orgId}`, { method: "DELETE" });
      setDeleteDialog({ open: false });
      fetchOrganizations();
    } catch (e) { console.error(e); }
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
            <Button variant="ghost" size="sm" className="h-8 px-2"
              onClick={() => openEdit(row.original)}>
              <Edit2 className="h-4 w-4" />
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="h-8 px-2 opacity-50" disabled>
              <Lock className="h-4 w-4" />
            </Button>
          )}
          {canDelete ? (
            <Button variant="ghost" size="sm"
              className="h-8 px-2 text-destructive hover:text-destructive/90"
              onClick={() => setDeleteDialog({ open: true, orgId: row.original.id, orgName: row.original.name })}>
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="h-8 px-2 opacity-50" disabled>
              <Lock className="h-4 w-4" />
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
        <div className="bg-card border border-border rounded-lg p-6 max-w-lg">
          <h3 className="text-base font-semibold mb-4">
            {editingOrg ? "Editar Organização" : "Nova Organização"}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nome <span className="text-destructive">*</span></label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  name: e.target.value,
                  slug: prev.slug || generateSlug(e.target.value),
                }))}
                placeholder="Ex: COAJUD — Coordenação de Atenção Judiciária"
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Slug <span className="text-destructive">*</span></label>
              <input
                type="text"
                value={formData.slug}
                onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                placeholder="Ex: coajud"
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
              <p className="text-xs text-muted-foreground">Apenas letras minúsculas, números e hífens</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="active"
                checked={formData.active}
                onChange={(e) => setFormData(prev => ({ ...prev, active: e.target.checked }))}
                className="h-4 w-4"
              />
              <label htmlFor="active" className="text-sm font-medium">Organização ativa</label>
            </div>
            {formError && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{formError}</p>
            )}
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} disabled={submitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Salvando..." : editingOrg ? "Salvar" : "Criar"}
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
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === "1"}
              onClick={() => setPage(String(Math.max(1, parseInt(page) - 1)))}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={parseInt(page) >= totalPages}
              onClick={() => setPage(String(Math.min(totalPages, parseInt(page) + 1)))}>
              Próxima
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
