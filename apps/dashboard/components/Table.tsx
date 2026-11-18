"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ErrorState } from "./ErrorState";
import { Skeleton } from "./Skeleton";
import { DUR, EASE_OUT } from "./motion-tokens";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Right-aligned mono with tabular figures: for amounts. */
  numeric?: boolean;
  align?: "left" | "right" | "center";
  /** Hide on narrow screens to avoid sideways scrolling. */
  hideBelow?: "sm" | "md";
  /** CSS width, e.g. "30%" or "120px". */
  width?: string;
  className?: string;
};

export type TableProps<T> = {
  columns: Column<T>[];
  rows: T[] | null | undefined;
  getRowId: (row: T) => string;
  /** Visible caption is optional; a label is required for screen readers. */
  label: string;
  caption?: ReactNode;
  loading?: boolean;
  skeletonRows?: number;
  /** When set, the table shows ErrorState with retry instead of rows. */
  error?: ReactNode;
  onRetry?: () => unknown;
  /** Shown when rows is an empty array. Usually an EmptyState. */
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  /** Rows that arrive after first render slide in from the top and push others down. */
  animateNewRows?: boolean;
  dense?: boolean;
  className?: string;
};

const hide = { sm: "hidden sm:table-cell", md: "hidden md:table-cell" } as const;

export function Table<T>({
  columns,
  rows,
  getRowId,
  label,
  caption,
  loading,
  skeletonRows = 5,
  error,
  onRetry,
  empty,
  onRowClick,
  animateNewRows = true,
  dense,
  className,
}: TableProps<T>) {
  const reduce = useReducedMotion();
  const seen = useRef<Set<string> | null>(null);
  const ready = !loading && !error && rows;
  // Remember which rows existed at first data render; only later arrivals animate.
  if (ready && seen.current === null) seen.current = new Set(rows.map(getRowId));
  useEffect(() => {
    if (ready && seen.current) for (const r of rows) seen.current.add(getRowId(r));
  });

  const cellPad = dense ? "px-4 py-2.5" : "px-4 py-3.5 sm:px-5";
  const alignOf = (c: Column<T>) => (c.numeric ? "text-right" : c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left");

  return (
    <div className={cn("overflow-hidden rounded-[14px] border border-line bg-card", className)}>
      {error ? (
        <ErrorState size="compact" message={error} onRetry={onRetry} />
      ) : rows && rows.length === 0 && !loading ? (
        empty ?? <p className="px-5 py-10 text-center text-ink-soft">Nothing here yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[15px]" aria-label={label} aria-busy={loading || undefined}>
            {caption ? <caption className="px-5 pt-4 text-left text-sm text-ink-soft">{caption}</caption> : null}
            <thead>
              <tr className="border-b border-line">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    style={c.width ? { width: c.width } : undefined}
                    className={cn("eyebrow whitespace-nowrap bg-paper/50", cellPad, "py-3!", alignOf(c), c.hideBelow && hide[c.hideBelow], c.className)}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading || !rows ? (
                Array.from({ length: skeletonRows }, (_, i) => (
                  <tr key={`sk${i}`} className="border-b border-line last:border-0">
                    {columns.map((c, j) => (
                      <td key={c.key} className={cn(cellPad, c.hideBelow && hide[c.hideBelow])}>
                        <Skeleton className={cn(c.numeric ? "ml-auto w-16" : j === 0 ? "w-32" : "w-24")} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <AnimatePresence initial={false}>
                  {rows.map((row) => {
                    const id = getRowId(row);
                    const isNew = animateNewRows && seen.current !== null && !seen.current.has(id);
                    return (
                      <motion.tr
                        key={id}
                        layout={animateNewRows && !reduce ? "position" : false}
                        initial={isNew ? (reduce ? { opacity: 0 } : { opacity: 0, y: -10 }) : false}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, transition: { duration: DUR.standard * 0.6 } }}
                        transition={{ duration: DUR.standard, ease: EASE_OUT }}
                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                        className={cn(
                          "border-b border-line last:border-0",
                          onRowClick && "cursor-pointer transition-colors duration-[var(--dur-quick)] hover-fine:bg-paper/70",
                        )}
                      >
                        {columns.map((c) => (
                          <td
                            key={c.key}
                            className={cn(
                              cellPad,
                              alignOf(c),
                              c.numeric && "whitespace-nowrap font-mono tabular text-[14px]",
                              c.hideBelow && hide[c.hideBelow],
                              c.className,
                            )}
                          >
                            {c.cell(row)}
                          </td>
                        ))}
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
