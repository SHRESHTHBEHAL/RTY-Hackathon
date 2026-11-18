"use client";

import { AnimatePresence, LayoutGroup, motion, useAnimate, type TargetAndTransition, type Transition } from "motion/react";
import { Ban, Check, CircleDollarSign, Hourglass, Play, Plus, RotateCcw, Send, TriangleAlert, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addMoney, resetDemo, startRun, stepRun, tryBlocked } from "@/app/demo/actions";
import type { DemoAgent, DemoRefusal, DemoSnapshot } from "@/app/demo/types";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { GateLane, type GateLaneHandle } from "@/components/GateLane";
import { Logo } from "@/components/Logo";
import { Money } from "@/components/Money";
import { DUR, EASE_OUT, SPRING_LANDING } from "@/components/motion-tokens";
import { Punches } from "@/components/Punches";
import { TicketCard } from "@/components/TicketCard";
import { toast } from "@/components/Toast";
import { cn } from "@/lib/cn";
import { formatRelative, formatUsd, shortId } from "@/lib/format";
import { Kbd } from "./Kbd";
import { rulesInWords, sentence } from "./words";
import { useReduce } from "@/components/public/useReduce";

const MESSAGES = 5;
const CENT = "10000";
const RUN_HOLD = "50000";
const BLOCKED = "5000000";
/** Time between messages in a run, so each token can be followed by eye. */
const PACE_MS = 620;
const POLL_MS = 1000;

type Inflight = { id: string; agentId: string; amount: bigint };
type RunState = { sent: number; phase: "starting" | "sending" | "done" };
type Callout = DemoRefusal & { key: number; amountMicros: string };
type LocalRow = { id: string; agentName: string; message: string; at: number };

