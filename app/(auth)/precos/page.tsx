"use client";

import { PageHeader } from "@/components/layout/page-header";
import { PrecosView } from "@/components/dashboard/precos-view";

export default function PrecosPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Preços de Medicamentos"
        description="Comparativo dos preços praticados em compras públicas (base ComprasGov 2018–2025) — compras judiciais vs. administrativas, por medicamento e unidade de fornecimento"
      />
      <PrecosView />
    </div>
  );
}
