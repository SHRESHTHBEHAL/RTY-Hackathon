"use client";

import { AnimatePresence, motion, useAnimate, useReducedMotion } from "motion/react";
import { Ban, Check } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import { formatUsd, shortId } from "@/lib/format";
import { Money } from "./Money";
import { DUR, EASE_IN_OUT, EASE_OUT, SPRING, SPRING_LANDING } from "./motion-tokens";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type GateLaneParty = {
  name: string;
  /** Micros string. Changes roll like a departure board. */
  balanceMicros: string;
  /** Small label above the name. Defaults: "Agent pass" / "Seller". */
  label?: string;
  /** Optional ID shown on the pass stub, e.g. the wallet ID. */
  id?: string;
};

export type GateJourney = {
  /** Unique per journey; each new id plays once. */
  id: string;
  outcome: "approved" | "refused";
  /** Refused only: shown on the sign above the gate, e.g. "Not enough balance". */
  reason?: string;
  /** Micros carried by the token, shown on its tag. */
  amountMicros?: string;
};

export type GateLaneHandle = {
  /** Play an approved journey. Resolves when the token has landed. */
  approve: (opts?: { amountMicros?: string; id?: string }) => Promise<void>;
  /** Play a refused journey with the reason sign. Resolves when the token is back. */
  refuse: (reason: string, opts?: { amountMicros?: string; id?: string }) => Promise<void>;
  /** Stop every token in flight at once (interrupts, no waiting). */
  clear: () => void;
};

export type GateLaneProps = {
  pass: GateLaneParty;
  seller: GateLaneParty;
  /** Prop-driven alternative to the ref: append journeys as real events arrive. */
  journeys?: GateJourney[];
  /** md for dashboards and the landing hero; lg for /demo (72px balances). */
  size?: "md" | "lg";
  /** Column labels above the lane ("Agent pass · Gate · Seller"). */
  showLabels?: boolean;
  onJourneyEnd?: (j: { id: string; outcome: GateJourney["outcome"] }) => void;
  /**
   * Fires at the physical moments of a journey, for screens that draw the
   * pass or seller themselves: "landed" (approved token reaches the seller),
   * "hit" (refused token meets the shut gate), "bounced" (it is back at the pass).
   * Under reduced motion "landed" or "hit" fires when the gate changes colour.
   */
  onBeat?: (beat: "landed" | "hit" | "bounced", j: { id: string; outcome: GateJourney["outcome"] }) => void;
  /**
   * false draws the lane and gate only, without the pass and seller cards,
   * so a screen can place its own passes and seller at the lane's ends.
   * Default true.
   */
  parties?: boolean;
  className?: string;
};

type Flight = Required<Pick<GateJourney, "id" | "outcome">> & { reason?: string; amountMicros?: string; resolve: () => void };

type Sign = { key: number; kind: "approved" | "refused"; text: string };

const TOKEN = 22; // px, token diameter

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

/**
 * The signature. A pass on the left, a seller on the right, a gate in the
 * middle. Approved: a token leaves the pass, the gate's arms part (160ms),
 * the token passes, lands at the seller with a small spring, the seller's
 * balance rolls up and a green flash runs down the lane. Refused: the token
 * reaches the gate, the arms stay shut and flash red, the token compresses
 * against them and springs back with a shake, and the reason appears above
 * the gate on a sign.
 *
 * Driven by real events, through the ref (approve/refuse) or the `journeys`
 * prop. Any number of tokens can be in flight; each runs its own animation
 * and can be stopped mid-flight (clear, or unmount). Under reduced motion no
 * token travels: the gate changes colour and the sign cross-fades in.
 */
