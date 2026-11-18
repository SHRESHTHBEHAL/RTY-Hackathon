"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ExternalLink, PackagePlus, Pencil, Power } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, useSuccessFlash } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { EmptyState } from "@/components/EmptyState";
import { Field } from "@/components/Field";
import { Input, Textarea } from "@/components/Input";
import { PageHeader } from "@/components/PageHeader";
import { SectionReveal } from "@/components/SectionReveal";
import { StatusBadge } from "@/components/Badge";
import { TicketCard } from "@/components/TicketCard";
import { toast } from "@/components/Toast";
import { DUR, EASE_OUT, SPRING, exitOf } from "@/components/motion-tokens";
import { createServiceAction, updateServiceAction } from "@/app/seller/actions";
import { FormError } from "./bits";
import { sleep, useGuard } from "./hooks";
import type { Service } from "./result";

type Errors = Partial<Record<"name" | "description" | "priceNote" | "url" | "form", string>>;

function ServiceDialog({ open, service, onClose, onSaved }: { open: boolean; service: Service | null; onClose: () => void; onSaved: (s: Service) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceNote, setPriceNote] = useState("");
  const [url, setUrl] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [errKey, setErrKey] = useState(0);
  const { run, pending } = useGuard();
  const [ok, flash] = useSuccessFlash();

  useEffect(() => {
    if (!open) return;
    setName(service?.name ?? "");
    setDescription(service?.description ?? "");
    setPriceNote(service?.priceNote ?? "");
    setUrl(service?.url ?? "");
    setErrors({});
  }, [open, service]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      const next: Errors = {};
      if (!name.trim()) next.name = "Enter a name for this service.";
      try {
        const u = new URL(url.trim());
        if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
      } catch {
        next.url = "Enter the full address of the service, starting with https://.";
      }
      if (Object.keys(next).length) {
        setErrors(next);
        setErrKey((k) => k + 1);
        return;
      }
      const input = { name, description, priceNote, url };
      const r = service ? await updateServiceAction(service.id, input) : await createServiceAction(input);
      if (!r.ok) {
        const f = r.field as keyof Errors | undefined;
        setErrors(f && f in { name: 1, description: 1, priceNote: 1, url: 1 } ? { [f]: r.message } : { form: r.message });
        setErrKey((k) => k + 1);
        return;
      }
      setErrors({});
      flash();
      await sleep(700);
      onSaved(r.data);
      toast.success(service ? "Service saved" : "Service created", r.data.name);
      onClose();
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissable={!pending}
      title={service ? "Edit service" : "Create a service"}
      description="Agents see this when they look for sellers."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="service-form" loading={pending} success={ok}>
            {service ? "Save changes" : "Create service"}
          </Button>
        </>
      }
    >
      <form id="service-form" onSubmit={submit} noValidate className="flex flex-col gap-4 pb-2">
        <Field label="Name" error={errors.name} errorKey={errKey}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" maxLength={80} />
        </Field>
        <Field label="Description" optional error={errors.description} errorKey={errKey}>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={500} />
        </Field>
        <Field label="Price note" optional helper="What one payment buys, in your words. For example “$0.01 per message”." error={errors.priceNote} errorKey={errKey}>
          <Input value={priceNote} onChange={(e) => setPriceNote(e.target.value)} autoComplete="off" maxLength={80} />
        </Field>
        <Field label="Service address" helper="Where agents send requests." error={errors.url} errorKey={errKey}>
          <Input mono inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" autoComplete="off" spellCheck={false} />
        </Field>
        <FormError message={errors.form} errorKey={errKey} />
      </form>
    </Dialog>
  );
}

function ServiceTicket({ service, onEdit, onChange }: { service: Service; onEdit: () => void; onChange: (s: Service) => void }) {
  const { run, pending } = useGuard();
  async function toggle() {
    await run(async () => {
      const r = await updateServiceAction(service.id, { active: !service.active });
      if (!r.ok) {
        toast.error(service.active ? "Could not deactivate" : "Could not activate", r.message);
        return;
      }
      onChange(r.data);
      toast.success(r.data.active ? "Service is active" : "Service is off", r.data.active ? "Agents can find it again." : "Agents cannot find it until you turn it back on.");
    });
  }
  return (
    <TicketCard
      as="article"
      aria-label={service.name}
      className={service.active ? undefined : "opacity-80"}
      stub={
        <>
          <span className="min-w-0 flex-1 truncate font-mono text-[13px]" title={service.id}>
            {service.id}
          </span>
          <Button variant="ghost" icon={<Pencil size={18} strokeWidth={1.75} />} onClick={onEdit} aria-label={`Edit ${service.name}`}>
            Edit
          </Button>
          <Button
            variant="secondary"
            loading={pending}
            icon={<Power size={18} strokeWidth={1.75} />}
            onClick={toggle}
            aria-label={`${service.active ? "Deactivate" : "Activate"} ${service.name}`}
          >
            {service.active ? "Deactivate" : "Activate"}
          </Button>
        </>
      }
      stubClassName="flex-wrap sm:flex-nowrap"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-[28px] leading-none text-ink">{service.name}</h3>
        <StatusBadge status={service.active ? "active" : "disabled"} />
      </div>
      {service.priceNote ? <p className="mt-3 font-mono text-[14px] text-ink">{service.priceNote}</p> : null}
      {service.description ? <p className="mt-2 text-[15px] text-ink-soft">{service.description}</p> : null}
      <p className="mt-4 flex items-center gap-1.5 break-all font-mono text-[13px] text-ink-soft">
        <ExternalLink size={14} strokeWidth={1.75} className="shrink-0" aria-hidden />
        {service.url}
      </p>
    </TicketCard>
  );
}

export function ServicesView({ initial }: { initial: Service[] }) {
  const [services, setServices] = useState(initial);
  const [dialog, setDialog] = useState<{ open: boolean; service: Service | null }>({ open: false, service: null });
  const reduce = useReducedMotion();

  const upsert = (s: Service) =>
    setServices((list) => (list.some((x) => x.id === s.id) ? list.map((x) => (x.id === s.id ? s : x)) : [s, ...list]));

  return (
    <SectionReveal>
      <PageHeader
        eyebrow="Seller"
        title="Services"
        description="What agents can pay you for. Turn a service off and agents stop finding it."
        action={
          <Button icon={<PackagePlus size={20} strokeWidth={1.75} />} onClick={() => setDialog({ open: true, service: null })}>
            Create service
          </Button>
        }
      />
      {services.length === 0 ? (
        <div className="rounded-[14px] border border-line bg-card">
          <EmptyState
            icon={PackagePlus}
            title="No services yet"
            body="A service tells agents what you sell and where to send requests. Create one to start taking payments."
            action={<Button onClick={() => setDialog({ open: true, service: null })}>Create your first service</Button>}
          />
        </div>
      ) : (
        <ul className="grid gap-5 md:grid-cols-2" aria-label="Your services">
          <AnimatePresence initial={false}>
            {services.map((s) => (
              <motion.li
                key={s.id}
                layout={reduce ? false : "position"}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: exitOf(DUR.standard) } }}
                transition={{ ...SPRING, opacity: { duration: DUR.standard, ease: EASE_OUT } }}
                className="min-w-0"
              >
                <ServiceTicket service={s} onEdit={() => setDialog({ open: true, service: s })} onChange={upsert} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      <ServiceDialog open={dialog.open} service={dialog.service} onClose={() => setDialog((d) => ({ ...d, open: false }))} onSaved={upsert} />
    </SectionReveal>
  );
}
