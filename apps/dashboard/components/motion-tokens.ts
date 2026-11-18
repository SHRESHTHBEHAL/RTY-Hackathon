/**
 * Motion tokens from DESIGN.md, for `motion/react`. CSS uses the matching
 * custom properties in globals.css (--ease-out, --dur-quick, ...).
 */
import type { Transition } from "motion/react";

export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

export const DUR = { quick: 0.12, standard: 0.2, slow: 0.32 } as const;

/** Exits run at 60 percent of the entrance. */
export const exitOf = (seconds: number) => seconds * 0.6;

export const SPRING: Transition = { type: "spring", bounce: 0, duration: 0.4 };
/** Only for token landing, refusal bounce and ticket punch. */
export const SPRING_LANDING: Transition = { type: "spring", bounce: 0.2, duration: 0.45 };

export const standard: Transition = { duration: DUR.standard, ease: EASE_OUT };
export const slow: Transition = { duration: DUR.slow, ease: EASE_OUT };

/** Form error shake: 3 oscillations, 8px, 320ms. */
export const SHAKE_X = [0, -8, 8, -8, 8, -8, 8, 0];
export const SHAKE: Transition = { duration: DUR.slow, ease: "easeInOut" };
