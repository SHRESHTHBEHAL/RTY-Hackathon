import { ButtonLink } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { ReceiptText } from "lucide-react";

export default function ChargeNotFound() {
  return (
    <>
      <PageHeader eyebrow="Seller" title="Charge" />
      <div className="rounded-[14px] border border-line bg-card">
        <EmptyState
          icon={ReceiptText}
          title="We cannot find that charge"
          body="It may belong to another seller, or the link is wrong."
          action={<ButtonLink href="/seller/charges">Back to charges</ButtonLink>}
        />
      </div>
    </>
  );
}
