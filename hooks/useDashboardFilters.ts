"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export interface DashboardFilters {
  startDate?: string;
  endDate?: string;
  status?: string;
  prioridade?: string;
  organizacaoId?: string;
}

export function useDashboardFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const filters: DashboardFilters = {
    startDate: searchParams.get("startDate") || undefined,
    endDate: searchParams.get("endDate") || undefined,
    status: searchParams.get("status") || undefined,
    prioridade: searchParams.get("prioridade") || undefined,
    organizacaoId: searchParams.get("organizacaoId") || undefined,
  };

  const updateFilters = useCallback(
    (newFilters: Partial<DashboardFilters>) => {
      const params = new URLSearchParams();

      const updatedFilters = { ...filters, ...newFilters };

      Object.entries(updatedFilters).forEach(([key, value]) => {
        if (value) {
          params.append(key, value);
        }
      });

      router.push(`?${params.toString()}`);
    },
    [filters, router]
  );

  const resetFilters = useCallback(() => {
    router.push("/dashboard");
  }, [router]);

  const setDateRange = useCallback(
    (startDate?: Date, endDate?: Date) => {
      updateFilters({
        startDate: startDate?.toISOString(),
        endDate: endDate?.toISOString(),
      });
    },
    [updateFilters]
  );

  return {
    filters,
    updateFilters,
    resetFilters,
    setDateRange,
  };
}
