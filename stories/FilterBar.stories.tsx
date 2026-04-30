import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  FilterBar,
  FilterInput,
  FilterSelect,
  FilterDateRange,
} from "@/components/backoffice/filter-bar";

const meta: Meta<typeof FilterBar> = {
  title: "Backoffice/FilterBar",
  component: FilterBar,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof FilterBar>;

function FullFilterBar() {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const isActive = !!(busca || status || dataInicio || dataFim);

  return (
    <FilterBar
      isActive={isActive}
      onReset={isActive ? () => { setBusca(""); setStatus(""); setDataInicio(""); setDataFim(""); } : undefined}
    >
      <FilterInput
        label="Buscar"
        placeholder="Pesquisar..."
        value={busca}
        onChange={setBusca}
      />
      <FilterSelect
        label="Status"
        value={status}
        onChange={setStatus}
        options={[
          { value: "ATIVA", label: "Ativa" },
          { value: "RESOLVIDA", label: "Resolvida" },
          { value: "CANCELADA", label: "Cancelada" },
        ]}
      />
      <FilterDateRange
        label="Período"
        startDate={dataInicio}
        endDate={dataFim}
        onStartDateChange={setDataInicio}
        onEndDateChange={setDataFim}
      />
    </FilterBar>
  );
}

export const Default: Story = {
  render: () => <FullFilterBar />,
};

export const WithActiveFilters: Story = {
  render: () => (
    <FilterBar isActive onReset={() => {}}>
      <FilterInput label="Buscar" value="demanda" onChange={() => {}} />
      <FilterSelect
        label="Status"
        value="ATIVA"
        onChange={() => {}}
        options={[{ value: "ATIVA", label: "Ativa" }]}
      />
    </FilterBar>
  ),
};
