import { PageSkeleton } from "@/components/business/Skeletons";

export default function Loading() {
  return <PageSkeleton rows={3} label="Loading spending rules" />;
}
