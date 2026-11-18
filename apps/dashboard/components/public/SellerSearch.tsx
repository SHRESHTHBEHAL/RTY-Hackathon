"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { PunchDots } from "@/components/Button";
import { Input } from "@/components/Input";

/** Search box for the directory. Updates ?query= as you type; works as a plain form without JavaScript. */
export function SellerSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const path = usePathname();
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const q = value.trim();
      start(() => router.replace(q ? `${path}?query=${encodeURIComponent(q)}` : path, { scroll: false }));
    }, 220);
    return () => clearTimeout(t);
  }, [value, path, router]);

  return (
    <form role="search" action={path} onSubmit={(e) => e.preventDefault()} className="w-full max-w-md">
      <label htmlFor="seller-query" className="eyebrow mb-2 block">
        Search sellers and services
      </label>
      <Input
        id="seller-query"
        name="query"
        type="search"
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Try “messages”"
        prefix={<Search size={18} strokeWidth={1.75} aria-hidden />}
        suffix={pending ? <PunchDots /> : undefined}
      />
    </form>
  );
}