export function DemoScreen({ initial, initialError }: { initial: DemoSnapshot | null; initialError: string | null }) {
  const reduce = useReduce();
  const [snap, setSnap] = useState<DemoSnapshot | null>(initial);
  const [pollError, setPollError] = useState<string | null>(initialError);
  const lastTime = useRef(initial?.serverTime ?? 0);
  const pendingSteps = useRef(0);

  const [inflight, setInflight] = useState<Inflight[]>([]);
  const [runs, setRuns] = useState<Record<number, RunState | undefined>>({});
  const busy = useRef<Record<number, boolean>>({});
  const [callouts, setCallouts] = useState<Record<number, Callout | undefined>>({});
  const calloutKey = useRef(0);
  const [local, setLocal] = useState<LocalRow[]>([]);
  const [relayPulse, setRelayPulse] = useState<{ n: number; chips: Array<{ id: string; amount: string }> }>({ n: 0, chips: [] });
  const [shake, setShake] = useState<Record<number, number>>({});
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const lanes = useRef<Array<GateLaneHandle | null>>([]);
  const wide = useWide();

  /* ---- Apply snapshots: never older over newer. ---- */
  const apply = useCallback((s: DemoSnapshot | null | undefined) => {
    if (!s || s.serverTime < lastTime.current) return;
    lastTime.current = s.serverTime;
    setSnap(s);
    setPollError(null);
  }, []);

  /* ---- Poll about once a second while the tab is visible. ---- */
  const poll = useCallback(async () => {
    try {
      const res = await fetch("/demo/state", { cache: "no-store" });
      const body = (await res.json()) as DemoSnapshot | { error: { message: string } };
      if (!res.ok || "error" in body) {
        setPollError("error" in body ? body.error.message : "Gaitway did not answer.");
        return;
      }
      // While a charge is on its way back to us, its snapshot is the one to trust.
      if (pendingSteps.current > 0) return;
      apply(body);
    } catch {
      setPollError("Cannot reach this screen's server. Check the connection.");
    }
  }, [apply]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;
    const loop = async () => {
      if (!alive) return;
      if (document.visibilityState === "visible") await poll();
      timer = setTimeout(loop, POLL_MS);
    };
    timer = setTimeout(loop, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [poll]);

  /* ---- Journeys ---- */
  const travelling = useRef(new Map<string, bigint>());
  const land = useCallback((id: string) => {
    const amount = travelling.current.get(id);
    if (amount === undefined) return; // already landed (onBeat and the promise both report it)
    travelling.current.delete(id);
    setInflight((list) => list.filter((x) => x.id !== id));
    setRelayPulse((p) => ({ n: p.n + 1, chips: [...p.chips, { id, amount: amount.toString() }].slice(-4) }));
  }, []);

  const refuse = useCallback(
    (slot: number, r: DemoRefusal, amountMicros: string, agent: DemoAgent | undefined, at: number) => {
      let message = r.message;
      if (r.code === "insufficient_funds" && agent) {
        message = `${agent.name} has ${formatUsd(agent.availableMicros)}, so Gaitway refused the ${formatUsd(amountMicros)} hold. Nothing was sent or charged.`;
      }
      const c: Callout = { ...r, message, key: ++calloutKey.current, amountMicros };
      setCallouts((m) => ({ ...m, [slot]: c }));
      setLocal((rows) => [{ id: `refusal-${c.key}`, agentName: agent?.name ?? "Agent", message, at }, ...rows].slice(0, 8));
      void lanes.current[slot]?.refuse(r.sign, { amountMicros });
    },
    [],
  );

  // Callouts stay long enough to read from the back of the room.
  useEffect(() => {
    const timers = Object.entries(callouts).map(([slot, c]) =>
      c ? setTimeout(() => setCallouts((m) => (m[Number(slot)]?.key === c.key ? { ...m, [slot]: undefined } : m)), 9000) : null,
    );
    return () => timers.forEach((t) => t && clearTimeout(t));
  }, [callouts]);

  const snapRef = useRef(snap);
  snapRef.current = snap;

  const run = useCallback(
    async (slot: number) => {
      if (busy.current[slot]) return;
      const agent = snapRef.current?.agents[slot];
      if (!agent) return;
      busy.current[slot] = true;
      setCallouts((m) => ({ ...m, [slot]: undefined }));
      setRuns((r) => ({ ...r, [slot]: { sent: 0, phase: "starting" } }));
      try {
        const start = await startRun(slot);
        if (!start.ok) {
          apply(start.snapshot);
          refuse(slot, start.refusal, RUN_HOLD, start.snapshot?.agents[slot] ?? agent, start.snapshot?.serverTime ?? Date.now());
          return;
        }
        apply(start.snapshot);
        setRuns((r) => ({ ...r, [slot]: { sent: 0, phase: "sending" } }));
        for (let i = 1; i <= start.messages; i++) {
          const t0 = performance.now();
          pendingSteps.current += 1;
          let step;
          try {
            step = await stepRun(start.runId);
          } finally {
            pendingSteps.current -= 1;
          }
          if (!step.ok) {
            apply(step.snapshot);
            refuse(slot, step.refusal, CENT, step.snapshot?.agents[slot] ?? agent, step.snapshot?.serverTime ?? Date.now());
            break;
          }
          const j = { id: step.chargeId, agentId: agent.id, amount: BigInt(step.amountMicros) };
          // Hold the new charge back on Relay's side until its token lands.
          travelling.current.set(j.id, j.amount);
          setInflight((list) => [...list, j]);
          apply(step.snapshot);
          setRuns((r) => ({ ...r, [slot]: { sent: i, phase: "sending" } }));
          const lane = lanes.current[slot];
          if (lane) void lane.approve({ id: j.id, amountMicros: step.amountMicros }).then(() => land(j.id));
          else land(j.id);
          if (step.done) break;
          const wait = PACE_MS - (performance.now() - t0);
          if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        }
      } catch {
        toast.error("The run stopped", "This screen lost its server. Check the connection, then run again.");
      } finally {
        busy.current[slot] = false;
        setRuns((r) => ({ ...r, [slot]: r[slot] ? { ...r[slot]!, phase: "done" } : undefined }));
      }
    },
    [apply, land, refuse],
  );

  const blocked = useCallback(async () => {
    if (busyAction === "blocked") return;
    setBusyAction("blocked");
    try {
      const r = await tryBlocked(0);
      apply(r.snapshot);
      if (!r.ok) refuse(0, r.refusal, BLOCKED, r.snapshot?.agents[0], r.snapshot?.serverTime ?? Date.now());
      else toast("No rule stopped it", { body: "This agent has no per-payment limit, so the hold was opened and released at once." });
    } catch {
      toast.error("Could not reach the server", "Try again.");
    } finally {
      setBusyAction(null);
    }
  }, [apply, refuse, busyAction]);

  const refill = useCallback(
    async (slot: number) => {
      const key = `add-${slot}`;
      setBusyAction(key);
      try {
        const r = await addMoney(slot);
        apply(r.snapshot);
        if (r.ok) {
          toast.success(`Added ${formatUsd(r.amountMicros)} to ${r.snapshot?.agents[slot]?.name ?? "the agent"}`);
          setCallouts((m) => ({ ...m, [slot]: undefined }));
        } else toast.error("Money was not added", r.refusal.message);
      } catch {
        toast.error("Could not reach the server", "Try again.");
      } finally {
        setBusyAction(null);
      }
    },
    [apply],
  );

  const reset = useCallback(async () => {
    if (busyAction === "reset") return;
    setBusyAction("reset");
    lanes.current.forEach((l) => l?.clear());
    try {
      const r = await resetDemo();
      travelling.current.clear();
      setInflight([]);
      setCallouts({});
      setLocal([]);
      setRuns({});
      busy.current = {};
      apply(r.snapshot);
      if (r.ok) toast.success("Demo reset");
      else toast.error("Reset failed", r.refusal.message);
    } catch {
      toast.error("Could not reach the server", "Try again.");
    } finally {
      setBusyAction(null);
    }
  }, [apply, busyAction]);

  /* ---- Presenter shortcuts ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const k = e.key.toLowerCase();
      if (k === "1" || k === "2" || k === "3") void run(Number(k) - 1);
      else if (k === "b") void blocked();
      else if (k === "r") void reset();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, blocked, reset]);

  /* ---- Reconciled view ---- */
  const view = useMemo(() => {
    if (!snap) return null;
    const inflightByAgent = new Map<string, number>();
    let held = 0n;
    for (const j of inflight) {
      inflightByAgent.set(j.agentId, (inflightByAgent.get(j.agentId) ?? 0) + 1);
      held += j.amount;
    }
    const owed = BigInt(snap.seller.owedMicros) - held;
    // Hide the newest k charges of an agent while k of its tokens are still travelling.
    const hideNewest = <T,>(rows: T[], agentOf: (r: T) => string | null, isCharge: (r: T) => boolean) => {
      const left = new Map(inflightByAgent);
      return rows.filter((r) => {
        const a = agentOf(r);
        if (!a || !isCharge(r)) return true;
        const n = left.get(a) ?? 0;
        if (n > 0) {
          left.set(a, n - 1);
          return false;
        }
        return true;
      });
    };
    const feed = hideNewest(snap.feed, (r) => r.agentId, (r) => r.kind === "charge");
    const charges = hideNewest(snap.charges, (r) => r.agentId, () => true);
    type Row = { id: string; at: number; text: string; tone: "go" | "hold" | "neutral" | "stop"; amount: string | null; kind: string };
    const rows: Row[] = [
      ...feed.map((f) => {
        const s = sentence(f.kind, f.agentName, f.amountMicros, f.counterparty, snap.businessName);
        return { id: f.id, at: Date.parse(f.createdAt), text: s.text, tone: s.tone, amount: f.amountMicros, kind: f.kind };
      }),
      ...local.map((l) => ({ id: l.id, at: l.at, text: `${l.agentName} was refused. ${l.message}`, tone: "stop" as const, amount: null, kind: "refusal" })),
    ]
      .sort((a, b) => b.at - a.at)
      .slice(0, 7);
    return { owed: (owed < 0n ? 0n : owed).toString(), rows, charges: charges.slice(0, 4) };
  }, [snap, inflight, local]);

  /* ---- Load sequence: once, under 900ms. ---- */
  const enter = (delay: number, from: "left" | "right" | "up" | "none" = "up"): Enter => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, x: from === "left" ? -16 : from === "right" ? 16 : 0, y: from === "up" ? 12 : 0 },
    animate: { opacity: 1, x: 0, y: 0 },
    transition: { duration: DUR.slow, ease: EASE_OUT, delay: reduce ? 0 : delay },
  });

  if (!snap || !view) {
    return (
      <main className="surface-ink grid min-h-dvh place-items-center p-6">
        <div className="max-w-md rounded-[14px] border border-ink-line bg-ink-raised [&_h3]:text-on-ink [&_p]:text-on-ink-soft">
          <ErrorState
            title="The demo cannot reach Gaitway"
            message={pollError ?? "Gaitway did not answer."}
            onRetry={async () => {
              await poll();
            }}
          />
        </div>
      </main>
    );
  }

  const sellerName = snap.seller.name;

  return (
    <main className="surface-ink relative min-h-dvh overflow-x-clip">
      {/* Engraved band behind the header */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_50%_-20%,rgba(47,75,255,0.18),transparent_60%)]" />

      <div className="relative mx-auto flex min-h-dvh max-w-[1880px] flex-col px-4 pb-6 sm:px-6 [@media(min-width:1024px)_and_(min-height:1000px)]:h-dvh lg:px-8 lg:pb-5 2xl:px-10">
        {/* Header */}
        <motion.header {...enter(0, "none")} className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4 lg:py-3.5">
          <Logo onInk size="lg" />
          <span aria-hidden className="hidden h-7 w-px bg-ink-line sm:block" />
          <h1 className="font-display text-[28px] tracking-[0.02em] text-on-ink sm:text-[32px]">Agents paying, live</h1>
          <Badge tone="test" onInk className="h-7 px-3 text-[13px]">
            Test money only. No real money moves.
          </Badge>
          <p className="hidden text-sm text-on-ink-soft 2xl:block">
            {snap.businessName} · <span className="font-mono text-on-ink">{formatUsd(snap.unallocatedMicros)}</span> not yet given to an agent
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-2">
            <ShortcutLegend />
            <Button variant="ghost" onInk loading={busyAction === "reset"} onClick={reset} icon={<RotateCcw size={18} strokeWidth={1.75} aria-hidden />}>
              Reset
            </Button>
          </div>
        </motion.header>

        {pollError ? (
          <div role="status" className="mb-4 flex items-center gap-3 rounded-[10px] border border-stop/40 bg-stop/12 px-4 py-2.5 text-[15px] text-stop-bright">
            <TriangleAlert size={18} strokeWidth={1.75} aria-hidden />
            <span className="text-on-ink">{pollError} Showing the last numbers we had; retrying every second.</span>
            <Button variant="secondary" onInk className="ml-auto h-9" onClick={() => void poll()}>
              Retry now
            </Button>
          </div>
        ) : null}

        {/* Stage */}
        <LayoutGroup>
          <div className="grid flex-1 grid-cols-1 gap-x-6 gap-y-4 lg:min-h-0 lg:grid-cols-[320px_minmax(0,1fr)_300px] lg:grid-rows-[auto_auto_auto_auto] lg:gap-y-3 [@media(min-width:1024px)_and_(min-height:1000px)]:grid-rows-[auto_auto_auto_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)_360px] 2xl:gap-x-8">
            {snap.agents.map((a, i) => (
              <AgentRow
                key={a.id}
                agent={a}
                slot={i}
                sellerName={sellerName}
                sellerId={snap.seller.id}
                owedMicros={view.owed}
                run={runs[i]}
                callout={callouts[i]}
                shake={shake[i] ?? 0}
                wide={wide}
                reduce={reduce}
                laneRef={(h) => {
                  lanes.current[i] = h;
                }}
                onBeat={(beat, j) => {
                  if (beat === "landed") land(j.id);
                  if (beat === "bounced") setShake((m) => ({ ...m, [i]: (m[i] ?? 0) + 1 }));
                }}
                onRun={() => void run(i)}
                onAdd={() => void refill(i)}
                adding={busyAction === `add-${i}`}
                enterPass={enter(0.08 + i * 0.06, "left")}
                enterLane={enter(0.2 + i * 0.06, "none")}
              />
            ))}

            {/* Relay */}
            <motion.section
              {...enter(0.26, "right")}
              aria-labelledby="relay-title"
              className="lg:col-start-3 lg:row-span-4 lg:row-start-1 lg:min-h-0"
            >
              <RelayPanel snap={snap} owed={view.owed} pulse={relayPulse} reduce={reduce} charges={view.charges} />
            </motion.section>

            {/* Break a rule */}
            <motion.section {...enter(0.42)} aria-labelledby="rule-title" className="lg:col-start-1 lg:row-start-4">
              <div className="rounded-[14px] border border-ink-line bg-ink-raised/60 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="rule-title" className="eyebrow text-on-ink-soft!">
                    Break a rule
                  </h2>
                  <Kbd>B</Kbd>
                </div>
                <p className="mt-3 text-[17px] leading-snug text-on-ink">
                  {snap.agents[0]?.name} asks to put {formatUsd(BLOCKED)} on hold for {sellerName}. Its limit is{" "}
                  {snap.agents[0]?.rules?.perPaymentMaxMicros ? formatUsd(snap.agents[0].rules.perPaymentMaxMicros) : "set by the business"} a payment.
                </p>
                <Button
                  variant="danger"
                  block
                  className="mt-4"
                  loading={busyAction === "blocked"}
                  onClick={() => void blocked()}
                  icon={<Ban size={18} strokeWidth={1.75} aria-hidden />}
                >
                  Try a {formatUsd(BLOCKED)} payment
                </Button>

              </div>
            </motion.section>

            {/* Feed */}
            <motion.section {...enter(0.48)} aria-labelledby="feed-title" className="min-w-0 lg:col-start-2 lg:row-start-4 lg:min-h-0">
              <Feed rows={view.rows} reduce={reduce} />
            </motion.section>

          </div>
        </LayoutGroup>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */

