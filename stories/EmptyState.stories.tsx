import type { Meta, StoryObj } from "@storybook/react";
import { EmptyState } from "@/components/backoffice/empty-state";
import { FileText, Users } from "lucide-react";

const meta: Meta<typeof EmptyState> = {
  title: "Backoffice/EmptyState",
  component: EmptyState,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {
  args: {
    title: "Nenhum resultado encontrado",
    description: "Tente ajustar os filtros ou criar um novo item.",
  },
};

export const WithIcon: Story = {
  args: {
    icon: <FileText className="h-12 w-12" />,
    title: "Nenhuma demanda encontrada",
    description: "Não há demandas cadastradas para os filtros selecionados.",
  },
};

export const WithAction: Story = {
  args: {
    icon: <Users className="h-12 w-12" />,
    title: "Nenhum usuário cadastrado",
    description: "Comece adicionando usuários ao sistema.",
    action: (
      <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm">
        Novo Usuário
      </button>
    ),
  },
};
