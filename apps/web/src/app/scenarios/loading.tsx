import { CardSkeleton } from "@/components/ui/skeleton";

export default function ScenariosLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="h-14 border-b border-border-subtle" />
      <CardSkeleton />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}
