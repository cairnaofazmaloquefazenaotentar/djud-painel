"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PrecosView } from "@/components/dashboard/precos-view";
import { PmvgView } from "@/components/dashboard/pmvg-view";

// ─────────────────────────────────────────────────────────────────────────────
// Sub-abas da página Preços: "ComprasGov" (preços praticados em compras
// públicas) ao lado de "PMVG" (pago no SISMAT vs. teto PMVG na data de entrega).
// Aba controlada por useState — cada view mantém o próprio estado ao alternar.
// ─────────────────────────────────────────────────────────────────────────────

export function PrecosTabs() {
  const [tab, setTab] = useState<"comprasgov" | "pmvg">("comprasgov");

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "comprasgov" | "pmvg")}>
      <TabsList>
        <TabsTrigger value="comprasgov">ComprasGov</TabsTrigger>
        <TabsTrigger value="pmvg">PMVG</TabsTrigger>
      </TabsList>
      <TabsContent value="comprasgov" className="mt-6">
        <PrecosView />
      </TabsContent>
      <TabsContent value="pmvg" className="mt-6">
        <PmvgView />
      </TabsContent>
    </Tabs>
  );
}
