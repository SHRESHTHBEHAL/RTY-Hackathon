"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { useReduce } from "./useReduce";

export type TocItem = { id: string; label: string; group?: string };

/** Sticky section list that follows the reader's scroll position. */
export function DocsToc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState(items[0]?.id);
  const reduce = useReduce();

  useEffect(() => {
    const visible = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top);
          else visible.delete(e.target.id);
        }
        // The topmost section in the reading band wins.
        const first = items.find((i) => visible.has(i.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-96px 0px -60% 0px" },
    );
    for (const i of items) {
      const el = document.getElementById(i.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [items]);

  let lastGroup: string | undefined;
  return (
    <nav aria-label="On this page">
      <p className="eyebrow mb-3">On this page</p>
      <ul className="relative border-l border-line">
        {items.map((i) => {
          const showGroup = i.group && i.group !== lastGroup;
          lastGroup = i.group;
          const on = active === i.id;
          return (
            <li key={i.id}>
              {showGroup ? <p className="mb-1 mt-4 pl-4 text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft first:mt-0">{i.group}</p> : null}
              <a
                href={`#${i.id}`}
                aria-current={on ? "location" : undefined}
                className={cn(
                  "relative -ml-px flex min-h-9 items-center border-l-2 border-transparent pl-4 text-[15px] transition-colors duration-200",
                  on ? "font-medium text-ink" : "text-ink-soft hover-fine:text-ink",
                )}
              >
                {on ? (
                  <motion.span
                    layoutId="toc-marker"
                    aria-hidden
                    className="absolute -left-0.5 inset-y-1 w-0.5 rounded-full bg-pass"
                    transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.3 }}
                  />
                ) : null}
                {i.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
