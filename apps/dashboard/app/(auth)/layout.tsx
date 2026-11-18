import { Guilloche } from "@/components/Guilloche";
import { Logo } from "@/components/Logo";
import { LaneIllustration } from "./LaneIllustration";

/**
 * The first screen people see. Ink on the left: the engraved rosette, the
 * one-sentence thesis, and the gate lane playing an example. Paper on the
 * right: the form, cut as a ticket.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
      <section className="surface-ink relative isolate overflow-hidden" aria-label="About Gaitway">
        {/* Two counter-drifting engraved layers */}
        {/* Centred on the panel's top-right corner, so only its sweeping outer rings show. */}
        <Guilloche size={1100} opacity={0.11} className="absolute -right-[550px] -top-[550px] -z-10 text-on-ink-soft" />
        <Guilloche
          variant="seal"
          size={760}
          opacity={0.1}
          reverse
          className="absolute -bottom-[380px] -left-[380px] -z-10 hidden text-pass-bright lg:block"
        />
        <div className="relative mx-auto flex h-full max-w-[720px] flex-col px-5 pb-8 pt-5 sm:px-10 lg:min-h-dvh lg:px-14 lg:pb-12 lg:pt-10">
          <Logo onInk />
          <div className="mt-7 lg:mt-auto">
            <p className="eyebrow text-on-ink-soft!">For AI agents and the sellers they pay</p>
            <h2 className="font-display mt-3 text-[40px] leading-[0.92] text-on-ink sm:mt-4 sm:text-[64px] lg:text-[88px] xl:text-[104px]">
              Every payment
              <br />
              passes a <span className="text-pass-bright">gate</span>
            </h2>
            <p className="mt-4 max-w-[34ch] text-[15px] text-on-ink-soft sm:mt-5 sm:text-[17px] lg:text-lg">
              A business gives each agent a pass with its own balance. The agent pays sellers from it, and never more than it holds.
            </p>
          </div>
          <div className="mt-10 hidden lg:mb-auto lg:mt-14 lg:block">
            <LaneIllustration />
          </div>
        </div>
      </section>
      <main className="paper-grain relative flex items-start justify-center px-4 py-10 sm:px-8 sm:py-16 lg:items-center lg:py-12">
        <div className="w-full max-w-[460px]">{children}</div>
      </main>
    </div>
  );
}
