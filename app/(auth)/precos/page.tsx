"use client";

import { PageHeader } from "@/components/layout/page-header";
import { PrecosTabs } from "@/components/dashboard/precos-tabs";

export default function PrecosPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Preços de Medicamentos"
        description="Comparativos de preços de medicamentos — ComprasGov (preços praticados em compras públicas 2018–2025, judiciais vs. administrativas) e SISMAT × PMVG (preço pago vs. teto regulatório vigente na data de entrega)"
      />
      <PrecosTabs />
    </div>
  );
}