export const GateLane = forwardRef<GateLaneHandle, GateLaneProps>(function GateLane(
  { pass, seller, journeys, size = "md", showLabels = true, onJourneyEnd, onBeat, parties = true, className },
  ref,
) {
  // Read the preference only after hydration, so server and first client render match.
  const prefersReduced = useReducedMotion() ?? false;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reduce = mounted && prefersReduced;
  const laneRef = useRef<HTMLDivElement>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [sign, setSign] = useState<Sign | null>(null);
  const signTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signKey = useRef(0);
  const [flashes, setFlashes] = useState<number[]>([]);
  const [landPulse, setLandPulse] = useState(0);
  const [passShake, setPassShake] = useState(0);
  const idSeq = useRef(0);
  const played = useRef(new Set<string>());
  const onEndRef = useRef(onJourneyEnd);
  onEndRef.current = onJourneyEnd;
  const onBeatRef = useRef(onBeat);
  onBeatRef.current = onBeat;

  /* --- Gate: open while any approved token holds a lease; a refusal slams it. --- */
  const leases = useRef(new Set<string>());
  const [gateOpen, setGateOpen] = useState(false);
  const [gateTone, setGateTone] = useState<"idle" | "go" | "stop">("idle");
  const [jolt, setJolt] = useState(0);
  const toneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slamUntil = useRef(0);

  const syncGate = useCallback(() => {
    setGateOpen(leases.current.size > 0 && Date.now() >= slamUntil.current);
  }, []);
  const flashTone = useCallback((tone: "go" | "stop", ms: number) => {
    if (toneTimer.current) clearTimeout(toneTimer.current);
    setGateTone(tone);
    toneTimer.current = setTimeout(() => setGateTone("idle"), ms);
  }, []);

  /* --- Seller balance: hold a new value until the token carrying it lands. --- */
  const [sellerShown, setSellerShown] = useState(seller.balanceMicros);
  const pendingSeller = useRef<string | null>(null);
  const approvedInFlight = useRef(0);
  useEffect(() => {
    if (approvedInFlight.current > 0 && !reduce) pendingSeller.current = seller.balanceMicros;
    else setSellerShown(seller.balanceMicros);
  }, [seller.balanceMicros, reduce]);

  const showSign = useCallback((kind: Sign["kind"], text: string, ms: number) => {
    if (signTimer.current) clearTimeout(signTimer.current);
    signKey.current += 1;
    setSign({ key: signKey.current, kind, text });
    signTimer.current = setTimeout(() => setSign(null), ms);
  }, []);

  useEffect(
    () => () => {
      if (signTimer.current) clearTimeout(signTimer.current);
      if (toneTimer.current) clearTimeout(toneTimer.current);
    },
    [],
  );

  const [announce, setAnnounce] = useState("");
  const live = useRef(new Map<string, Flight>());

  const launch = useCallback(
    (j: Omit<Flight, "resolve">) =>
      new Promise<void>((resolve) => {
        if (live.current.has(j.id)) return resolve();
        if (j.outcome === "approved") approvedInFlight.current += 1;
        const flight = { ...j, resolve };
        live.current.set(j.id, flight);
        setFlights((f) => [...f, flight]);
        const amount = j.amountMicros ? ` ${formatUsd(j.amountMicros)}` : "";
        setAnnounce(
          j.outcome === "approved"
            ? `Approved: ${pass.name} paid ${seller.name}${amount}.`
            : `Refused: ${j.reason ?? "payment refused"}.`,
        );
      }),
    [pass.name, seller.name],
  );

  // `live` holds flights by id, so resolving happens outside state updaters.
  const finish = useCallback((id: string) => {
    const hit = live.current.get(id);
    if (!hit) return;
    live.current.delete(id);
    if (hit.outcome === "approved") approvedInFlight.current = Math.max(0, approvedInFlight.current - 1);
    setFlights((f) => f.filter((x) => x.id !== id));
    hit.resolve();
    onEndRef.current?.({ id: hit.id, outcome: hit.outcome });
  }, []);

  const nextId = () => `j${++idSeq.current}`;

  useImperativeHandle(
    ref,
    () => ({
      approve: (opts = {}) => launch({ id: opts.id ?? nextId(), outcome: "approved", amountMicros: opts.amountMicros }),
      refuse: (reason, opts = {}) => launch({ id: opts.id ?? nextId(), outcome: "refused", reason, amountMicros: opts.amountMicros }),
      clear: () => {
        const all = [...live.current.values()];
        live.current.clear();
        setFlights([]);
        all.forEach((x) => x.resolve());
        approvedInFlight.current = 0;
        leases.current.clear();
        syncGate();
        if (pendingSeller.current !== null) {
          setSellerShown(pendingSeller.current);
          pendingSeller.current = null;
        }
      },
    }),
    [launch, syncGate],
  );

  // Prop-driven journeys: play each new id once.
  useEffect(() => {
    if (!journeys) return;
    for (const j of journeys) {
      if (played.current.has(j.id)) continue;
      played.current.add(j.id);
      void launch({ id: j.id, outcome: j.outcome, reason: j.reason, amountMicros: j.amountMicros });
    }
  }, [journeys, launch]);

  /* --- Callbacks a token uses at each beat of its journey. --- */
  const beats = {
    gateOpen: (id: string) => {
      leases.current.add(id);
      syncGate();
    },
    gateClose: (id: string) => {
      leases.current.delete(id);
      syncGate();
    },
    passed: () => flashTone("go", 520),
    hit: (reason: string, j?: Flight) => {
      if (j) onBeatRef.current?.("hit", { id: j.id, outcome: j.outcome });
      slamUntil.current = Date.now() + 320;
      syncGate();
      setTimeout(syncGate, 330);
      flashTone("stop", 700);
      setJolt((n) => n + 1);
      showSign("refused", reason, 2600);
    },
    bounced: (j?: Flight) => {
      setPassShake((n) => n + 1);
      if (j) onBeatRef.current?.("bounced", { id: j.id, outcome: j.outcome });
    },
    landed: (j?: Flight) => {
      if (j) onBeatRef.current?.("landed", { id: j.id, outcome: j.outcome });
      setLandPulse((n) => n + 1);
      setFlashes((f) => [...f, Date.now() + Math.random()]);
      showSign("approved", "Approved", 1300);
      if (pendingSeller.current !== null) {
        setSellerShown(pendingSeller.current);
        pendingSeller.current = null;
      }
    },
  };

  // Reduced motion: no travelling token, just the gate colour and the sign.
  const handledStill = useRef(new Set<string>());
  useEffect(() => {
    if (!reduce) return;
    for (const f of flights) {
      if (handledStill.current.has(f.id)) continue;
      handledStill.current.add(f.id);
      onBeatRef.current?.(f.outcome === "approved" ? "landed" : "hit", { id: f.id, outcome: f.outcome });
      if (f.outcome === "approved") {
        flashTone("go", 900);
        showSign("approved", "Approved", 1600);
      } else {
        flashTone("stop", 900);
        showSign("refused", f.reason ?? "Refused", 2600);
      }
      setTimeout(() => finish(f.id), 600);
    }
  }, [reduce, flights, finish, flashTone, showSign]);

  const lg = size === "lg";

  const lane = (
    <div ref={laneRef} className={cn("relative", lg ? "h-48" : "h-32 sm:h-36")}>
      <LaneFloor reduce={reduce} />

      {/* Green flash runs down the lane after a landing */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-10 -translate-y-1/2 overflow-hidden">
        <AnimatePresence>
          {flashes.map((k) => (
            <motion.span
              key={k}
              className="absolute inset-y-0 left-0 w-2/5 bg-gradient-to-r from-transparent via-go-bright/45 to-transparent"
              initial={{ x: "-100%", opacity: 0 }}
              animate={{ x: "250%", opacity: [0, 1, 1, 0] }}
              transition={{ duration: 0.42, ease: EASE_OUT }}
              onAnimationComplete={() => setFlashes((f) => f.filter((x) => x !== k))}
            />
          ))}
        </AnimatePresence>
      </div>

      <Gate open={gateOpen} tone={gateTone} jolt={jolt} reduce={reduce} lg={lg} />

      <GateSign sign={sign} lg={lg} />

      {/* Tokens */}
      {!reduce &&
        flights.map((f) => (
          <Token key={f.id} flight={f} laneRef={laneRef} beats={beats} onDone={() => finish(f.id)} />
        ))}
    </div>
  );

  if (!parties) {
    return (
      <div className={cn("relative w-full select-none", className)} role="group" aria-label={`Payment lane from ${pass.name} to ${seller.name}`}>
        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
        {lane}
      </div>
    );
  }

  return (
    <div
      className={cn("surface-ink relative w-full select-none", className)}
      role="group"
      aria-label={`Payment lane from ${pass.name} to ${seller.name}`}
    >
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      {showLabels ? (
        <div
          aria-hidden
          className={cn(
            "mb-3 grid items-end",
            lg ? "grid-cols-[minmax(0,300px)_1fr_minmax(0,300px)]" : "grid-cols-[minmax(0,1fr)_minmax(96px,1.15fr)_minmax(0,1fr)] sm:grid-cols-[minmax(0,220px)_1fr_minmax(0,220px)]",
          )}
        >
          <span className="eyebrow text-on-ink-soft!">{pass.label ?? "Agent pass"}</span>
          <span className={cn("eyebrow text-center text-on-ink-soft! transition-opacity duration-200", sign && "opacity-0")}>Gate</span>
          <span className="eyebrow text-right text-on-ink-soft!">{seller.label ?? "Seller"}</span>
        </div>
      ) : null}

      <div
        className={cn(
          "grid items-center",
          lg ? "grid-cols-[minmax(0,300px)_1fr_minmax(0,300px)]" : "grid-cols-[minmax(0,1fr)_minmax(96px,1.15fr)_minmax(0,1fr)] sm:grid-cols-[minmax(0,220px)_1fr_minmax(0,220px)]",
        )}
      >
        {/* Pass */}
        <ShakeOnChange trigger={passShake} disabled={reduce} className="relative z-10">
          <PassCard party={pass} lg={lg} />
        </ShakeOnChange>

        {/* Lane */}
        {lane}

        {/* Seller */}
        <div className="relative z-10">
          <SellerCard party={{ ...seller, balanceMicros: sellerShown }} lg={lg} pulse={landPulse} reduce={reduce} />
        </div>
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Parts                                                               */
/* ------------------------------------------------------------------ */

function PassCard({ party, lg }: { party: GateLaneParty; lg: boolean }) {
  return (
    <div className="ticket" data-tone="ink">
      <div className="ticket-head">
        <div className={cn("ticket-fill", lg ? "p-6 pb-5" : "p-3 pb-2.5 sm:p-4 sm:pb-3")}>
          <p className={cn("font-display truncate text-on-ink", lg ? "text-2xl" : "text-lg sm:text-xl")}>{party.name}</p>
          <div className={cn("mt-2", lg ? "mt-4" : "")}>
            <Money micros={party.balanceMicros} rolling size={lg ? "xl" : "sm"} className={cn("text-on-ink", !lg && "text-[22px]! sm:text-2xl!")} />
          </div>
        </div>
      </div>
      <div className="ticket-stub">
        <div className={cn("ticket-fill flex items-center", lg ? "h-12 px-6" : "h-9 px-3 sm:h-10 sm:px-4")}>
          <span className="truncate font-mono text-[11px] text-on-ink-soft sm:text-xs">{party.id ? shortId(party.id) : "Wallet"}</span>
        </div>
      </div>
    </div>
  );
}

function SellerCard({ party, lg, pulse, reduce }: { party: GateLaneParty; lg: boolean; pulse: number; reduce: boolean }) {
  return (
    <div className={cn("relative overflow-hidden rounded-[14px] border border-ink-line bg-ink-raised", lg ? "p-6" : "p-3 sm:p-4")}>
      {/* Landing glow */}
      <AnimatePresence>
        {pulse > 0 ? (
          <motion.span
            key={pulse}
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[14px] border-2 border-go-bright bg-go-bright/8"
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.3 : 0.6, ease: EASE_OUT }}
          />
        ) : null}
      </AnimatePresence>
      <p className={cn("font-display relative truncate text-on-ink", lg ? "text-2xl" : "text-lg sm:text-xl")}>{party.name}</p>
      <div className={cn("relative mt-2", lg && "mt-4")}>
        <Money micros={party.balanceMicros} rolling size={lg ? "xl" : "sm"} className={cn("text-on-ink", !lg && "text-[22px]! sm:text-2xl!")} />
      </div>
      <p className={cn("relative mt-1.5 text-on-ink-soft", lg ? "text-base" : "text-[11px] sm:text-xs")}>Owed</p>
    </div>
  );
}

function LaneFloor({ reduce }: { reduce: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-10 -translate-y-1/2">
      <div className="absolute inset-0 border-y border-ink-line bg-white/[0.025]" />
      {/* Drifting lane markings: ambient, toward the gate. */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-[200%]",
            !reduce && "[animation:lane-drift_7s_linear_infinite]",
          )}
          style={{
            backgroundImage: "repeating-linear-gradient(90deg, rgba(238,242,234,0.16) 0 10px, transparent 10px 26px)",
            backgroundSize: "26px 2px",
            backgroundRepeat: "repeat-x",
            backgroundPosition: "0 50%",
          }}
        />
      </div>
    </div>
  );
}

function Gate({ open, tone, jolt, reduce, lg }: { open: boolean; tone: "idle" | "go" | "stop"; jolt: number; reduce: boolean; lg: boolean }) {
  // Arms swing toward the seller: the top arm counter-clockwise, the bottom arm clockwise.
  const OPEN = 78;
  const postH = lg ? 30 : 22;
  // Arms reach from the post to 2px short of the lane's centre line.
  const armH = `calc(50% - ${postH}px)`;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-12 -translate-x-1/2">
      {/* Posts */}
      <Post where="top" h={postH} tone={tone} />
      <Post where="bottom" h={postH} tone={tone} />
      {/* Arms */}
      <Arm where="top" h={armH} top={postH} open={open} angle={-OPEN} tone={tone} jolt={jolt} reduce={reduce} />
      <Arm where="bottom" h={armH} top={postH} open={open} angle={OPEN} tone={tone} jolt={jolt} reduce={reduce} />
    </div>
  );
}

