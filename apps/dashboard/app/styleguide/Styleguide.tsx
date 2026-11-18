"use client";

import { Bot, Copy, Inbox, LogOut, Pencil, Plus, RefreshCw, Send, Trash2, Wallet } from "lucide-react";
import { useRef, useState } from "react";
import { Badge, StatusBadge, TestModeBadge } from "@/components/Badge";
import { Button, ButtonLink, useSuccessFlash } from "@/components/Button";
import { Card } from "@/components/Card";
import { CopyButton, CopyOnce } from "@/components/CopyOnce";
import { Dialog } from "@/components/Dialog";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { Field } from "@/components/Field";
import { GateLane, type GateLaneHandle } from "@/components/GateLane";
import { Guilloche } from "@/components/Guilloche";
import { Input } from "@/components/Input";
import { GateMark, Logo } from "@/components/Logo";
import { Money } from "@/components/Money";
import { PageHeader } from "@/components/PageHeader";
import { Menu, Popover } from "@/components/Popover";
import { Punches } from "@/components/Punches";
import { RollingNumber } from "@/components/RollingNumber";
import { SectionReveal } from "@/components/SectionReveal";
import { Skeleton, SkeletonText } from "@/components/Skeleton";
import { Table, type Column } from "@/components/Table";
import { TicketCard } from "@/components/TicketCard";
import { toast } from "@/components/Toast";
import { formatDateTime, formatUsd, shortId } from "@/lib/format";
import { cn } from "@/lib/cn";

const SECTIONS = [
  ["tokens", "Tokens"],
  ["gate-lane", "Gate lane"],
  ["buttons", "Buttons"],
  ["fields", "Fields"],
  ["money", "Money"],
  ["rolling", "Rolling number"],
  ["tickets", "Tickets and cards"],
  ["badges", "Badges"],
  ["table", "Table"],
  ["overlays", "Dialog and menus"],
  ["states", "Empty, error, loading"],
  ["copy-once", "Copy once"],
  ["texture", "Guilloche"],
  ["layout", "Page header and reveal"],
  ["toast", "Toast"],
  ["shells", "Shells"],
] as const;

export function Styleguide() {
  return (
    <div className="min-h-dvh">
      <header className="surface-ink relative overflow-hidden">
        <Guilloche size={900} opacity={0.08} className="absolute -right-60 -top-80 text-on-ink-soft" />
        <div className="relative mx-auto max-w-[1280px] px-4 py-10 sm:px-8 sm:py-14">
          <Logo onInk />
          <p className="eyebrow mt-10 text-on-ink-soft!">Fare Gate design system</p>
          <h1 className="font-display mt-3 text-[48px] text-on-ink sm:text-4xl">Components</h1>
          <p className="mt-4 max-w-2xl text-[17px] text-on-ink-soft">
            Every shared component in each of its states. Build screens from these; extend them in the same spirit when something is missing. The rules
            live in apps/dashboard/DESIGN.md.
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1280px] gap-10 px-4 py-10 sm:px-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Sections" className="hidden lg:block">
          <ul className="sticky top-8 flex flex-col gap-0.5">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="block rounded-[8px] px-3 py-2 text-sm font-medium text-ink-soft hover-fine:bg-ink/5 hover-fine:text-ink">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex min-w-0 flex-col gap-16">
          <TokensSection />
          <GateLaneSection />
          <ButtonsSection />
          <FieldsSection />
          <MoneySection />
          <RollingSection />
          <TicketsSection />
          <BadgesSection />
          <TableSection />
          <OverlaysSection />
          <StatesSection />
          <CopyOnceSection />
          <TextureSection />
          <LayoutSection />
          <ToastSection />
          <ShellsSection />
        </div>
      </div>
    </div>
  );
}

function Section({ id, title, file, children, note }: { id: string; title: string; file?: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-8">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-3">
        <h2 id={`${id}-h`} className="font-display text-2xl text-ink">
          {title}
        </h2>
        {file ? <code className="font-mono text-xs text-ink-soft">{file}</code> : null}
      </div>
      {note ? <p className="-mt-1 mb-5 max-w-3xl text-[15px] text-ink-soft">{note}</p> : null}
      {children}
    </section>
  );
}

