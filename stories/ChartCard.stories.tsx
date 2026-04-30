import type { Meta, StoryObj } from "@storybook/react";
import { ChartCard } from "@/components/backoffice/chart-card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const sampleData = [
  { mes: "Jan", count: 12 },
  { mes: "Fev", count: 19 },
  { mes: "Mar", count: 8 },
  { mes: "Abr", count: 27 },
  { mes: "Mai", count: 14 },
  { mes: "Jun", count: 23 },
];

const meta: Meta<typeof ChartCard> = {
  title: "Backoffice/ChartCard",
  component: ChartCard,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof ChartCard>;

export const Default: Story = {
  args: {
    title: "Demandas por Mês",
    description: "Número de demandas criadas por mês",
    children: (
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={sampleData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="mes" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="count" fill="#10b981" />
        </BarChart>
      </ResponsiveContainer>
    ),
  },
};

export const WithActions: Story = {
  args: {
    title: "Evolução Mensal",
    description: "Últimos 6 meses",
    actions: (
      <button className="text-xs text-primary underline">Ver mais</button>
    ),
    children: (
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={sampleData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="mes" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="count" fill="#f59e0b" />
        </BarChart>
      </ResponsiveContainer>
    ),
  },
};
