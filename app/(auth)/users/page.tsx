"use client";

import { useEffect, useState } from "react";
import { useQueryState } from "nuqs";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/layout/page-header";
import {
  DataTable,
  FilterBar,
  FilterInput,
  FilterSelect,
  StatusBadge,
  ConfirmDialog,
  EmptyState,
} from "@/components/backoffice";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Edit2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  name: string | null;
  email: string | null;
  role: "ADMIN" | "MANAGER" | "OPERATOR";
  image: string | null;
  createdAt: Date;
  organization: { id: string; name: string } | null;
}

const roleColors: Record<string, "active" | "warning" | "error"> = {
  ADMIN: "error",
  MANAGER: "warning",
  OPERATOR: "active",
};

const roleLabels: Record<string, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gerenciador",
  OPERATOR: "Operador",
};

export default function UsersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    userId?: string;
    userName?: string;
  }>({ open: false });

  // Filtros
  const [page, setPage] = useQueryState("page", { defaultValue: "1" });
  const [busca, setBusca] = useQueryState("busca", { defaultValue: "" });
  const [role, setRole] = useQueryState("role", { defaultValue: "" });

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.append("page", page);
        params.append("pageSize", "10");
        if (busca) params.append("busca", busca);
        if (role) params.append("role", role);

        const res = await fetch(`/api/users?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setUsers(data.data);
          setTotal(data.pagination.total);
        }
      } catch (error) {
        console.error("Erro ao carregar usuários:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [page, busca, role]);

  const handleDelete = async () => {
    if (!deleteDialog.userId) return;

    try {
      const res = await fetch(`/api/users/${deleteDialog.userId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setUsers(users.filter((u) => u.id !== deleteDialog.userId));
        setDeleteDialog({ open: false });
      }
    } catch (error) {
      console.error("Erro ao deletar usuário:", error);
    }
  };

  const columns: ColumnDef<User>[] = [
    {
      accessorKey: "name",
      header: "Nome",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.name}</p>
          <p className="text-xs text-muted-foreground">{row.original.email}</p>
        </div>
      ),
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => (
        <StatusBadge status={roleColors[row.original.role]}>
          {roleLabels[row.original.role]}
        </StatusBadge>
      ),
    },
    {
      accessorKey: "organization",
      header: "Organização",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.organization?.name || "-"}
        </span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Criado em",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.createdAt).toLocaleDateString("pt-BR")}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Ações",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              router.push(`/users/${row.original.id}/edit`)
            }
            className="h-8 px-2"
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setDeleteDialog({
                open: true,
                userId: row.original.id,
                userName: row.original.name || "",
              })
            }
            className="h-8 px-2 text-destructive hover:text-destructive/90"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const isFiltered = busca || role;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Usuários"
        description="Gestão de usuários e permissões"
        actions={
          <Button onClick={() => router.push("/users/new")}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Usuário
          </Button>
        }
      />

      <FilterBar
        onReset={isFiltered ? () => { setBusca(""); setRole(""); } : undefined}
        isActive={!!isFiltered}
      >
        <FilterInput
          label="Buscar"
          placeholder="Nome ou email..."
          value={busca}
          onChange={setBusca}
        />
        <FilterSelect
          label="Role"
          value={role}
          onChange={setRole}
          options={[
            { value: "ADMIN", label: "Administrador" },
            { value: "MANAGER", label: "Gerenciador" },
            { value: "OPERATOR", label: "Operador" },
          ]}
        />
      </FilterBar>

      <DataTable<User>
        columns={columns}
        data={users}
        loading={loading}
        pageSize={10}
        renderEmptyState={() => (
          <EmptyState
            title="Nenhum usuário encontrado"
            description="Comece adicionando um novo usuário ao sistema"
            action={
              <Button onClick={() => router.push("/users/new")}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Usuário
              </Button>
            }
          />
        )}
      />

      <ConfirmDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}
        title="Deletar usuário"
        description={`Tem certeza que deseja deletar o usuário "${deleteDialog.userName}"? Esta ação não pode ser desfeita.`}
        actionLabel="Deletar"
        isDestructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