function Demo({ label, children, className, ink }: { label?: string; children: React.ReactNode; className?: string; ink?: boolean }) {
  return (
    <div className={cn("rounded-[14px] border p-5", ink ? "surface-ink border-ink-line" : "border-line bg-card", className)}>
      {label ? <p className={cn("eyebrow mb-4", ink && "text-on-ink-soft!")}>{label}</p> : null}
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- */

const COLORS: Array<[string, string, string]> = [
  ["paper", "#EEF2EA", "bg-paper"],
  ["card", "#FBFCF8", "bg-card"],
  ["ink", "#0B1F24", "bg-ink"],
  ["ink-soft", "#4A5F63", "bg-ink-soft"],
  ["pass", "#2F4BFF", "bg-pass"],
  ["go", "#12A66A", "bg-go"],
  ["go-bright", "#3DDC97", "bg-go-bright"],
  ["stop", "#E8452A", "bg-stop"],
  ["hold", "#B97800", "bg-hold"],
  ["hold-bright", "#FFB020", "bg-hold-bright"],
  ["go-text", "#0B7A4C", "bg-go-text"],
  ["stop-text", "#B8321B", "bg-stop-text"],
  ["hold-text", "#8A5A00", "bg-hold-text"],
  ["pass-bright", "#8B9CFF", "bg-pass-bright"],
];

function TokensSection() {
  return (
    <Section
      id="tokens"
      title="Tokens"
      file="app/globals.css"
      note="Colours are CSS variables mapped into Tailwind (bg-pass, text-ink-soft, border-line). The -text variants are the small-text versions of go, stop and hold on paper; the base colours are for icons, fills and large type."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {COLORS.map(([name, hex, cls]) => (
          <div key={name} className="overflow-hidden rounded-[10px] border border-line bg-card">
            <div className={cn("h-14", cls)} />
            <div className="px-3 py-2">
              <p className="text-sm font-semibold">{name}</p>
              <p className="font-mono text-xs text-ink-soft">{hex}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Demo label="Type">
          <p className="font-display text-4xl">Departures</p>
          <p className="mt-3 text-lg font-semibold">Onest 18 semibold: what people read and click</p>
          <p className="mt-1 text-base">Onest 16 regular, line height 1.55, for body copy and descriptions.</p>
          <p className="mt-2 font-mono text-sm text-ink-soft">JetBrains Mono · wal_k2j8x0c1m3n5p7q9r2s4t6v8 · $1,234.56</p>
          <p className="eyebrow mt-3">Eyebrow label · Onest 12 semibold uppercase</p>
        </Demo>
        <Demo label="Motion">
          <ul className="space-y-1.5 font-mono text-[13px] text-ink-soft">
            <li>--ease-out cubic-bezier(0.23, 1, 0.32, 1)</li>
            <li>--ease-in-out cubic-bezier(0.77, 0, 0.175, 1)</li>
            <li>quick 120ms · standard 200ms · slow 320ms</li>
            <li>SPRING {"{ bounce: 0, duration: 0.4 }"}</li>
            <li>SPRING_LANDING {"{ bounce: 0.2, duration: 0.45 }"}</li>
            <li>components/motion-tokens.ts</li>
          </ul>
        </Demo>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- */

const CENT = 10_000n;

function GateLaneSection() {
  const lane = useRef<GateLaneHandle>(null);
  const big = useRef<GateLaneHandle>(null);
  const [pass, setPass] = useState(50_000_000n);
  const [owed, setOwed] = useState(380_000n);
  const [log, setLog] = useState<string[]>([]);

  const approve = (handle: React.RefObject<GateLaneHandle | null>) => {
    if (pass < CENT) {
      void handle.current?.refuse("Not enough balance", { amountMicros: CENT.toString() });
      return;
    }
    setPass((p) => p - CENT);
    setOwed((o) => o + CENT);
    void handle.current?.approve({ amountMicros: CENT.toString() }).then(() => setLog((l) => [`Approved ${formatUsd(CENT)}`, ...l].slice(0, 4)));
  };
  const refuse = (handle: React.RefObject<GateLaneHandle | null>, reason = "Not enough balance") => {
    void handle.current?.refuse(reason, { amountMicros: "75000000" }).then(() => setLog((l) => [`Refused: ${reason}`, ...l].slice(0, 4)));
  };
  const burst = (handle: React.RefObject<GateLaneHandle | null>) => {
    [0, 180, 360].forEach((ms, i) => setTimeout(() => (i === 2 ? refuse(handle, "Above per-payment limit") : approve(handle)), ms));
  };

  return (
    <Section
      id="gate-lane"
      title="Gate lane"
      file="components/GateLane.tsx"
      note="The signature. Drive it with real events through the ref (approve, refuse, clear) or the journeys prop. Tokens are independent, so several can be in flight; Clear stops them mid-move. Balances are props: the seller's new balance is held back until the token carrying it lands. Turn on reduced motion in your OS to see the still version."
    >
      <div className="surface-ink rounded-[18px] p-5 sm:p-8">
        <GateLane ref={lane} pass={{ name: "Scout", balanceMicros: pass.toString(), id: "wal_k2j8x0c1m3n5p7q9r2s4t6v8" }} seller={{ name: "Relay", balanceMicros: owed.toString() }} />
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => approve(lane)} icon={<Send size={18} strokeWidth={1.75} aria-hidden />}>
            Approved payment
          </Button>
          <Button variant="secondary" onInk onClick={() => refuse(lane)}>
            Refused payment
          </Button>
          <Button variant="secondary" onInk onClick={() => burst(lane)}>
            Three at once
          </Button>
          <Button variant="ghost" onInk onClick={() => lane.current?.clear()}>
            Clear lane
          </Button>
          <Button variant="ghost" onInk onClick={() => setPass(0n)}>
            Empty the pass
          </Button>
        </div>
        <p className="mt-4 min-h-6 font-mono text-[13px] text-on-ink-soft" aria-live="polite">
          {log.join("  ·  ")}
        </p>
      </div>
      <div className="surface-ink mt-6 rounded-[18px] p-5 sm:p-8">
        <p className="eyebrow mb-4 text-on-ink-soft!">size=&quot;lg&quot;, for /demo (read from the back of a room)</p>
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <GateLane ref={big} size="lg" pass={{ name: "Buyer", balanceMicros: pass.toString(), id: "wal_b3x9p2m7k1q8r4t6v0n5c2z1" }} seller={{ name: "Relay", balanceMicros: owed.toString() }} />
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => approve(big)}>Approved payment</Button>
          <Button variant="secondary" onInk onClick={() => refuse(big)}>
            Refused payment
          </Button>
        </div>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- */

function ButtonsSection() {
  const [loading, setLoading] = useState(false);
  const [ok, flash] = useSuccessFlash();
  return (
    <Section id="buttons" title="Buttons" file="components/Button.tsx" note="44px tall, 10px radius, press scale 0.97. Loading blocks repeat clicks (one request per double-click). Success shows a check for 1.2 seconds.">
      <div className="grid gap-4 lg:grid-cols-2">
        <Demo label="Variants">
          <div className="flex flex-wrap gap-2">
            <Button icon={<Plus size={18} strokeWidth={2} aria-hidden />}>Create agent</Button>
            <Button variant="secondary">Take money back</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="danger" icon={<Trash2 size={18} strokeWidth={1.75} aria-hidden />}>
              Revoke key
            </Button>
          </div>
        </Demo>
        <Demo label="States">
          <div className="flex flex-wrap gap-2">
            <Button loading>Top up</Button>
            <Button disabled>Add money</Button>
            <Button
              loading={loading}
              success={ok}
              onClick={() => {
                setLoading(true);
                setTimeout(() => {
                  setLoading(false);
                  flash();
                }, 900);
              }}
            >
              Add money
            </Button>
            <Button size="lg">Large</Button>
          </div>
          <p className="mt-3 text-sm text-ink-soft">The third button runs loading then success.</p>
        </Demo>
        <Demo label="On ink" ink>
          <div className="flex flex-wrap gap-2">
            <Button>Run agent</Button>
            <Button variant="secondary" onInk>
              Secondary
            </Button>
            <Button variant="ghost" onInk>
              Ghost
            </Button>
          </div>
        </Demo>
        <Demo label="As a link">
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/signup">Sign up</ButtonLink>
            <ButtonLink href="/login" variant="secondary">
              Log in
            </ButtonLink>
          </div>
        </Demo>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- */

function FieldsSection() {
  const [err, setErr] = useState<string | null>(null);
  const [k, setK] = useState(0);
  return (
    <Section id="fields" title="Fields" file="components/Field.tsx, components/Input.tsx" note="Every input has a visible label. An error shakes the field once (3 oscillations, 8px, 320ms), turns the border stop, and appears below.">
      <div className="grid gap-4 lg:grid-cols-2">
        <Demo label="Default and helper">
          <div className="flex flex-col gap-5">
            <Field label="Agent name" helper="People see this name in the activity feed.">
              <Input placeholder="Scout" />
            </Field>
            <Field label="Amount" helper="Up to six decimals.">
              <Input prefix="$" mono inputMode="decimal" placeholder="0.00" suffix="USD" />
            </Field>
          </div>
        </Demo>
        <Demo label="Error">
          <div className="flex flex-col gap-5">
            <Field label="Amount to add" error={err} errorKey={k}>
              <Input prefix="$" mono defaultValue="500.00" />
            </Field>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setErr("Not enough unallocated balance. Top up first.");
                  setK((n) => n + 1);
                }}
              >
                Show error
              </Button>
              <Button variant="ghost" onClick={() => setErr(null)}>
                Clear
              </Button>
            </div>
          </div>
        </Demo>
        <Demo label="Password, optional, disabled, read-only">
          <div className="flex flex-col gap-5">
            <Field label="Password">
              <Input type="password" revealable defaultValue="correct horse" />
            </Field>
            <Field label="Label" optional>
              <Input placeholder="Production server" />
            </Field>
            <Field label="Disabled">
              <Input disabled defaultValue="Cannot change" />
            </Field>
            <Field label="Wallet ID">
              <Input readOnly mono defaultValue="wal_k2j8x0c1m3n5p7q9r2s4t6v8" />
            </Field>
          </div>
        </Demo>
        <Demo label="On ink" ink>
          <Field label="Email" onInk helper="Ink fields are for the demo screen only.">
            <Input onInk placeholder="you@company.com" />
          </Field>
        </Demo>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- */

function MoneySection() {
  return (
    <Section id="money" title="Money" file="components/Money.tsx" note="Dollars in Display with cents smaller and raised; in tables, mono with tabular figures. Under one cent shows up to six decimals. Exact with bigint for any size.">
      <div className="grid gap-4 lg:grid-cols-2">
        <Demo label="Display sizes">
          <div className="flex flex-col gap-4">
            <Money micros="1234560000" size="2xl" />
            <Money micros="50000000" size="xl" />
            <Money micros="20000000" size="lg" />
            <div className="flex items-end gap-6">
              <Money micros="10000" size="md" />
              <Money micros="500" size="sm" />
              <Money micros="-2500000" size="sm" className="text-stop-text" />
            </div>
          </div>
        </Demo>
        <Demo label="Mono and text">
          <div className="space-y-2 text-[15px]">
            <p className="flex justify-between">
              <span>One cent</span> <Money micros="10000" variant="mono" />
            </p>
            <p className="flex justify-between">
              <span>Half a tenth of a cent</span> <Money micros="500" variant="mono" />
            </p>
            <p className="flex justify-between">
              <span>Charge, signed</span> <Money micros="-10000" variant="mono" className="text-ink-soft" />
            </p>
            <p className="flex justify-between">
              <span>Top-up, signed</span> <Money micros="100000000" variant="mono" signed className="text-go-text" />
            </p>
            <p className="flex justify-between gap-4">
              <span>Very large</span> <Money micros="98765432109876543210" variant="mono" className="truncate" />
            </p>
            <p className="pt-2 text-ink-soft">
              In a sentence: Scout paid Relay <Money micros="10000" variant="text" className="font-semibold text-ink" />.
            </p>
          </div>
        </Demo>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- */

function RollingSection() {
  const [v, setV] = useState(1_234_560_000n);
  const change = () => {
    const r = BigInt(Math.floor(Math.random() * 9_000_000_000)) + 10_000n;
    setV(r - (r % 10_000n));
  };
  return (
    <Section id="rolling" title="Rolling number" file="components/RollingNumber.tsx" note="Departure-board digits: each digit rolls on its own strip, 30ms apart from the right, fixed width so nothing shifts. Under reduced motion it cross-fades. Money uses it with rolling.">
      <Demo>
        <div className="flex flex-col gap-6">
          <Money micros={v} rolling size="2xl" />
          <RollingNumber value={formatUsd(v)} className="font-mono text-2xl" />
          <div className="flex flex-wrap gap-2">
            <Button onClick={change} icon={<RefreshCw size={18} strokeWidth={1.75} aria-hidden />}>
              Change value
            </Button>
            <Button variant="secondary" onClick={() => setV((x) => x + 10_000n)}>
              Add one cent
            </Button>
            <Button variant="secondary" onClick={() => setV((x) => x * 10n)}>
              Times ten
            </Button>
            <Button variant="ghost" onClick={() => setV(0n)}>
              Zero
            </Button>
          </div>
        </div>
      </Demo>
    </Section>
  );
}

/* ---------------------------------------------------------------- */

function TicketsSection() {
  const [used, setUsed] = useState(3);
  return (
    <Section id="tickets" title="Tickets and cards" file="components/TicketCard.tsx, components/Card.tsx, components/Punches.tsx" note="Wallets and credentials are tickets: notches cut from both edges, a dashed perforation, the ID on the stub. Everything else is an ordinary card: 14px radius, 1px line, no shadow.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <TicketCard
          guilloche
          stub={
            <>
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{shortId("wal_k2j8x0c1m3n5p7q9r2s4t6v8", 6)}</span>
              <CopyButton value="wal_k2j8x0c1m3n5p7q9r2s4t6v8" label="Copy wallet ID" className="-my-2 -mr-2" />
            </>
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Agent pass</p>
              <p className="font-display mt-2 text-2xl">Scout</p>
            </div>
            <StatusBadge status="active" />
          </div>
          <Money micros="50000000" size="lg" className="mt-5 block" />
          <p className="mt-1 text-sm text-ink-soft">
            <Money micros="30000" variant="text" /> on hold
          </p>
        </TicketCard>

        <TicketCard
          tone="ink"
          stub={
            <span className="flex w-full items-center justify-between gap-3">
              <span className="truncate font-mono text-xs">{shortId("crd_8f2k1m0x9q7w5e3r1t6y4u2i", 6)}</span>
              <StatusBadge status="active" onInk />
            </span>
          }
        >
          <p className="eyebrow text-on-ink-soft!">Credential · Relay</p>
          <div className="mt-3 flex items-baseline justify-between gap-3">
            <Money micros={(1_000_000n - BigInt(used) * 10_000n).toString()} rolling size="md" />
            <span className="text-sm text-on-ink-soft">of $1.00 left</span>
          </div>
          <Punches total={12} used={used} tone="ink" className="mt-4" />
          <div className="mt-4 flex gap-2">
            <Button size="md" variant="secondary" onInk onClick={() => setUsed((u) => Math.min(12, u + 1))}>
              Punch
            </Button>
            <Button size="md" variant="ghost" onInk onClick={() => setUsed(0)}>
              Reset
            </Button>
          </div>
        </TicketCard>

        <TicketCard tone="pass" guilloche stub={<span className="font-mono text-xs">Unallocated</span>}>
          <p className="eyebrow text-white/80!">Business balance</p>
          <Money micros="20000000" size="xl" className="mt-3 block" />
        </TicketCard>

        <Card title="Card with title" actions={<Button variant="ghost" icon={<Pencil size={16} strokeWidth={1.75} aria-hidden />}>Edit</Button>}>
          <p className="text-ink-soft">An ordinary card for settings, lists and forms.</p>
        </Card>
        <Card tone="ink" title="Ink card">
          <p className="text-on-ink-soft">For panels on ink surfaces.</p>
        </Card>
        <TicketCard interactive stub={<span className="font-mono text-xs">svc_r3l4y0m3ss4g3s0k1x2c9v8</span>}>
          <p className="font-semibold">Interactive ticket</p>
          <p className="mt-1 text-sm text-ink-soft">The hairline darkens on hover, for tickets that are links.</p>
        </TicketCard>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- */

function BadgesSection() {
  return (
    <Section id="badges" title="Badges" file="components/Badge.tsx" note="Colour never carries meaning alone: every status has an icon and a word.">
      <div className="grid gap-4 lg:grid-cols-2">
        <Demo label="Status">
          <div className="flex flex-wrap gap-2">
            {(["active", "disabled", "pending", "confirmed", "failed", "sent", "released", "expired", "exhausted", "revoked", "approved", "refused"] as const).map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
            <TestModeBadge />
            <Badge tone="pass">Custom</Badge>
          </div>
        </Demo>
        <Demo label="On ink" ink>
          <div className="flex flex-wrap gap-2">
            {(["active", "pending", "sent", "refused", "approved"] as const).map((s) => (
              <StatusBadge key={s} status={s} onInk />
            ))}
            <TestModeBadge onInk />
          </div>
        </Demo>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- */

type Row = { id: string; agent: string; amount: string; at: string; status: "approved" | "refused" };
const now = Date.parse("2026-11-18T12:00:00Z");
const seedRows: Row[] = [
  { id: "chg_1", agent: "Scout", amount: "10000", at: new Date(now - 60_000).toISOString(), status: "approved" },
  { id: "chg_2", agent: "Buyer", amount: "10000", at: new Date(now - 240_000).toISOString(), status: "approved" },
  { id: "chg_3", agent: "Broke", amount: "10000", at: new Date(now - 600_000).toISOString(), status: "refused" },
];
const columns: Column<Row>[] = [
  { key: "agent", header: "Agent", cell: (r) => <span className="font-medium">{r.agent}</span> },
  { key: "status", header: "Result", cell: (r) => <StatusBadge status={r.status} /> },
  { key: "at", header: "Time", cell: (r) => <span className="text-ink-soft">{formatDateTime(r.at)}</span>, hideBelow: "sm" },
  { key: "amount", header: "Amount", numeric: true, cell: (r) => formatUsd(r.amount) },
];

function TableSection() {
  const [rows, setRows] = useState(seedRows);
  const n = useRef(4);
  return (
    <Section id="table" title="Table" file="components/Table.tsx" note="Amounts right-aligned in mono. New rows slide in from the top and push the others; a refresh that changes nothing does not animate. Loading is a skeleton, empty invites the first action, error has a retry.">
      <div className="mb-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          icon={<Plus size={18} strokeWidth={2} aria-hidden />}
          onClick={() => {
            const i = n.current++;
            setRows((r) => [{ id: `chg_${i}`, agent: ["Scout", "Buyer"][i % 2]!, amount: "10000", at: new Date().toISOString(), status: "approved" }, ...r]);
          }}
        >
          Add a row
        </Button>
        <Button variant="ghost" onClick={() => setRows((r) => [...r])}>
          Refresh, no change
        </Button>
      </div>
      <div className="grid gap-4">
        <Table label="Recent charges" columns={columns} rows={rows} getRowId={(r) => r.id} />
        <div className="grid gap-4 lg:grid-cols-3">
          <Table label="Loading" columns={columns.slice(0, 2).concat(columns[3]!)} rows={null} loading getRowId={(r) => r.id} skeletonRows={3} />
          <Table
            label="Empty"
            columns={columns}
            rows={[]}
            getRowId={(r) => r.id}
            empty={<EmptyState size="compact" icon={Inbox} title="No charges yet" body="Charges appear here when agents pay." />}
          />
          <Table label="Error" columns={columns} rows={null} getRowId={(r) => r.id} error="Charges did not load." onRetry={() => new Promise((r) => setTimeout(r, 800))} />
        </div>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- */

function OverlaysSection() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Section id="overlays" title="Dialog and menus" file="components/Dialog.tsx, components/Popover.tsx" note="Dialogs scale from 0.96 in the centre. Menus and popovers scale out of their trigger (try the ones at each edge). Escape closes both; focus returns to the trigger.">
      <Demo>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Button variant="danger" onClick={() => setOpen(true)}>
            Revoke key
          </Button>
          <Menu
            label="Agent actions"
            align="start"
            items={[
              { label: "Rename", icon: Pencil, onSelect: () => toast("Rename picked") },
              { label: "Copy agent ID", icon: Copy, onSelect: () => toast.success("Agent ID copied") },
              { label: "Disable agent", icon: Bot, onSelect: () => toast("Disable picked") },
              { label: "Delete", icon: Trash2, tone: "danger", separated: true, onSelect: () => toast.error("Delete picked") },
            ]}
            trigger={(p, o) => (
              <Button variant="secondary" {...p} aria-pressed={o}>
                Menu, start aligned
              </Button>
            )}
          />
          <Popover
            align="center"
            label="Balance help"
            trigger={(p) => (
              <Button variant="ghost" {...p} icon={<Wallet size={18} strokeWidth={1.75} aria-hidden />}>
                Popover, centred
              </Button>
            )}
          >
            <div className="max-w-[260px] p-4 text-sm">
              <p className="font-semibold">Unallocated balance</p>
              <p className="mt-1 text-ink-soft">Money you have topped up that is not in any agent&apos;s wallet yet.</p>
            </div>
          </Popover>
          <Menu
            label="Account"
            align="end"
            header="ops@acme.test"
            items={[{ label: "Log out", icon: LogOut, onSelect: () => toast("Log out picked") }]}
            trigger={(p) => (
              <Button variant="secondary" {...p}>
                Menu, end aligned
              </Button>
            )}
          />
        </div>
      </Demo>
      <Dialog
        open={open}
        onClose={() => !busy && setOpen(false)}
        dismissable={!busy}
        title="Revoke this key?"
        description="Software using the key ending 4f2a stops working at once. This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Keep key
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() => {
                setBusy(true);
                setTimeout(() => {
                  setBusy(false);
                  setOpen(false);
                  toast.success("Key revoked");
                }, 900);
              }}
            >
              Revoke key
            </Button>
          </>
        }
      />
    </Section>
  );
}

/* ---------------------------------------------------------------- */

function StatesSection() {
  return (
    <Section id="states" title="Empty, error, loading" file="components/EmptyState.tsx, ErrorState.tsx, Skeleton.tsx" note="Every data view has all three. Loading is a skeleton, never a spinner.">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card padding="none">
          <EmptyState icon={Bot} title="No agents yet" body="Create an agent to give it a wallet and a key." action={<Button icon={<Plus size={18} strokeWidth={2} aria-hidden />}>Create agent</Button>} />
        </Card>
        <Card padding="none">
          <ErrorState onRetry={() => new Promise((r) => setTimeout(r, 900))} code="network_error" />
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <Skeleton shape="circle" />
            <div className="flex-1 space-y-2">
              <Skeleton className="w-1/2" />
              <Skeleton className="w-1/3" />
            </div>
          </div>
          <Skeleton shape="block" className="mt-5 h-16" />
          <SkeletonText className="mt-5" lines={3} />
        </Card>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- */

function CopyOnceSection() {
  return (
    <Section id="copy-once" title="Copy once" file="components/CopyOnce.tsx" note="A secret appears once, at creation, with a copy button and a warning. The page holds it in memory only. CopyButton is the small version for IDs.">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)]">
        <CopyOnce label="Agent API key" value="gw_test_agt_example0key0for0the0styleguide00" />
        <Demo label="CopyButton">
          <div className="flex items-center gap-2">
            <code className="truncate font-mono text-sm">sel_r3l4y0m3ss4g3s0k1x2c9v8</code>
            <CopyButton value="sel_r3l4y0m3ss4g3s0k1x2c9v8" label="Copy seller ID" />
          </div>
          <div className="mt-3">
            <CopyButton value="npm i @gaitway/sdk" label="Copy command" showText />
          </div>
        </Demo>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- */

function TextureSection() {
  return (
    <Section id="texture" title="Guilloche" file="components/Guilloche.tsx" note="Engraved line rosettes at 6 to 10 percent, behind hero text and inside wallet tickets. One turn in 120 seconds; still under reduced motion.">
      <div className="grid gap-4 md:grid-cols-3">
        <Demo label="rosette" className="relative h-64 overflow-hidden">
          <Guilloche size={300} opacity={0.5} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-pass" />
        </Demo>
        <Demo label="seal" ink className="relative h-64 overflow-hidden">
          <Guilloche variant="seal" size={300} opacity={0.4} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-go-bright" />
        </Demo>
        <Demo label="band" className="relative h-64 overflow-hidden">
          <Guilloche variant="band" opacity={0.5} className="absolute inset-x-0 top-1/2 h-20 w-full -translate-y-1/2 text-ink" />
        </Demo>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- */

function LayoutSection() {
  const [k, setK] = useState(0);
  return (
    <Section id="layout" title="Page header and reveal" file="components/PageHeader.tsx, components/SectionReveal.tsx" note="Eyebrow, Display title, one primary action at the right. Sections rise 12px and fade in, 40ms apart, once per page load.">
      <Demo>
        <PageHeader
          eyebrow="Business"
          title="Agents"
          description="Each agent has its own wallet and key."
          meta={<StatusBadge status="active" />}
          action={<Button icon={<Plus size={18} strokeWidth={2} aria-hidden />}>Create agent</Button>}
          className="pb-6!"
        />
        <SectionReveal key={k} className="grid gap-3 sm:grid-cols-3">
          {["Overview", "Agents", "Activity"].map((t) => (
            <Card key={t} padding="sm">
              <p className="font-semibold">{t}</p>
              <p className="text-sm text-ink-soft">A section of the page.</p>
            </Card>
          ))}
        </SectionReveal>
        <Button variant="ghost" className="mt-4" onClick={() => setK((n) => n + 1)} icon={<RefreshCw size={18} strokeWidth={1.75} aria-hidden />}>
          Replay entrance
        </Button>
      </Demo>
    </Section>
  );
}

function ToastSection() {
  return (
    <Section id="toast" title="Toast" file="components/Toast.tsx" note="Call toast() from client code. Polite to screen readers, never takes focus, pauses while hovered or the tab is hidden.">
      <Demo>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => toast("Agent renamed")}>
            Neutral
          </Button>
          <Button variant="secondary" onClick={() => toast.success("Money added", "Scout now has $55.00.")}>
            Success
          </Button>
          <Button variant="secondary" onClick={() => toast.error("Not enough balance", "Top up first.")}>
            Error
          </Button>
        </div>
      </Demo>
    </Section>
  );
}

function ShellsSection() {
  return (
    <Section id="shells" title="Shells" file="components/BusinessShell.tsx, components/SellerShell.tsx, components/Shell.tsx" note="Ink sidebar 248px with the sliding active marker, test-mode badge and account menu; a top bar with a menu sheet below 900px. Log in to see them at /business and /seller.">
      <Demo>
        <div className="flex flex-wrap items-center gap-4">
          <Logo />
          <GateMark size={28} />
          <ButtonLink href="/business" variant="secondary">
            Open /business
          </ButtonLink>
          <ButtonLink href="/seller" variant="secondary">
            Open /seller
          </ButtonLink>
        </div>
      </Demo>
    </Section>
  );
}
