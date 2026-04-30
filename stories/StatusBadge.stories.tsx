import type { Meta, StoryObj } from "@storybook/react";
import { StatusBadge } from "@/components/backoffice/status-badge";

const meta: Meta<typeof StatusBadge> = {
  title: "Backoffice/StatusBadge",
  component: StatusBadge,
  tags: ["autodocs"],
  argTypes: {
    status: {
      control: "select",
      options: ["active", "inactive", "pending", "error", "warning"],
    },
  },
};
export default meta;

type Story = StoryObj<typeof StatusBadge>;

export const Active: Story = {
  args: { status: "active", children: "Ativo" },
};

export const Inactive: Story = {
  args: { status: "inactive", children: "Inativo" },
};

export const Pending: Story = {
  args: { status: "pending", children: "Pendente" },
};

export const Error: Story = {
  args: { status: "error", children: "Erro" },
};

export const Warning: Story = {
  args: { status: "warning", children: "Atenção" },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadge status="active">Ativo</StatusBadge>
      <StatusBadge status="inactive">Inativo</StatusBadge>
      <StatusBadge status="pending">Pendente</StatusBadge>
      <StatusBadge status="error">Erro</StatusBadge>
      <StatusBadge status="warning">Atenção</StatusBadge>
    </div>
  ),
};
