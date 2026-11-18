"use client";

import { useEffect, useRef, useState } from "react";
import { GateLane, type GateLaneHandle } from "@/components/GateLane";

const CENT = 10_000n;

/**
 * A looping example of the gate lane on the auth screens: three approved
 * one-cent payments, then a refusal. Labelled as an example; the names and
 * amounts are illustrative, not anyone's data.
 */
export function LaneIllustration() {
  const lane = useRef<GateLaneHandle>(null);
  const [pass, setPass] = useState(1_000_000n); // $1.00
  const [owed, setOwed] = useState(0n);
  const step = useRef(0);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (!alive || document.hidden) return;
      const n = step.current++;
      if (n % 4 === 3) {
        void lane.current?.refuse("Not enough balance", { amountMicros: "2000000" });
      } else {
        setPass((p) => (p >= CENT ? p - CENT : 1_000_000n));
        setOwed((o) => o + CENT);
        void lane.current?.approve({ amountMicros: CENT.toString() });
      }
    };
    const first = setTimeout(tick, 900);
    const id = setInterval(tick, 2200);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  return (
    <figure className="rounded-[18px] border border-ink-line bg-ink/60 p-5 backdrop-blur-[2px]">
      <GateLane ref={lane} pass={{ name: "Scout", balanceMicros: pass.toString() }} seller={{ name: "Relay", balanceMicros: owed.toString() }} />
      <figcaption className="mt-4 text-sm text-on-ink-soft">
        Example. An agent pays a seller one cent at a time; a payment above its balance is refused at the gate.
      </figcaption>
    </figure>
  );
}
