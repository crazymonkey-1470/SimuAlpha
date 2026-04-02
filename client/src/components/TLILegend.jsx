import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function TLILegend() {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-border bg-bg-card">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-mono uppercase tracking-wider text-text-secondary hover:text-accent transition-colors"
      >
        <span>TLI Methodology</span>
        <span className="text-accent">{open ? '−' : '+'}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 text-xs font-mono text-text-secondary">
              <div>
                <div className="text-accent mb-1">FUNDAMENTAL SCORE (50 pts)</div>
                <ul className="space-y-0.5 ml-2">
                  <li>Revenue Growth YoY: &gt;15% = 15pts, &gt;8% = 10pts, &gt;0% = 5pts</li>
                  <li>P/S Ratio below avg: yes = 10pts</li>
                  <li>P/E below median: yes = 10pts</li>
                  <li>Price vs 52w High: &gt;50% below = 15pts, &gt;30% = 10pts, &gt;15% = 5pts</li>
                </ul>
              </div>
              <div>
                <div className="text-accent mb-1">TECHNICAL SCORE (50 pts)</div>
                <ul className="space-y-0.5 ml-2">
                  <li>At/below 200 WMA = 25pts, within 5% = 15pts, within 15% = 5pts</li>
                  <li>At/below 200 MMA = 25pts, within 5% = 15pts, within 10% = 5pts</li>
                </ul>
              </div>
              <div className="pt-2 border-t border-border">
                <div><span className="text-accent">75–100</span> LOAD THE BOAT</div>
                <div><span className="text-amber">60–74</span> ACCUMULATE</div>
                <div><span className="text-text-secondary">0–59</span> WATCH</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
