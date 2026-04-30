import type { Meta, StoryObj } from "@storybook/react";
import { MetricCard } from "@/components/backoffice/metric-card";
import { Users, FileText, TrendingUp } from "lucide-react";

const meta: Meta<typeof MetricCard> = {
  title: "Backoffice/MetricCard",
  component: MetricCard,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="max-w-xs">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof MetricCard>;

export const Default: Story = {
  args: {
    title: "Total de Demandas",
    value: 1234,
    icon: <FileText className="h-6 w-6" />,
  },
};

export const WithPositiveTrend: Story = {
  args: {
    title: "Demandas Ativas",
    value: 892,
    icon: <TrendingUp className="h-6 w-6" />,
    trend: { value: 12, isPositive: true },
  },
};

export const WithNegativeTrend: Story = {
  args: {
    title: "Usuários Ativos",
    value: 47,
    icon: <Users className="h-6 w-6" />,
    trend: { value: 5, isPositive: false },
  },
};

export const Loading: Story = {
  args: {
    title: "Carregando...",
    value: 0,
    loading: true,
  },
};

export const AllCards: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4">
      <MetricCard title="Total" value={1234} icon={<FileText className="h-6 w-6" />} />
      <MetricCard title="Ativas" value={892} trend={{ value: 12, isPositive: true }} />
      <MetricCard title="Pendentes" value={156} trend={{ value: 3, isPositive: false }} />
      <MetricCard title="Resolvidas" value={186} loading />
    </div>
  ),
};
