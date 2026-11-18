import { Big_Shoulders, JetBrains_Mono, Onest } from "next/font/google";

/**
 * DESIGN.md names "Big Shoulders Display". Google Fonts now ships it as
 * "Big Shoulders" with an optical-size axis; at display sizes the opsz axis
 * selects the Display cut (font-optical-sizing: auto).
 */
export const display = Big_Shoulders({
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz"],
  variable: "--font-big-shoulders",
  adjustFontFallback: false,
  display: "swap",
});

export const sans = Onest({
  subsets: ["latin"],
  weight: "variable",
  variable: "--font-onest",
  display: "swap",
});

export const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
});
