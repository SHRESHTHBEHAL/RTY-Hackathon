import { PageSkeleton } from "@/components/business/Skeletons";

export default function Loading() {
  return <PageSkeleton rows={10} label="Loading activity" />;
}
