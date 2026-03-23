"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import type { UserPreferences } from "@/lib/types";

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      api.user.preferences().then(setPrefs);
    }
  }, [user]);

  if (!user || !prefs) {
    return (
      <>
        <Topbar title="Settings" subtitle="Customize your SimuAlpha experience" />
        <div className="p-6 text-sm text-text-tertiary">
          {authLoading ? "Loading..." : !user ? "Redirecting to login..." : "Loading preferences..."}
        </div>
      </>
    );
  }

  async function handleSave() {
    if (!prefs) return;
    setSaving(true);
    setSaved(false);
    await api.user.updatePreferences(prefs);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <>
      <Topbar title="Settings" subtitle="Customize your SimuAlpha experience" />
      <div className="p-6 space-y-6 max-w-2xl">
        {/* Profile */}
        <Card>
          <CardTitle className="mb-4">Profile</CardTitle>
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <span className="text-xs text-text-tertiary">Name</span>
              <span className="text-xs text-text-primary">{user.full_name}</span>
            </div>
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <span className="text-xs text-text-tertiary">Email</span>
              <span className="text-xs text-text-primary font-mono">{user.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-tertiary">Member since</span>
              <span className="text-xs text-text-primary">
                {new Date(user.created_at).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
        </Card>

        {/* Preferences */}
        <Card>
          <CardTitle className="mb-4">Simulation Preferences</CardTitle>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">
                Default Symbol
              </label>
              <input
                type="text"
                value={prefs.default_symbol}
                onChange={(e) => setPrefs({ ...prefs, default_symbol: e.target.value.toUpperCase() })}
                className="w-full max-w-xs rounded-md border border-border-default bg-surface-2 px-3 py-2 text-sm font-mono text-text-primary focus:border-accent-blue focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">
                Default Time Horizon
              </label>
              <select
                value={prefs.default_time_horizon}
                onChange={(e) => setPrefs({ ...prefs, default_time_horizon: e.target.value })}
                className="w-full max-w-xs rounded-md border border-border-default bg-surface-2 px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
              >
                <option value="intraday">Intraday</option>
                <option value="1-3 days">1-3 Days</option>
                <option value="1 week">1 Week</option>
                <option value="2-4 weeks">2-4 Weeks</option>
                <option value="1-3 months">1-3 Months</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">
                Signal View
              </label>
              <select
                value={prefs.preferred_signal_view}
                onChange={(e) => setPrefs({ ...prefs, preferred_signal_view: e.target.value })}
                className="w-full max-w-xs rounded-md border border-border-default bg-surface-2 px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
              >
                <option value="compact">Compact</option>
                <option value="detailed">Detailed</option>
                <option value="chart">Chart</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">
                Landing Page
              </label>
              <select
                value={prefs.landing_page}
                onChange={(e) => setPrefs({ ...prefs, landing_page: e.target.value })}
                className="w-full max-w-xs rounded-md border border-border-default bg-surface-2 px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
              >
                <option value="dashboard">Dashboard</option>
                <option value="regime">Regime</option>
                <option value="signals">Signals</option>
                <option value="actors">Actors</option>
                <option value="scenarios">Scenarios</option>
              </select>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-accent-blue px-4 py-2 text-sm font-medium text-white hover:bg-accent-blue/90 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save preferences"}
            </button>
            {saved && (
              <span className="text-xs text-accent-green">Saved</span>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
