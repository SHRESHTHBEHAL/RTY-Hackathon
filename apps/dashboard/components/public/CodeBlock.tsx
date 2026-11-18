import type { ReactNode } from "react";
import { CopyButton } from "@/components/CopyOnce";
import { cn } from "@/lib/cn";

type Lang = "ts" | "json" | "sh" | "http";

const KEYWORDS = new Set([
  "import",
  "from",
  "const",
  "let",
  "await",
  "async",
  "new",
  "return",
  "export",
  "function",
  "if",
  "else",
  "true",
  "false",
  "null",
]);

/**
 * A tiny highlighter: strings, comments, keywords and numbers. Enough for
 * the README snippets; no dependency, server-rendered.
 */
function highlight(code: string, lang: Lang): ReactNode[] {
  const out: ReactNode[] = [];
  const re =
    lang === "sh"
      ? /(#.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(--?[a-zA-Z][\w-]*)|(\\$)/gm
      : /(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_]\w*)\b/gm;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(code))) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const [text, comment, str, a, b] = m;
    let cls: string | null = null;
    if (comment) cls = "text-on-ink-soft italic";
    else if (str) cls = lang === "json" && code[m.index + text.length] === ":" ? "text-pass-bright" : "text-go-bright";
    else if (lang === "sh" && a) cls = "text-pass-bright";
    else if (lang !== "sh" && a) cls = "text-hold-bright";
    else if (lang !== "sh" && b && KEYWORDS.has(b)) cls = "text-pass-bright";
    out.push(
      cls ? (
        <span key={i++} className={cls}>
          {text}
        </span>
      ) : (
        text
      ),
    );
    last = m.index + text.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

export function CodeBlock({
  code,
  lang = "ts",
  title,
  className,
  copyLabel = "Copy code",
}: {
  code: string;
  lang?: Lang;
  /** File name or caption in the block's header. */
  title?: string;
  className?: string;
  copyLabel?: string;
}) {
  return (
    <figure className={cn("surface-ink overflow-hidden rounded-[14px] border border-ink-line", className)}>
      <figcaption className="flex h-12 items-center justify-between gap-3 border-b border-ink-line pl-4 pr-1.5">
        <span className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden className="flex gap-1.5">
            <span className="size-2 rounded-full bg-on-ink-soft/30" />
            <span className="size-2 rounded-full bg-on-ink-soft/30" />
            <span className="size-2 rounded-full bg-on-ink-soft/30" />
          </span>
          {title ? <span className="truncate font-mono text-xs text-on-ink-soft">{title}</span> : null}
        </span>
        <CopyButton value={code} label={copyLabel} showText onInk />
      </figcaption>
      <pre className="overflow-x-auto p-4 text-[13px] leading-[1.7] sm:p-5 sm:text-sm">
        <code className="font-mono text-on-ink">{highlight(code, lang)}</code>
      </pre>
    </figure>
  );
}
