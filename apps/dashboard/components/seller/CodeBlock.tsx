import { CopyButton } from "@/components/CopyOnce";

const KEYWORDS = new Set(["import", "from", "const", "new", "await", "async", "return", "export"]);
const TOKEN = /(\/\/[^\n]*)|("(?:[^"\\]|\\.)*")|(\b[A-Za-z_$][\w$]*\b)|(\b\d[\d_.]*\b)|([\s\S])/g;

type Tok = { kind: "comment" | "string" | "keyword" | "fn" | "number" | "plain"; text: string };

/** A tiny tokenizer, enough to tint TypeScript snippets with the system's colours. */
function tokenize(code: string): Tok[] {
  const out: Tok[] = [];
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(code))) {
    const [text, comment, str, word, num] = m;
    if (comment) out.push({ kind: "comment", text });
    else if (str) out.push({ kind: "string", text });
    else if (word) {
      const next = code[TOKEN.lastIndex];
      out.push({ kind: KEYWORDS.has(word) ? "keyword" : next === "(" ? "fn" : /^[A-Z]/.test(word) ? "fn" : "plain", text });
    } else if (num) out.push({ kind: "number", text });
    else out.push({ kind: "plain", text });
  }
  return out;
}

const TINT: Record<Tok["kind"], string> = {
  comment: "text-on-ink-soft italic",
  string: "text-go-bright",
  keyword: "text-pass-bright",
  fn: "text-hold-bright",
  number: "text-hold-bright",
  plain: "text-on-ink",
};

/** Code on an ink surface. Copy sits in the header; the code scrolls inside the block, never the page. */
export function CodeBlock({ code, label, testId }: { code: string; label: string; testId?: string }) {
  const toks = tokenize(code);
  return (
    <div className="overflow-hidden rounded-[14px] border border-ink-line bg-ink text-on-ink">
      <div className="flex items-center justify-between border-b border-ink-line px-4 py-1">
        <span className="eyebrow text-on-ink-soft!">{label}</span>
        <CopyButton value={code} label="Copy snippet" showText onInk />
      </div>
      <pre tabIndex={0} data-testid={testId} className="overflow-x-auto px-4 py-4 font-mono text-[13px] leading-[1.7] outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-pass-bright sm:text-[14px]">
        <code>
          {toks.map((t, i) => (
            <span key={i} className={TINT[t.kind]}>
              {t.text}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
