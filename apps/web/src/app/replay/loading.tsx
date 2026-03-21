import { CardSkeleton } from "@/components/ui/skeleton";

export default function ReplayLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="h-14 border-b border-border-subtle" />
      <CardSkeleton />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <CardSkeleton />
        <div className="lg:col-span-2"><CardSkeleton /></div>
      </div>
      <CardSkeleton />
      <CardSkeleton />
    </div>
  );
}
