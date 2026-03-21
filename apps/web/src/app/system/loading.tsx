import { CardSkeleton } from "@/components/ui/skeleton";

export default function SystemLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="h-14 border-b border-border-subtle" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <CardSkeleton />
    </div>
  );
}
