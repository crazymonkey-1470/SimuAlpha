const API_URL = import.meta.env.VITE_API_URL || '';

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  scan: (tickers) => request('/api/scan', {
    method: 'POST',
    body: JSON.stringify({ tickers }),
  }),

  getResults: () => request('/api/results'),

  getTicker: (symbol) => request(`/api/ticker/${symbol}`),

  getWatchlist: () => request('/api/watchlist'),

  addToWatchlist: (ticker, notes) => request('/api/watchlist', {
    method: 'POST',
    body: JSON.stringify({ ticker, notes }),
  }),

  removeFromWatchlist: (ticker) => request(`/api/watchlist/${ticker}`, {
    method: 'DELETE',
  }),

  health: () => request('/api/health'),
};
