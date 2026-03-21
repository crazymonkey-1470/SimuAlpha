"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const COMMON_SYMBOLS = [
  "SPY", "QQQ", "IWM", "DIA", "TLT", "GLD", "SLV", "USO",
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA",
  "JPM", "BAC", "GS", "XLF", "XLE", "XLK", "XLV", "XLU",
  "VIX", "HYG", "LQD", "BTC-USD", "ETH-USD",
];

interface SymbolSearchProps {
  onSelect?: (symbol: string) => void;
  placeholder?: string;
  className?: string;
}

export function SymbolSearch({ onSelect, placeholder = "Search symbol...", className }: SymbolSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? COMMON_SYMBOLS.filter((s) => s.toLowerCase().includes(query.toLowerCase()))
    : COMMON_SYMBOLS.slice(0, 12);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(sym: string) {
    setQuery("");
    setOpen(false);
    if (onSelect) {
      onSelect(sym);
    } else {
      router.push(`/symbols/${sym}`);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && query.trim()) {
      e.preventDefault();
      handleSelect(query.trim().toUpperCase());
    }
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full rounded-md border border-border-default bg-surface-2 px-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary focus:border-accent-blue focus:outline-none"
      />
      {open && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border-subtle bg-surface-1 shadow-lg">
          {filtered.length > 0 ? (
            filtered.map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => handleSelect(sym)}
                className="flex w-full items-center px-3 py-2 text-xs text-text-primary hover:bg-surface-2 transition-colors"
              >
                <span className="font-mono font-medium">{sym}</span>
              </button>
            ))
          ) : query.trim() ? (
            <button
              type="button"
              onClick={() => handleSelect(query.trim().toUpperCase())}
              className="flex w-full items-center px-3 py-2 text-xs text-text-primary hover:bg-surface-2"
            >
              Go to <span className="ml-1 font-mono font-medium">{query.trim().toUpperCase()}</span>
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
