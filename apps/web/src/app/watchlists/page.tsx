"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import type { WatchlistOut } from "@/lib/types";

export default function WatchlistsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [watchlists, setWatchlists] = useState<WatchlistOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newSymbol, setNewSymbol] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      api.watchlists.list().then((res) => {
        setWatchlists(res.watchlists);
        setLoading(false);
      });
    }
  }, [user]);

  if (!user) return null;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    const wl = await api.watchlists.create({ name: newName.trim() });
    if (wl) setWatchlists((prev) => [wl, ...prev]);
    setNewName("");
    setCreating(false);
  }

  async function handleAddSymbol(watchlistId: string) {
    if (!newSymbol.trim()) return;
    await api.watchlists.addItem(watchlistId, newSymbol.trim().toUpperCase());
    const updated = await api.watchlists.get(watchlistId);
    if (updated) setWatchlists((prev) => prev.map((wl) => (wl.id === watchlistId ? updated : wl)));
    setNewSymbol("");
  }

  async function handleRemoveItem(watchlistId: string, itemId: string) {
    await api.watchlists.removeItem(watchlistId, itemId);
    const updated = await api.watchlists.get(watchlistId);
    if (updated) setWatchlists((prev) => prev.map((wl) => (wl.id === watchlistId ? updated : wl)));
  }

  async function handleDelete(watchlistId: string) {
    await api.watchlists.delete(watchlistId);
    setWatchlists((prev) => prev.filter((wl) => wl.id !== watchlistId));
  }

  return (
    <>
      <Topbar title="Watchlists" subtitle="Manage your symbol watchlists" />
      <div className="p-6 space-y-6">
        {/* Create new */}
        <Card>
          <CardTitle className="mb-3">Create Watchlist</CardTitle>
          <form onSubmit={handleCreate} className="flex gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Watchlist name"
              className="flex-1 rounded-md border border-border-default bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-blue focus:outline-none"
            />
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="rounded-md bg-accent-blue px-4 py-2 text-sm font-medium text-white hover:bg-accent-blue/90 disabled:opacity-50"
            >
              Create
            </button>
          </form>
        </Card>

        {/* Watchlists */}
        {loading ? (
          <Card><p className="text-xs text-text-tertiary">Loading...</p></Card>
        ) : watchlists.length === 0 ? (
          <Card>
            <EmptyState title="No watchlists" description="Create your first watchlist to start tracking symbols." />
          </Card>
        ) : (
          watchlists.map((wl) => (
            <Card key={wl.id}>
              <CardHeader>
                <div>
                  <CardTitle>{wl.name}</CardTitle>
                  {wl.description && <p className="text-2xs text-text-tertiary mt-0.5">{wl.description}</p>}
                </div>
                <button
                  onClick={() => handleDelete(wl.id)}
                  className="text-2xs text-text-tertiary hover:text-accent-red transition-colors"
                >
                  Delete
                </button>
              </CardHeader>

              {/* Items */}
              <div className="flex flex-wrap gap-2 mb-4">
                {wl.items.map((item) => (
                  <span
                    key={item.id}
                    className="group inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-3 py-1.5 text-xs font-mono font-medium text-text-primary"
                  >
                    {item.symbol}
                    <button
                      onClick={() => handleRemoveItem(wl.id, item.id)}
                      className="hidden group-hover:inline text-text-tertiary hover:text-accent-red"
                      aria-label={`Remove ${item.symbol}`}
                    >
                      &times;
                    </button>
                  </span>
                ))}
                {wl.items.length === 0 && (
                  <p className="text-2xs text-text-tertiary">No symbols added yet.</p>
                )}
              </div>

              {/* Add symbol */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add symbol (e.g. AAPL)"
                  className="flex-1 rounded-md border border-border-default bg-surface-2 px-3 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:border-accent-blue focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddSymbol(wl.id);
                    }
                  }}
                  onChange={(e) => setNewSymbol(e.target.value)}
                />
                <button
                  onClick={() => handleAddSymbol(wl.id)}
                  className="rounded-md border border-border-default bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-3 transition-colors"
                >
                  Add
                </button>
              </div>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
