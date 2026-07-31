"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateUserSchema, CreateUserInput } from "@/lib/user-schemas";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/ui/form-input";
import { FormSelect } from "@/components/ui/form-select";
import { Loader2 } from "lucide-react";
import { apiPath } from "@/lib/url";
import { toast } from "sonner";

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
        const res = await fetch(apiPath("/api/organizations"));
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
          const res = await fetch(apiPath(`/api/users/${userId}`));
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
      const url = apiPath(isNew ? "/api/users" : `/api/users/${userId}`);

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        toast.success(isNew ? "Usuário criado com sucesso!" : "Usuário atualizado com sucesso!");
        router.push("/users");
        router.refresh();
      } else {
        const error = await res.json();
        const msg = error.error || "Erro ao salvar usuário";
        form.setError("root", { message: msg });
        toast.error(msg);
      }
    } catch (error) {
      const msg = "Não foi possível conectar ao servidor.";
      form.setError("root", { message: msg });
      toast.error(msg);
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
          <FormInput
            label="Nome"
            type="text"
            placeholder="Nome completo"
            registration={form.register("name")}
            error={form.formState.errors.name}
            helperText="Nome completo do usuário no sistema"
            required
          />

          {/* Email */}
          {isNew && (
            <FormInput
              label="Email"
              type="email"
              placeholder="email@exemplo.com"
              registration={form.register("email")}
              error={form.formState.errors.email}
              helperText="Email único para login. Não pode ser alterado depois de criado"
              required
            />
          )}

          {/* Role */}
          <FormSelect
            label="Função"
            registration={form.register("role")}
            error={form.formState.errors.role}
            helperText="Define o nível de permissão do usuário no sistema"
            required
            placeholder="Selecionar função..."
            options={[
              { value: "OPERATOR", label: "Operador - Acesso básico (ler)" },
              { value: "MANAGER", label: "Gerenciador - Acesso intermediário" },
              { value: "ADMIN", label: "Administrador - Acesso total" },
            ]}
          />

          {/* Organização */}
          <FormSelect
            label="Organização"
            registration={form.register("organizacaoId")}
            error={form.formState.errors.organizacaoId}
            helperText="Organização responsável. Deixe em branco se não aplicável"
            placeholder="Selecionar organização..."
            options={organizations.map((org) => ({
              value: org.id,
              label: org.name,
            }))}
          />

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
