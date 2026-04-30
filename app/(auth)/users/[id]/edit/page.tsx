"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateUserSchema, CreateUserInput } from "@/lib/user-schemas";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface UserFormData {
  name?: string;
  email?: string;
  role?: "ADMIN" | "MANAGER" | "OPERATOR";
  organizacaoId?: string;
}

export default function EditUserPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;
  const isNew = userId === "new";

  const [loading, setLoading] = useState(!isNew);
  const [submitting, setSubmitting] = useState(false);
  const [organizations, setOrganizations] = useState<
    Array<{ id: string; name: string }>
  >([]);

  const form = useForm<UserFormData>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      role: "OPERATOR",
    },
  });

  useEffect(() => {
    const loadOrganizations = async () => {
      try {
        const res = await fetch("/api/organizations");
        if (res.ok) {
          const data = await res.json();
          setOrganizations(data.data || []);
        }
      } catch (error) {
        console.error("Erro ao carregar organizações:", error);
      }
    };

    loadOrganizations();

    if (!isNew) {
      const loadUser = async () => {
        try {
          const res = await fetch(`/api/users/${userId}`);
          if (res.ok) {
            const user = await res.json();
            form.reset({
              name: user.name || "",
              email: user.email || "",
              role: user.role,
              organizacaoId: user.organization?.id || "",
            });
          }
        } catch (error) {
          console.error("Erro ao carregar usuário:", error);
        } finally {
          setLoading(false);
        }
      };
      loadUser();
    }
  }, [userId, isNew, form]);

  const onSubmit = async (data: UserFormData) => {
    setSubmitting(true);
    try {
      const method = isNew ? "POST" : "PUT";
      const url = isNew ? "/api/users" : `/api/users/${userId}`;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        router.push("/users");
        router.refresh();
      } else {
        const error = await res.json();
        form.setError("root", { message: error.error || "Erro ao salvar usuário" });
      }
    } catch (error) {
      form.setError("root", { message: "Erro ao salvar usuário" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={isNew ? "Novo Usuário" : "Editar Usuário"}
        description={isNew ? "Criar um novo usuário no sistema" : "Editar informações do usuário"}
      />

      <div className="bg-card border border-border rounded-lg p-6 max-w-2xl">
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Nome */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Nome</label>
            <input
              type="text"
              placeholder="Nome completo"
              {...form.register("name")}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          {/* Email */}
          {isNew && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Email</label>
              <input
                type="email"
                placeholder="email@exemplo.com"
                {...form.register("email")}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {form.formState.errors.email && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>
          )}

          {/* Role */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Role</label>
            <select
              {...form.register("role")}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="OPERATOR">Operador</option>
              <option value="MANAGER">Gerenciador</option>
              <option value="ADMIN">Administrador</option>
            </select>
            {form.formState.errors.role && (
              <p className="text-sm text-destructive">
                {form.formState.errors.role.message}
              </p>
            )}
          </div>

          {/* Organização */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Organização</label>
            <select
              {...form.register("organizacaoId")}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Selecionar organização...</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>

          {/* Error */}
          {form.formState.errors.root && (
            <div className="p-3 bg-destructive/10 border border-destructive/50 rounded-md text-sm text-destructive">
              {form.formState.errors.root.message}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 justify-end pt-6 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isNew ? "Criar Usuário" : "Salvar Alterações"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