function Post({ where, h, tone }: { where: "top" | "bottom"; h: number; tone: "idle" | "go" | "stop" }) {
  return (
    <div
      className={cn(
        "absolute left-1/2 w-8 -translate-x-1/2 border border-ink-line bg-ink-raised",
        where === "top" ? "top-0 rounded-[6px_6px_3px_3px]" : "bottom-0 rounded-[3px_3px_6px_6px]",
      )}
      style={{ height: h }}
    >
      {/* Indicator light, cross-faded by opacity only */}
      <span className={cn("absolute left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-on-ink-soft/40", where === "top" ? "bottom-1.5" : "top-1.5")} />
      <span
        className={cn(
          "absolute left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-go-bright shadow-[0_0_8px_var(--go-bright)] transition-opacity duration-200",
          where === "top" ? "bottom-1.5" : "top-1.5",
          tone === "go" ? "opacity-100" : "opacity-0",
        )}
      />
      <span
        className={cn(
          "absolute left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-stop shadow-[0_0_8px_var(--stop)] transition-opacity duration-200",
          where === "top" ? "bottom-1.5" : "top-1.5",
          tone === "stop" ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

function Arm({
  where,
  h,
  top,
  open,
  angle,
  tone,
  jolt,
  reduce,
}: {
  where: "top" | "bottom";
  h: string;
  top: number;
  open: boolean;
  angle: number;
  tone: "idle" | "go" | "stop";
  jolt: number;
  reduce: boolean;
}) {
  const [scope, animate] = useAnimate();
  const first = useRef(true);
  // Refusal: the arms take the hit, give a few degrees toward the seller, spring back.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduce || !scope.current) return;
    const push = where === "top" ? -7 : 7;
    const a = animate(scope.current, { rotate: [0, push, 0] }, { duration: 0.32, ease: [0.23, 1, 0.32, 1], times: [0, 0.25, 1] });
    return () => a.stop();
  }, [jolt, reduce, animate, scope, where]);

  return (
    <motion.div
      className="absolute left-1/2 w-[7px] -translate-x-1/2"
      style={{
        height: h,
        top: where === "top" ? top - 4 : undefined,
        bottom: where === "bottom" ? top - 4 : undefined,
        transformOrigin: where === "top" ? "50% 0%" : "50% 100%",
      }}
      initial={false}
      animate={{ rotate: open && !reduce ? angle : 0 }}
      transition={open ? { duration: 0.16, ease: EASE_OUT } : SPRING}
    >
      <div ref={scope} className="relative h-full w-full" style={{ transformOrigin: where === "top" ? "50% 0%" : "50% 100%" }}>
        <span className="absolute inset-0 rounded-full bg-on-ink shadow-[0_0_10px_rgba(238,242,234,0.25)]" />
        <span className={cn("absolute inset-0 rounded-full bg-go-bright transition-opacity duration-150", tone === "go" ? "opacity-100" : "opacity-0")} />
        <span className={cn("absolute inset-0 rounded-full bg-stop transition-opacity duration-150", tone === "stop" ? "opacity-100" : "opacity-0")} />
      </div>
    </motion.div>
  );
}

function GateSign({ sign, lg }: { sign: Sign | null; lg: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-3 flex justify-center sm:-top-4">
      <AnimatePresence mode="popLayout" initial={false}>
        {sign ? (
          <motion.div
            key={sign.key}
            initial={{ opacity: 0, y: 6, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: DUR.standard, ease: EASE_OUT } }}
            exit={{ opacity: 0, y: -4, transition: { duration: DUR.standard * 0.6 } }}
            className={cn(
              "font-display flex max-w-[min(260px,100%)] items-center gap-1.5 whitespace-nowrap rounded-[6px] border bg-ink px-2 py-1 tracking-[0.04em] shadow-[0_6px_16px_-6px_rgba(0,0,0,0.6)]",
              lg ? "text-xl" : "text-[13px] sm:text-base",
              sign.kind === "refused" ? "border-stop/60 text-stop-bright" : "border-go-bright/50 text-go-bright",
            )}
          >
            {sign.kind === "refused" ? <Ban size={lg ? 18 : 14} strokeWidth={2.5} /> : <Check size={lg ? 18 : 14} strokeWidth={2.5} />}
            <span className="truncate">{sign.text}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ShakeOnChange({ trigger, disabled, className, children }: { trigger: number; disabled: boolean; className?: string; children: ReactNode }) {
  const [scope, animate] = useAnimate();
  useEffect(() => {
    if (!trigger || disabled || !scope.current) return;
    const a = animate(scope.current, { x: [0, -4, 4, -3, 3, 0] }, { duration: 0.28, ease: "easeInOut" });
    return () => a.stop();
  }, [trigger, disabled, animate, scope]);
  return (
    <div ref={scope} className={className}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Token                                                               */
/* ------------------------------------------------------------------ */

type Beats = {
  gateOpen: (id: string) => void;
  gateClose: (id: string) => void;
  passed: () => void;
  hit: (reason: string, j?: Flight) => void;
  bounced: (j?: Flight) => void;
  landed: (j?: Flight) => void;
};

/**
 * One token, one journey. Each token owns its animations, so several can be
 * in flight at once; unmounting stops them mid-move and gives back its gate
 * lease, which is what makes the lane interruptible.
 */
function Token({ flight, laneRef, beats, onDone }: { flight: Flight; laneRef: React.RefObject<HTMLDivElement | null>; beats: Beats; onDone: () => void }) {
  const [scope, animate] = useAnimate();
  const beatsRef = useRef(beats);
  beatsRef.current = beats;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const el = scope.current as HTMLElement | null;
    const lane = laneRef.current;
    if (!el || !lane) return;
    let cancelled = false;
    const running: Array<{ stop: () => void }> = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const run = (keyframes: Record<string, unknown>, options: object) => {
      const a = animate(el, keyframes as never, options as never);
      running.push(a);
      return a;
    };
    const after = (ms: number, fn: () => void) => timers.push(setTimeout(() => !cancelled && fn(), ms));
    const b = () => beatsRef.current;

    const w = lane.getBoundingClientRect().width;
    const start = -TOKEN / 2;
    const gate = w / 2 - TOKEN / 2;
    const end = w - TOKEN / 2;
    const trail = el.querySelector<HTMLElement>("[data-trail]");
    const body = el.querySelector<HTMLElement>("[data-body]");
    const tag = el.querySelector<HTMLElement>("[data-tag]");

    async function approved() {
      // Emerge from the pass.
      run({ opacity: [0, 1], scale: [0.6, 1] }, { duration: 0.12, ease: EASE_OUT });
      if (trail) animate(trail, { opacity: [0, 0.9, 0.9, 0] }, { duration: 0.7, times: [0, 0.2, 0.8, 1] });
      // The gate opens just before the token reaches it and closes behind it.
      after(190, () => b().gateOpen(flight.id));
      after(380, () => b().passed());
      after(520, () => b().gateClose(flight.id));
      await run({ x: [start, end] }, { duration: 0.7, ease: EASE_IN_OUT });
      if (cancelled) return;
      b().landed(flight);
      // Land: a small squash, then a spring settle while it is absorbed into the seller.
      if (tag) animate(tag, { opacity: 0 }, { duration: 0.1 });
      if (body) {
        await animate(body, { scaleX: 0.74, scaleY: 1.2 }, { duration: 0.08, ease: EASE_OUT });
        if (cancelled) return;
        animate(body, { scaleX: 1, scaleY: 1 }, SPRING_LANDING);
      }
      await run({ opacity: 0, scale: 0.55, x: end + 8 }, { duration: 0.22, ease: EASE_OUT, delay: 0.06 });
    }

    async function refused() {
      run({ opacity: [0, 1], scale: [0.6, 1] }, { duration: 0.12, ease: EASE_OUT });
      if (trail) animate(trail, { opacity: [0, 0.9, 0] }, { duration: 0.42, times: [0, 0.6, 1] });
      // Arrive with speed: this is a collision, so the approach does not ease off.
      const contact = gate - TOKEN / 2 - 3;
      await run({ x: [start, contact] }, { duration: 0.38, ease: [0.45, 0, 0.8, 0.5] });
      if (cancelled) return;
      b().hit(flight.reason ?? "Refused", flight);
      // Compress against the shut arms.
      if (body) await animate(body, { scaleX: 0.58, scaleY: 1.28 }, { duration: 0.07, ease: EASE_OUT });
      if (cancelled) return;
      // Spring back to the pass; the body recovers its shape on the way.
      if (body) animate(body, { scaleX: 1, scaleY: 1 }, SPRING_LANDING);
      await run({ x: start + 6 }, SPRING_LANDING);
      if (cancelled) return;
      b().bounced(flight);
      await run({ x: [start + 6, start + 2, start + 9, start + 3, start + 6] }, { duration: 0.24, ease: "easeInOut" });
      if (cancelled) return;
      await run({ opacity: 0, scale: 0.6 }, { duration: 0.14, ease: EASE_OUT });
    }

    (flight.outcome === "approved" ? approved() : refused())
      .catch(() => {})
      .finally(() => {
        if (!cancelled) doneRef.current();
      });

    return () => {
      cancelled = true;
      running.forEach((a) => a.stop());
      timers.forEach(clearTimeout);
      beatsRef.current.gateClose(flight.id);
    };
    // A journey is fixed at launch; it never restarts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={scope}
      className="pointer-events-none absolute left-0 z-20"
      style={{ top: `calc(50% - ${TOKEN / 2}px)`, width: TOKEN, height: TOKEN, opacity: 0 }}
      aria-hidden
    >
      {/* Speed trail behind the token */}
      <span
        data-trail
        className="absolute right-1/2 top-1/2 h-[6px] w-14 -translate-y-1/2 rounded-full bg-gradient-to-r from-transparent to-pass-bright/70 opacity-0 blur-[1px]"
      />
      <span data-body className="absolute inset-0 block rounded-full bg-pass shadow-[0_0_0_3px_rgba(47,75,255,0.28),0_0_18px_rgba(47,75,255,0.65)]">
        <span className="absolute inset-[5px] rounded-full border border-white/70" />
      </span>
      {flight.amountMicros ? (
        <span data-tag className="absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-[4px] bg-ink/80 px-1 font-mono text-[11px] text-on-ink">
          {formatUsd(flight.amountMicros)}
        </span>
      ) : null}
    </div>
  );
}
