import { PageSkeleton } from "@/components/business/Skeletons";

export default function Loading() {
  return <PageSkeleton rows={4} label="Loading agents" />;
}
