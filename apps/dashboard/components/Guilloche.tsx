import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * Banknote-style engraved rosette, drawn as SVG paths. Purely decorative
 * (aria-hidden). Server-renderable; the drift is a CSS animation, one turn
 * in 120 seconds, and stops under reduced motion.
 */

type Variant = "rosette" | "seal" | "band";

const round = (n: number) => Math.round(n * 10) / 10;

function polyline(points: Array<[number, number]>, close = true): string {
  let d = "";
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i]!;
    d += `${i === 0 ? "M" : "L"}${round(x)} ${round(y)}`;
  }
  return close ? `${d}Z` : d;
}

/** Hypotrochoid: the spirograph curve that engravers use for rosettes. */
function hypotrochoid(R: number, r: number, d: number, steps: number, cx: number, cy: number, rot = 0): string {
  const g = gcd(Math.round(R), Math.round(r));
  const turns = Math.round(r) / g;
  const pts: Array<[number, number]> = [];
  const total = Math.PI * 2 * turns;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * total;
    const k = (R - r) / r;
    const x = (R - r) * Math.cos(t) + d * Math.cos(k * t);
    const y = (R - r) * Math.sin(t) - d * Math.sin(k * t);
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    pts.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return polyline(pts);
}

/** A circle whose radius ripples: the "wavy border" lines on notes. */
function ripple(r0: number, amp: number, lobes: number, phase: number, steps: number, cx: number, cy: number): string {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const r = r0 + amp * Math.sin(lobes * a + phase);
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return polyline(pts);
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

type Layer = { d: string; uses: Array<{ scale: number; rotate: number }> };

const cache = new Map<Variant, Layer[]>();

/**
 * Each layer is one path drawn once and reused with <use> at several scales
 * and rotations, which keeps the markup small (a few KB per rosette).
 */
function layersFor(variant: Variant): Layer[] {
  const hit = cache.get(variant);
  if (hit) return hit;
  const L: Layer[] = [];
  const c = 200;
  const range = (n: number, f: (i: number) => { scale: number; rotate: number }) => Array.from({ length: n }, (_, i) => f(i));
  if (variant === "rosette") {
    L.push({ d: hypotrochoid(96, 22, 58, 660, c, c), uses: range(3, (i) => ({ scale: 1, rotate: i * 5 })) });
    // Inner flower closes the centre so the rosette never shows an empty hole.
    L.push({ d: hypotrochoid(45, 12, 31, 420, c, c), uses: range(2, (i) => ({ scale: 1, rotate: i * 10 })) });
    L.push({ d: ripple(118, 6, 24, 0, 240, c, c), uses: range(9, (i) => ({ scale: 1 + i * 0.036, rotate: i * 1.1 })) });
    L.push({ d: ripple(170, 9, 36, 0, 360, c, c), uses: range(6, (i) => ({ scale: 1 + i * 0.021, rotate: i * 0.9 })) });
    L.push({ d: ripple(170, 9, 36, Math.PI, 360, c, c), uses: range(6, (i) => ({ scale: 1 + i * 0.021, rotate: i * 0.9 })) });
  } else if (variant === "seal") {
    L.push({ d: hypotrochoid(120, 35, 70, 600, c, c), uses: range(4, (i) => ({ scale: 1, rotate: i * 6.4 })) });
    L.push({ d: hypotrochoid(50, 14, 34, 420, c, c), uses: range(2, (i) => ({ scale: 1, rotate: i * 9 })) });
    L.push({ d: ripple(150, 5, 30, 0, 300, c, c), uses: range(6, (i) => ({ scale: 1 + i * 0.04, rotate: i * 2 })) });
  } else {
    // Band: horizontal sine weaves for strips and stubs. viewBox 400x80.
    for (let i = 0; i < 7; i++) {
      const amp = 22 - i * 2;
      const up: Array<[number, number]> = [];
      const down: Array<[number, number]> = [];
      for (let x = 0; x <= 400; x += 2.5) {
        const a = (x / 400) * Math.PI * 2 * 9 + i * 0.35;
        up.push([x, 40 + Math.sin(a) * amp]);
        down.push([x, 40 - Math.sin(a) * amp]);
      }
      L.push({ d: polyline(up, false), uses: [{ scale: 1, rotate: 0 }] });
      L.push({ d: polyline(down, false), uses: [{ scale: 1, rotate: 0 }] });
    }
  }
  cache.set(variant, L);
  return L;
}

export type GuillocheProps = {
  variant?: Variant;
  /** Width and height in px (band is 5:1). Use className for responsive sizing. */
  size?: number | string;
  /** 0 to 1. DESIGN.md: 0.06 to 0.10. */
  opacity?: number;
  /** Slow rotation, one turn per 120 seconds. Ignored for "band". */
  drift?: boolean;
  /** Reverse the drift direction (for a second, counter-rotating layer). */
  reverse?: boolean;
  strokeWidth?: number;
  className?: string;
};

export function Guilloche({ variant = "rosette", size = 400, opacity = 0.08, drift = true, reverse, strokeWidth = 0.6, className }: GuillocheProps) {
  const band = variant === "band";
  const layers = layersFor(variant);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox={band ? "0 0 400 80" : "0 0 400 400"}
      width={band ? undefined : size}
      height={band ? undefined : size}
      preserveAspectRatio={band ? "none" : undefined}
      className={cn(
        "pointer-events-none select-none",
        drift && !band && "animate-guilloche motion-reduce:animate-none",
        reverse && "[animation-direction:reverse]",
        className,
      )}
      style={{ opacity, transformOrigin: "50% 50%" }}
    >
      <defs>
        {layers.map((l, i) => (
          <path key={i} id={`gl${uid}${i}`} d={l.d} vectorEffect="non-scaling-stroke" />
        ))}
      </defs>
      <g fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round">
        {layers.flatMap((l, i) =>
          l.uses.map((u, j) => (
            <use
              key={`${i}-${j}`}
              href={`#gl${uid}${i}`}
              vectorEffect="non-scaling-stroke"
              transform={u.scale === 1 && u.rotate === 0 ? undefined : `rotate(${u.rotate} 200 200) translate(200 200) scale(${u.scale}) translate(-200 -200)`}
            />
          )),
        )}
      </g>
    </svg>
  );
}
