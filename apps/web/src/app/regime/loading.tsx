import { CardSkeleton } from "@/components/ui/skeleton";

export default function RegimeLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="h-14 border-b border-border-subtle" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><CardSkeleton /></div>
        <CardSkeleton />
      </div>
      <CardSkeleton />
      <CardSkeleton />
    </div>
  );
}
