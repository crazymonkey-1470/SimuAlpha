/**
 * AdminApprovalDashboard.tsx
 *
 * Admin UI for the weight-adjustment approval workflow.
 * Talks to the TIER routes (tier_routes.js) via the x-admin-key header.
 *
 * Endpoints used:
 *   GET  /api/tier/learning/pending
 *   GET  /api/tier/learning/history
 *   GET  /api/tier/learning/principles            (public)
 *   POST /api/tier/learning/approve/:id
 *   POST /api/tier/learning/reject/:id
 *   POST /api/tier/learning/rollback/:id
 *   POST /api/tier/learning/run-cycle
 *
 * No external state management — plain React hooks. Tailwind for styling,
 * dark theme to match the landing page.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, CheckCircle2, XCircle, Loader2, RefreshCw,
  TrendingUp, TrendingDown, Minus, Play, RotateCcw, Filter,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────
interface PendingAdjustment {
  id: string;
  factor: string;
  current_weight: number;
  proposed_weight: number;
  change_pct: number;
  status: string;
  basis_json: {
    observed_accuracy?: number;
    baseline_accuracy?: number;
    sample_size?: number;
    successes?: number;
  };
  created_at: string;
}

interface HistoryItem extends PendingAdjustment {
  approved_by?: string | null;
  approved_at?: string | null;
  applied_at?: string | null;
  rejected_at?: string | null;
  rejected_reason?: string | null;
  rolled_back_at?: string | null;
  rolled_back_from_id?: string | null;
}

interface Principle {
  principle: string;
  samples: number;
  confidence: number;
  discovered_at?: string;
}

interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
}

type SortKey = 'accuracy' | 'change_pct' | 'samples';
type HistoryFilter = 'ALL' | 'APPLIED' | 'APPROVED' | 'REJECTED' | 'ROLLED_BACK';

const ADMIN_KEY_STORAGE = 'simualpha.admin.key';
const API_BASE = '/api/tier/learning';
const MAX_RETRIES = 2;

// ─────────────────────────────────────────────────────────
// Fetch wrapper with retry + admin-key injection
// ─────────────────────────────────────────────────────────
async function apiFetch<T>(
  adminKey: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...(init.headers || {}),
    'x-admin-key': adminKey,
  };

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
      if (res.status === 401) {
        throw new Error('Unauthorized — check admin key');
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 120) || res.statusText}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err as Error;
      if ((err as Error).message.startsWith('Unauthorized')) throw err;
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr || new Error('Unknown fetch error');
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────
const fmtPct = (n: number | null | undefined, digits = 2) =>
  n == null ? '—' : `${Number(n).toFixed(digits)}%`;
const fmtWeight = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toFixed(4);
const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—';

function isEligible(row: PendingAdjustment): { ok: boolean; reason?: string } {
  const acc = row.basis_json?.observed_accuracy ?? 0;
  const n   = row.basis_json?.sample_size ?? 0;
  if (acc < 50) return { ok: false, reason: `Accuracy ${acc}% < 50%` };
  if (n   < 30) return { ok: false, reason: `Samples ${n} < 30` };
  return { ok: true };
}

function changeTone(pct: number): 'up' | 'down' | 'flat' {
  if (pct >  1) return 'up';
  if (pct < -1) return 'down';
  return 'flat';
}

// ─────────────────────────────────────────────────────────
// Toast hook
// ─────────────────────────────────────────────────────────
function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return { toasts, push };
}

// ─────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────
export default function AdminApprovalDashboard() {
  const [adminKey, setAdminKey]   = useState<string>(() => localStorage.getItem(ADMIN_KEY_STORAGE) || '');
  const [keyDraft, setKeyDraft]   = useState<string>('');
  const [pending, setPending]     = useState<PendingAdjustment[]>([]);
  const [history, setHistory]     = useState<HistoryItem[]>([]);
  const [principles, setPrinciples] = useState<Principle[]>([]);
  const [loading, setLoading]     = useState<boolean>(false);
  const [cycleRunning, setCycleRunning] = useState<boolean>(false);
  const [cycleResult, setCycleResult]   = useState<any>(null);
  const [sortKey, setSortKey]     = useState<SortKey>('accuracy');
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('desc');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('ALL');
  const [rejectModal, setRejectModal] = useState<{ id: string; factor: string } | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const { toasts, push } = useToasts();

  const authed = adminKey.length > 0;

  // ────────── Load all data ──────────
  const loadAll = useCallback(async () => {
    if (!authed) return;
    setLoading(true);
    try {
      const [p, h, pr] = await Promise.all([
        apiFetch<PendingAdjustment[]>(adminKey, '/pending'),
        apiFetch<HistoryItem[]>(adminKey, '/history'),
        apiFetch<{ learned: Principle[] }>(adminKey, '/principles').then((r) => r.learned || []),
      ]);
      setPending(p || []);
      setHistory(h || []);
      setPrinciples(pr || []);
    } catch (err) {
      const msg = (err as Error).message;
      push('error', msg);
      if (msg.startsWith('Unauthorized')) {
        setAdminKey('');
        localStorage.removeItem(ADMIN_KEY_STORAGE);
      }
    } finally {
      setLoading(false);
    }
  }, [adminKey, authed, push]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ────────── Actions ──────────
  const saveAdminKey = () => {
    if (!keyDraft.trim()) return;
    localStorage.setItem(ADMIN_KEY_STORAGE, keyDraft.trim());
    setAdminKey(keyDraft.trim());
    setKeyDraft('');
  };

  const clearAdminKey = () => {
    localStorage.removeItem(ADMIN_KEY_STORAGE);
    setAdminKey('');
    setPending([]); setHistory([]); setPrinciples([]);
  };

  const approve = async (row: PendingAdjustment) => {
    try {
      await apiFetch(adminKey, `/approve/${row.id}`, { method: 'POST' });
      push('success', `Approved: ${row.factor}`);
      await loadAll();
    } catch (err) {
      push('error', `Approve failed: ${(err as Error).message}`);
    }
  };

  const reject = async () => {
    if (!rejectModal) return;
    try {
      await apiFetch(adminKey, `/reject/${rejectModal.id}`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason || 'No reason provided' }),
      });
      push('success', `Rejected: ${rejectModal.factor}`);
      setRejectModal(null);
      setRejectReason('');
      await loadAll();
    } catch (err) {
      push('error', `Reject failed: ${(err as Error).message}`);
    }
  };

  const rollback = async (row: HistoryItem) => {
    if (!confirm(`Roll back adjustment for ${row.factor}? This inserts a reverse entry.`)) return;
    try {
      await apiFetch(adminKey, `/rollback/${row.id}`, { method: 'POST' });
      push('success', `Rolled back: ${row.factor}`);
      await loadAll();
    } catch (err) {
      push('error', `Rollback failed: ${(err as Error).message}`);
    }
  };

  const runCycle = async () => {
    setCycleRunning(true);
    setCycleResult(null);
    try {
      const result = await apiFetch<any>(adminKey, '/run-cycle', { method: 'POST' });
      setCycleResult(result);
      push('success', `Cycle complete: ${result?.proposals?.length || 0} proposals`);
      await loadAll();
    } catch (err) {
      push('error', `Cycle failed: ${(err as Error).message}`);
    } finally {
      setCycleRunning(false);
    }
  };

  // ────────── Derived data ──────────
  const sortedPending = useMemo(() => {
    const rows = [...pending];
    rows.sort((a, b) => {
      const av = sortKey === 'accuracy' ? (a.basis_json?.observed_accuracy ?? 0)
               : sortKey === 'samples'  ? (a.basis_json?.sample_size ?? 0)
               : Math.abs(a.change_pct);
      const bv = sortKey === 'accuracy' ? (b.basis_json?.observed_accuracy ?? 0)
               : sortKey === 'samples'  ? (b.basis_json?.sample_size ?? 0)
               : Math.abs(b.change_pct);
      return sortDir === 'desc' ? bv - av : av - bv;
    });
    return rows;
  }, [pending, sortKey, sortDir]);

  const filteredHistory = useMemo(() => {
    const rows = historyFilter === 'ALL'
      ? history
      : history.filter((h) => h.status === historyFilter);
    return rows.slice(0, 10);
  }, [history, historyFilter]);

  const sortedPrinciples = useMemo(
    () => [...principles].sort((a, b) => b.confidence - a.confidence),
    [principles],
  );

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  // ────────── Render: unauth gate ──────────
  if (!authed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-slate-900/70 border border-slate-700 rounded-xl p-8 backdrop-blur">
          <h1 className="text-2xl font-bold mb-2">SimuAlpha Admin</h1>
          <p className="text-slate-400 text-sm mb-6">Enter your admin API key to continue.</p>
          <input
            type="password"
            autoFocus
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveAdminKey()}
            placeholder="x-admin-key"
            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={saveAdminKey}
            disabled={!keyDraft.trim()}
            className="w-full mt-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg font-medium transition"
          >
            Unlock Dashboard
          </button>
          <p className="text-xs text-slate-500 mt-4">
            The key is stored in localStorage and sent as the <code>x-admin-key</code> header.
          </p>
        </div>
      </div>
    );
  }

  // ────────── Render: dashboard ──────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center gap-3 justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Approval Dashboard</h1>
            <p className="text-xs text-slate-400">Weight-adjustment workflow</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runCycle}
              disabled={cycleRunning}
              className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition"
            >
              {cycleRunning
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Play className="w-4 h-4" />}
              Run Learning Cycle
            </button>
            <button
              onClick={loadAll}
              disabled={loading}
              aria-label="Refresh"
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={clearAdminKey}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-300 transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">
        {/* Cycle result banner */}
        {cycleResult && (
          <div className="bg-emerald-900/30 border border-emerald-700 rounded-xl p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
            <div className="text-sm">
              <div className="font-medium">Learning cycle complete</div>
              <div className="text-slate-300">
                {cycleResult.proposals?.length ?? 0} proposals generated
                {typeof cycleResult.awaiting_approval === 'number' &&
                  ` · ${cycleResult.awaiting_approval} awaiting approval`}
                {typeof cycleResult.total_outcomes_analyzed === 'number' &&
                  ` · ${cycleResult.total_outcomes_analyzed} outcomes analyzed`}
              </div>
            </div>
          </div>
        )}

        {/* Pending adjustments */}
        <section className="bg-slate-900/50 border border-slate-700 rounded-xl overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Pending Adjustments</h2>
            <span className="text-xs text-slate-400">{sortedPending.length} awaiting review</span>
          </div>

          {sortedPending.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              {loading ? 'Loading…' : 'No adjustments pending. Run the learning cycle to generate proposals.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/50 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="text-left px-4 py-3">Factor</th>
                    <th className="text-right px-4 py-3">Current</th>
                    <th className="text-right px-4 py-3">Proposed</th>
                    <SortableTh label="Change" active={sortKey === 'change_pct'} dir={sortDir} onClick={() => toggleSort('change_pct')} />
                    <SortableTh label="Accuracy" active={sortKey === 'accuracy'} dir={sortDir} onClick={() => toggleSort('accuracy')} />
                    <SortableTh label="Samples" active={sortKey === 'samples'} dir={sortDir} onClick={() => toggleSort('samples')} />
                    <th className="text-right px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPending.map((row) => {
                    const eligible = isEligible(row);
                    const tone = changeTone(row.change_pct);
                    const toneBg =
                      tone === 'up'   ? 'bg-emerald-900/20'
                    : tone === 'down' ? 'bg-rose-900/20'
                                      : 'bg-amber-900/10';
                    const toneText =
                      tone === 'up'   ? 'text-emerald-400'
                    : tone === 'down' ? 'text-rose-400'
                                      : 'text-amber-300';
                    const ToneIcon =
                      tone === 'up'   ? TrendingUp
                    : tone === 'down' ? TrendingDown
                                      : Minus;

                    return (
                      <tr key={row.id} className={`border-t border-slate-800 ${toneBg}`}>
                        <td className="px-4 py-3 font-mono text-slate-200">{row.factor}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-300">{fmtWeight(row.current_weight)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-200">{fmtWeight(row.proposed_weight)}</td>
                        <td className={`px-4 py-3 text-right tabular-nums font-medium ${toneText}`}>
                          <span className="inline-flex items-center gap-1">
                            <ToneIcon className="w-3.5 h-3.5" />
                            {fmtPct(row.change_pct)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {fmtPct(row.basis_json?.observed_accuracy)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {row.basis_json?.sample_size ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => approve(row)}
                              disabled={!eligible.ok}
                              title={eligible.reason}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed rounded text-xs font-medium transition"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => setRejectModal({ id: row.id, factor: row.factor })}
                              className="px-3 py-1.5 bg-slate-700 hover:bg-rose-700 rounded text-xs font-medium transition"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Approval history */}
        <section className="bg-slate-900/50 border border-slate-700 rounded-xl overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-700 flex flex-wrap items-center gap-3 justify-between">
            <h2 className="text-lg font-semibold">Approval History</h2>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={historyFilter}
                onChange={(e) => setHistoryFilter(e.target.value as HistoryFilter)}
                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
              >
                <option value="ALL">All</option>
                <option value="APPLIED">Applied</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="ROLLED_BACK">Rolled back</option>
              </select>
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No history for this filter.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/50 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="text-left px-4 py-3">When</th>
                    <th className="text-left px-4 py-3">Factor</th>
                    <th className="text-right px-4 py-3">Change</th>
                    <th className="text-left px-4 py-3">By</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-right px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((h) => (
                    <tr key={h.id} className="border-t border-slate-800">
                      <td className="px-4 py-3 text-slate-400">
                        {fmtDate(h.applied_at || h.approved_at || h.rejected_at || h.rolled_back_at || h.created_at)}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-200">{h.factor}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${
                        h.change_pct > 0 ? 'text-emerald-400' : h.change_pct < 0 ? 'text-rose-400' : 'text-slate-300'
                      }`}>
                        {fmtPct(h.change_pct)}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{h.approved_by || '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={h.status} /></td>
                      <td className="px-4 py-3 text-right">
                        {h.status === 'APPLIED' && (
                          <button
                            onClick={() => rollback(h)}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-amber-700 rounded text-xs transition"
                          >
                            <RotateCcw className="w-3 h-3" /> Rollback
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Learned principles */}
        <section className="bg-slate-900/50 border border-slate-700 rounded-xl p-4 sm:p-6">
          <h2 className="text-lg font-semibold mb-4">Learned Principles</h2>
          {sortedPrinciples.length === 0 ? (
            <p className="text-slate-400 text-sm">No principles recorded yet.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {sortedPrinciples.map((p, i) => (
                <div key={i} className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
                  <p className="text-slate-100 text-sm leading-relaxed">{p.principle}</p>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                    <span>{p.samples} samples</span>
                    <span className={`font-medium ${
                      p.confidence >= 85 ? 'text-emerald-400'
                    : p.confidence >= 70 ? 'text-amber-300'
                                         : 'text-slate-400'
                    }`}>
                      {fmtPct(p.confidence, 0)} confidence
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Reject modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-2">Reject adjustment</h3>
            <p className="text-sm text-slate-400 mb-4">
              Factor <span className="font-mono text-slate-200">{rejectModal.factor}</span>
            </p>
            <textarea
              autoFocus
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Why is this being rejected?"
              rows={3}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm focus:outline-none focus:border-rose-500"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setRejectModal(null); setRejectReason(''); }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-sm"
              >
                Cancel
              </button>
              <button
                onClick={reject}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 rounded text-sm font-medium"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className={`flex items-start gap-2 px-4 py-3 rounded-lg border shadow-lg backdrop-blur text-sm ${
              t.kind === 'success' ? 'bg-emerald-900/80 border-emerald-700'
            : t.kind === 'error'   ? 'bg-rose-900/80 border-rose-700'
                                   : 'bg-slate-900/80 border-slate-700'
            }`}
          >
            {t.kind === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" />
            : t.kind === 'error'   ? <XCircle     className="w-4 h-4 mt-0.5 text-rose-400 shrink-0" />
                                   : <AlertCircle className="w-4 h-4 mt-0.5 text-slate-300 shrink-0" />}
            <span className="text-slate-100">{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Small sub-components
// ─────────────────────────────────────────────────────────
function SortableTh({
  label, active, dir, onClick,
}: { label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void }) {
  return (
    <th className="text-right px-4 py-3">
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-white transition ${
          active ? 'text-white' : 'text-slate-400'
        }`}
      >
        {label}
        {active && <span className="text-[10px]">{dir === 'desc' ? '▼' : '▲'}</span>}
      </button>
    </th>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string }> = {
    APPLIED:     { bg: 'bg-emerald-900/40 border-emerald-700', text: 'text-emerald-300' },
    APPROVED:    { bg: 'bg-blue-900/40 border-blue-700',       text: 'text-blue-300' },
    REJECTED:    { bg: 'bg-rose-900/40 border-rose-700',       text: 'text-rose-300' },
    ROLLED_BACK: { bg: 'bg-amber-900/40 border-amber-700',     text: 'text-amber-300' },
    PENDING_APPROVAL: { bg: 'bg-slate-800 border-slate-700',   text: 'text-slate-300' },
  };
  const c = config[status] || config.PENDING_APPROVAL;
  return (
    <span className={`inline-block px-2 py-0.5 rounded border text-xs ${c.bg} ${c.text}`}>
      {status.replace('_', ' ')}
    </span>
  );
}
