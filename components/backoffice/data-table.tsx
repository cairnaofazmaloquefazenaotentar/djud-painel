"use client";

import React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  SortingState,
  getSortedRowModel,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "./empty-state";
import { motion, AnimatePresence } from "framer-motion";

interface DataTableProps<TData> {
  columns: ColumnDef<TData, any>[];
  data: TData[];
  pageSize?: number;
  loading?: boolean;
  onRowClick?: (row: TData) => void;
  renderEmptyState?: () => React.ReactNode;
}

// ── Spell: skeleton com shimmer sweep ──────────────────────────────────────────

function ShimmerSkeleton({ cols }: { cols: number; idx: number }) {
  return (
    <TableRow>
      {Array.from({ length: cols }).map((_, j) => (
        <TableCell key={j} className="px-4 py-3">
          <div className="relative overflow-hidden rounded-md">
            <Skeleton
              className="h-4 w-full"
              style={{ opacity: 0.6 + Math.random() * 0.4 }}
            />
            {/* Shimmer sweep */}
            <motion.div
              className="absolute inset-0 -translate-x-full"
              style={{
                background:
                  "linear-gradient(90deg, transparent, color-mix(in oklch, var(--card) 80%, white), transparent)",
              }}
              animate={{ translateX: ["−100%", "100%"] }}
              transition={{
                duration: 1.4,
                repeat: Infinity,
                ease: "linear",
                delay: j * 0.05,
              }}
            />
          </div>
        </TableCell>
      ))}
    </TableRow>
  );
}

export function DataTable<TData>({
  columns,
  data,
  pageSize = 10,
  loading,
  onRowClick,
  renderEmptyState,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { sorting },
    onSortingChange: setSorting,
    initialState: { pagination: { pageIndex: 0, pageSize } },
  });

  const rows = table.getRowModel().rows;
  const isEmpty = rows.length === 0 && !loading;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-muted/40 hover:bg-muted/40">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              // ── Spell: skeleton rows com shimmer ──────────────────────────
              Array.from({ length: pageSize }).map((_, i) => (
                <ShimmerSkeleton key={i} cols={columns.length} idx={i} />
              ))
            ) : isEmpty ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="px-4 py-12 text-center">
                  {renderEmptyState ? renderEmptyState() : (
                    <EmptyState title="Nenhum resultado encontrado" />
                  )}
                </TableCell>
              </TableRow>
            ) : (
              // ── Spell: rows com hover elevation ────────────────────────────
              <AnimatePresence>
                {rows.map((row, i) => (
                  <motion.tr
                    key={row.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: i * 0.02, duration: 0.18 }}
                    whileHover={{
                      backgroundColor:
                        "color-mix(in oklch, var(--muted) 60%, transparent)",
                      y: -1,
                    }}
                    className={`border-b border-border last:border-0 transition-colors ${
                      onRowClick ? "cursor-pointer" : ""
                    }`}
                    onClick={() => onRowClick?.(row.original)}
                    style={{ willChange: "transform, background-color" }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 text-sm align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </motion.tr>
                ))}
              </AnimatePresence>
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Paginação ──────────────────────────────────────────────────────── */}
      {!isEmpty && !loading && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">
            Página{" "}
            <span className="font-semibold text-foreground">
              {table.getState().pagination.pageIndex + 1}
            </span>{" "}
            de{" "}
            <span className="font-semibold text-foreground">
              {table.getPageCount()}
            </span>
          </p>
          <div className="flex gap-1">
            {[
              { icon: ChevronsLeft, fn: () => table.setPageIndex(0), disabled: !table.getCanPreviousPage() },
              { icon: ChevronLeft,  fn: () => table.previousPage(),   disabled: !table.getCanPreviousPage() },
              { icon: ChevronRight, fn: () => table.nextPage(),       disabled: !table.getCanNextPage() },
              { icon: ChevronsRight, fn: () => table.setPageIndex(table.getPageCount() - 1), disabled: !table.getCanNextPage() },
            ].map(({ icon: Icon, fn, disabled }, i) => (
              <Button
                key={i}
                variant="outline"
                size="sm"
                onClick={fn}
                disabled={disabled}
                className="h-7 w-7 p-0 transition-all hover:border-primary/40 hover:text-primary disabled:opacity-30"
              >
                <Icon className="h-3.5 w-3.5" />
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
