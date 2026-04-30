import type { Meta, StoryObj } from "@storybook/react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/backoffice/data-table";
import { StatusBadge } from "@/components/backoffice/status-badge";

interface SampleRow {
  id: string;
  numero: string;
  titulo: string;
  status: "active" | "inactive" | "pending" | "error" | "warning";
  prioridade: string;
}

const columns: ColumnDef<SampleRow>[] = [
  { accessorKey: "numero", header: "Número" },
  { accessorKey: "titulo", header: "Título" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <StatusBadge status={row.original.status}>{row.original.status}</StatusBadge>
    ),
  },
  { accessorKey: "prioridade", header: "Prioridade" },
];

const sampleData: SampleRow[] = Array.from({ length: 25 }, (_, i) => ({
  id: `id-${i + 1}`,
  numero: `DEM-${String(i + 1).padStart(4, "0")}`,
  titulo: `Demanda de exemplo número ${i + 1}`,
  status: (["active", "pending", "warning", "error", "inactive"] as const)[i % 5],
  prioridade: (["ALTA", "MEDIA", "BAIXA", "CRITICA"] as const)[i % 4],
}));

const meta: Meta<typeof DataTable<SampleRow>> = {
  title: "Backoffice/DataTable",
  component: DataTable,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof DataTable<SampleRow>>;

export const Default: Story = {
  render: () => <DataTable columns={columns} data={sampleData} />,
};

export const Loading: Story = {
  render: () => <DataTable columns={columns} data={[]} loading pageSize={5} />,
};

export const Empty: Story = {
  render: () => <DataTable columns={columns} data={[]} />,
};

export const SmallPageSize: Story = {
  render: () => <DataTable columns={columns} data={sampleData} pageSize={5} />,
};
