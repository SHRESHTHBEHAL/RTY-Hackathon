import { PageSkeleton } from "@/components/business/Skeletons";

export default function Loading() {
  return <PageSkeleton hero passes={3} rows={5} label="Loading overview" />;
}
