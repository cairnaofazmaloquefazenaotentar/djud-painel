import type { Meta, StoryObj } from "@storybook/react";
import { AuditLogTable } from "@/components/backoffice/audit-log-table";

const sampleLogs = Array.from({ length: 15 }, (_, i) => ({
  id: `log-${i + 1}`,
  userId: `user-${(i % 3) + 1}`,
  action: (["CREATE", "UPDATE", "DELETE", "READ"] as const)[i % 4],
  entity: (["Demanda", "User", "Organization"] as const)[i % 3],
  entityId: `entity-${i + 1}-abcdef1234567890`,
  changes: i % 2 === 0 ? { field: { before: "old", after: "new" } } : undefined,
  ipAddress: `192.168.1.${i + 1}`,
  createdAt: new Date(Date.now() - i * 3_600_000),
}));

const meta: Meta<typeof AuditLogTable> = {
  title: "Backoffice/AuditLogTable",
  component: AuditLogTable,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof AuditLogTable>;

export const Default: Story = {
  args: { data: sampleLogs },
};

export const Loading: Story = {
  args: { data: [], loading: true },
};

export const Empty: Story = {
  args: { data: [] },
};
