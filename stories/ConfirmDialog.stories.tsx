import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/backoffice/confirm-dialog";

const meta: Meta<typeof ConfirmDialog> = {
  title: "Backoffice/ConfirmDialog",
  component: ConfirmDialog,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof ConfirmDialog>;

function ControlledDialog(props: any) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
        onClick={() => setOpen(true)}
      >
        Abrir Dialog
      </button>
      <ConfirmDialog
        {...props}
        open={open}
        onOpenChange={setOpen}
        onConfirm={() => setOpen(false)}
      />
    </div>
  );
}

export const Default: Story = {
  render: () => (
    <ControlledDialog
      title="Confirmar ação"
      description="Tem certeza que deseja realizar esta ação?"
    />
  ),
};

export const Destructive: Story = {
  render: () => (
    <ControlledDialog
      title="Deletar demanda"
      description="Esta ação não pode ser desfeita. O registro será permanentemente removido."
      actionLabel="Deletar"
      isDestructive
    />
  ),
};