function useWide() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

function ShortcutLegend() {
  return (
    <dl aria-label="Keyboard shortcuts" className="hidden items-center gap-4 text-sm text-on-ink-soft md:flex">
      <div className="flex items-center gap-1.5">
        <dt className="flex gap-1">
          <Kbd>1</Kbd>
          <Kbd>2</Kbd>
          <Kbd>3</Kbd>
        </dt>
        <dd>Run agent</dd>
      </div>
      <div className="flex items-center gap-1.5">
        <dt>
          <Kbd>B</Kbd>
        </dt>
        <dd>Break a rule</dd>
      </div>
      <div className="flex items-center gap-1.5">
        <dt>
          <Kbd>R</Kbd>
        </dt>
        <dd>Reset</dd>
      </div>
    </dl>
  );
}

/* ------------------------------------------------------------------ */
/* One agent: its pass on the left, its lane in the centre.            */
/* ------------------------------------------------------------------ */

type Enter = { initial: TargetAndTransition; animate: TargetAndTransition; transition: Transition };

function AgentRow({
  agent,
  slot,
  sellerName,
  sellerId,
  owedMicros,
  run,
  callout,
  shake,
  wide,
  reduce,
  laneRef,
  onBeat,
  onRun,
  onAdd,
  adding,
  enterPass,
  enterLane,
}: {
  agent: DemoAgent;
  slot: number;
  sellerName: string;
  sellerId: string;
  owedMicros: string;
  run: RunState | undefined;
  callout: Callout | undefined;
  shake: number;
  wide: boolean;
  reduce: boolean;
  laneRef: (h: GateLaneHandle | null) => void;
  onBeat: (beat: "landed" | "hit" | "bounced", j: { id: string }) => void;
  onRun: () => void;
  onAdd: () => void;
  adding: boolean;
  enterPass: Enter;
  enterLane: Enter;
}) {
  const [scope, animate] = useAnimate();
  useEffect(() => {
    if (!shake || reduce || !scope.current) return;
    const a = animate(scope.current, { x: [0, -6, 6, -4, 4, 0] }, { duration: 0.3, ease: "easeInOut" });
    return () => a.stop();
  }, [shake, reduce, animate, scope]);

  const running = run && run.phase !== "done";
  const empty = BigInt(agent.availableMicros) === 0n && BigInt(agent.heldMicros) === 0n;
  const rows = ["lg:row-start-1", "lg:row-start-2", "lg:row-start-3"][slot];
  const rules = rulesInWords(agent.rules, sellerName, sellerId);

  return (
    <>
      <motion.div {...enterPass} className={cn("lg:col-start-1", rows)}>
        <div ref={scope}>
          <TicketCard
            tone="ink"
            guilloche
            as="article"
            aria-label={`${agent.name}'s pass`}
            className={cn(callout && "[--ticket-line:rgba(232,69,42,0.6)]")}
            bodyClassName="px-5 pt-4 pb-3.5 2xl:px-6"
            stub={
              <div className="flex w-full items-center gap-2">
                <Button
                  onClick={onRun}
                  loading={false}
                  disabled={agent.status !== "active"}
                  aria-keyshortcuts={String(slot + 1)}
                  icon={running ? <Send size={18} strokeWidth={1.75} aria-hidden /> : <Play size={18} strokeWidth={1.75} aria-hidden />}
                  className="flex-1"
                >
                  {running ? (run.phase === "starting" ? "Opening hold" : `Sending ${Math.max(1, run.sent)} of ${MESSAGES}`) : "Run agent"}
                </Button>
                <Button variant="secondary" onInk loading={adding} onClick={onAdd} icon={<Plus size={18} strokeWidth={1.75} aria-hidden />}>
                  Add money
                </Button>
              </div>
            }
            stubClassName="px-4 py-2"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display truncate text-[28px] text-on-ink 2xl:text-[32px]">
                {agent.name}
                <span className="sr-only">, agent pass</span>
              </h2>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-on-ink-soft" title={agent.walletId}>
                  {shortId(agent.walletId)}
                </span>
                <Kbd>{slot + 1}</Kbd>
              </div>
            </div>
            <div className="mt-1.5 flex items-end justify-between gap-3" data-testid={`balance-${slot}`}>
              <Money
                micros={agent.availableMicros}
                rolling
                size="xl"
                className={cn("text-[56px]! leading-[0.9] lg:text-[64px]! 2xl:text-[72px]! [@media(max-height:960px)]:lg:text-[56px]!", empty ? "text-stop-bright" : "text-on-ink")}
              />
              {running || (run && run.sent > 0) ? (
                <div className="mb-1.5 flex flex-col items-end gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-on-ink-soft">Messages</span>
                  <Punches total={MESSAGES} used={run?.sent ?? 0} tone="ink" label={`${run?.sent ?? 0} of ${MESSAGES} messages paid`} />
                </div>
              ) : null}
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] leading-snug text-on-ink-soft">
              <span className={cn("inline-flex items-center gap-1.5 transition-colors duration-200", BigInt(agent.heldMicros) > 0n && "text-hold-bright")}>
                <Hourglass size={16} strokeWidth={1.75} aria-hidden />
                On hold <Money micros={agent.heldMicros} variant="mono" rolling className="text-inherit" />
              </span>
              {rules.map((r) => (
                <span key={r} className="inline-flex items-center gap-2">
                  <span aria-hidden className="text-on-ink-soft/50">·</span>
                  {r}
                </span>
              ))}
            </p>
          </TicketCard>
        </div>
      </motion.div>

      <motion.div {...enterLane} className={cn("relative min-w-0 self-center lg:col-start-2", rows)}>
        {wide ? (
          <p aria-hidden className="absolute left-0 top-1 text-xs font-semibold uppercase tracking-[0.08em] text-on-ink-soft/70">
            Lane {slot + 1} · {agent.name} to {sellerName}
          </p>
        ) : (
          <div aria-hidden className="mb-1 flex justify-between text-xs font-semibold uppercase tracking-[0.08em] text-on-ink-soft">
            <span>{agent.name}</span>
            <span>{sellerName}</span>
          </div>
        )}
        <GateLane
          ref={laneRef}
          parties={false}
          size={wide ? "lg" : "md"}
          pass={{ name: agent.name, balanceMicros: agent.availableMicros }}
          seller={{ name: sellerName, balanceMicros: owedMicros }}
          onBeat={onBeat}
        />
        <AnimatePresence>
          {callout ? (
            <motion.div
              key={callout.key}
              role="alert"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { duration: DUR.standard, ease: EASE_OUT, delay: reduce ? 0 : 0.36 } }}
              exit={{ opacity: 0, transition: { duration: DUR.quick } }}
              className="relative z-30 mt-2 flex items-start gap-3 rounded-[10px] border border-stop/60 bg-[color-mix(in_srgb,var(--stop)_16%,var(--ink))] px-4 py-3 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)] lg:absolute lg:left-0 lg:top-[calc(50%+26px)] lg:mt-0 lg:w-[calc(50%-36px)]"
            >
              <Ban size={22} strokeWidth={2} className="mt-0.5 shrink-0 text-stop-bright" aria-hidden />
              <p className="text-[17px] leading-snug text-on-ink lg:text-base 2xl:text-[18px]">
                <span className="font-semibold text-stop-bright">Refused. {callout.sign}. </span>
                {callout.message}
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Relay                                                               */
/* ------------------------------------------------------------------ */

function RelayPanel({
  snap,
  owed,
  pulse,
  reduce,
  charges,
}: {
  snap: DemoSnapshot;
  owed: string;
  pulse: { n: number; chips: Array<{ id: string; amount: string }> };
  reduce: boolean;
  charges: DemoSnapshot["charges"];
}) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-[18px] border border-ink-line bg-ink-raised p-6 2xl:p-7">
      {/* Landing glow */}
      <AnimatePresence>
        {pulse.n > 0 ? (
          <motion.span
            key={pulse.n}
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[18px] border-2 border-go-bright bg-go-bright/6"
            initial={{ opacity: 0.85 }}
            animate={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.3 : 0.6, ease: EASE_OUT }}
          />
        ) : null}
      </AnimatePresence>
      {/* Arrival dock: where the three lanes end */}
      <span aria-hidden className="absolute inset-y-10 left-0 hidden w-[3px] rounded-r-full bg-gradient-to-b from-transparent via-go-bright/50 to-transparent lg:block" />

      <p className="eyebrow text-on-ink-soft!">Seller</p>
      <h2 id="relay-title" className="font-display mt-1 text-[44px] text-on-ink 2xl:text-[52px]">
        {snap.seller.name}
      </h2>
      {snap.seller.priceNote ? <p className="mt-1 text-[15px] text-on-ink-soft">Messaging API · {snap.seller.priceNote}</p> : null}

      <div className="mt-8 [@media(max-height:960px)]:lg:mt-5">
        <p className="eyebrow text-on-ink-soft!">Owed to {snap.seller.name}</p>
        <div className="relative mt-2" data-testid="relay-owed">
          <Money micros={owed} rolling size="xl" className="text-[56px]! text-go-bright lg:text-[64px]! 2xl:text-[72px]!" />
          <AnimatePresence>
            {pulse.chips.map((c) => (
              <motion.span
                key={c.id}
                aria-hidden
                className="absolute -top-2 right-0 font-mono text-lg text-go-bright"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
                animate={reduce ? { opacity: [0, 1, 0] } : { opacity: [0, 1, 0], y: -18 }}
                transition={{ duration: 0.7, ease: EASE_OUT }}
              >
                +{formatUsd(c.amount)}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
        <p className="mt-2 text-sm text-on-ink-soft">Confirmed charges, not yet paid out.</p>
      </div>

      <div className="mt-6 border-t border-dashed border-ink-line pt-5">
        <p className="eyebrow text-on-ink-soft!">Paid out</p>
        <Money micros={snap.seller.paidOutMicros} rolling size="lg" className="mt-2 text-on-ink" />
        <p className="mt-2 text-sm text-on-ink-soft">Sent in batches by settlement. A new payout below is a settlement.</p>
      </div>

      <div className="mt-6 min-h-0 flex-1 border-t border-dashed border-ink-line pt-5 lg:mt-auto lg:flex-none">
        <RelayLists snap={snap} charges={charges} reduce={reduce} />
      </div>
    </div>
  );
}

function RelayLists({ snap, charges, reduce }: { snap: DemoSnapshot; charges: DemoSnapshot["charges"]; reduce: boolean }) {
  return (
    <div>
      <h3 className="eyebrow text-on-ink-soft!">Recent charges</h3>
      {charges.length === 0 ? (
        <p className="mt-3 text-[15px] text-on-ink-soft">No charges yet. Run an agent to send the first message.</p>
      ) : (
        <ul className="mt-2">
          <AnimatePresence initial={false}>
            {charges.map((c) => (
              <motion.li
                key={c.id}
                layout={!reduce}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: DUR.quick } }}
                transition={{ duration: DUR.standard, ease: EASE_OUT }}
                className="flex items-baseline justify-between gap-3 border-b border-ink-line/60 py-2 last:border-0"
              >
                <span className="min-w-0 truncate text-[15px] text-on-ink">{c.agentName ?? shortId(c.agentId)}</span>
                <span className="font-mono text-[15px] tabular text-go-bright">+{formatUsd(c.amountMicros)}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      <h3 className="eyebrow mt-4 text-on-ink-soft!">Payouts</h3>
      {snap.payouts.length === 0 ? (
        <p className="mt-2 text-[15px] text-on-ink-soft">No payouts yet. Settlement sends the first batch.</p>
      ) : (
        <ul className="mt-2">
          {snap.payouts.slice(0, 2).map((p) => (
            <li key={p.id} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="inline-flex items-center gap-1.5 text-[15px] text-on-ink">
                <CircleDollarSign size={16} strokeWidth={1.75} className="text-on-ink-soft" aria-hidden />
                {p.status === "sent" ? "Sent" : "Pending"} · <span className="text-on-ink-soft">{formatRelative(p.createdAt)}</span>
              </span>
              <span className="font-mono text-[15px] tabular text-on-ink">{formatUsd(p.amountMicros)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Feed                                                                */
/* ------------------------------------------------------------------ */

type FeedRow = { id: string; at: number; text: string; tone: "go" | "hold" | "neutral" | "stop"; amount: string | null; kind: string };

function Feed({ rows, reduce }: { rows: FeedRow[]; reduce: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="h-full overflow-hidden rounded-[14px] border border-ink-line bg-ink/40 p-5 [mask-image:linear-gradient(to_bottom,#000_calc(100%-28px),transparent)]">
      <div className="flex items-baseline justify-between">
        <h2 id="feed-title" className="eyebrow text-on-ink-soft!">
          What just happened
        </h2>
        <span className="text-xs text-on-ink-soft">Newest first</span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 text-lg text-on-ink-soft">Nothing yet. Press 1 to run Scout.</p>
      ) : (
        <ol className="mt-2" aria-live="polite" aria-relevant="additions">
          <AnimatePresence initial={false} mode="popLayout">
            {rows.map((r) => (
              <motion.li
                key={r.id}
                layout={!reduce}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: -14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: DUR.quick } }}
                transition={r.tone === "stop" && !reduce ? SPRING_LANDING : { duration: DUR.standard, ease: EASE_OUT }}
                className={cn(
                  "flex items-start gap-3 border-b border-ink-line/60 py-2.5 last:border-0",
                  r.tone === "stop" && "-mx-2 rounded-[8px] border-0 bg-stop/14 px-2",
                )}
              >
                <FeedIcon kind={r.kind} tone={r.tone} />
                <span className={cn("min-w-0 flex-1 text-lg leading-snug", r.tone === "stop" ? "text-on-ink" : "text-on-ink")}>{r.text}</span>
                <span className="shrink-0 pt-0.5 text-sm text-on-ink-soft">{formatRelative(new Date(r.at).toISOString(), now)}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </div>
  );
}

function FeedIcon({ kind, tone }: { kind: string; tone: FeedRow["tone"] }) {
  const cls = cn(
    "mt-1 shrink-0",
    tone === "go" ? "text-go-bright" : tone === "hold" ? "text-hold-bright" : tone === "stop" ? "text-stop-bright" : "text-on-ink-soft",
  );
  const p = { size: 18, strokeWidth: 1.75, className: cls, "aria-hidden": true } as const;
  if (kind === "refusal") return <Ban {...p} strokeWidth={2.25} />;
  if (kind === "charge") return <Check {...p} strokeWidth={2.25} />;
  if (kind === "hold") return <Hourglass {...p} />;
  if (kind === "release") return <Undo2 {...p} />;
  return <Plus {...p} />;
}
