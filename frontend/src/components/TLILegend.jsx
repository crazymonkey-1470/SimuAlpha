import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function TLILegend() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="w-6 h-6 flex items-center justify-center border border-border text-text-secondary hover:text-green hover:border-green/40 transition-colors font-mono text-[10px]"
        title="TLI Methodology">?</button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50" onClick={() => setOpen(false)} />
            <motion.div initial={{ opacity: 0, x: 300 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 300 }}
              transition={{ type: 'spring', damping: 25 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-bg border-l border-border z-50 overflow-y-auto p-5">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-heading font-bold text-base text-green">TLI METHODOLOGY</h2>
                <button onClick={() => setOpen(false)} className="text-text-secondary hover:text-text-primary font-mono text-sm">✕</button>
              </div>

              <div className="space-y-5 text-[11px] font-mono text-text-secondary leading-relaxed">
                <p className="text-text-primary text-xs">
                  The Long Investor strategy identifies stocks that are both fundamentally strong
                  and technically beaten down to key moving average support zones. The best entries
                  occur when price reaches the 200 WMA/MMA — levels where long-term mean reversion
                  creates asymmetric risk/reward opportunities.
                </p>

                <div>
                  <h3 className="text-green mb-2">FUNDAMENTAL SCORE (50 pts)</h3>
                  <div className="space-y-1.5 ml-1">
                    <div><span className="text-text-primary">Revenue Growth</span> (15 pts): &ge;20%=15 &middot; &ge;10%=10 &middot; &gt;0%=5</div>
                    <div><span className="text-text-primary">52w Drawdown</span> (15 pts): &ge;60%=15 &middot; &ge;40%=12 &middot; &ge;25%=8 &middot; &ge;15%=4</div>
                    <div><span className="text-text-primary">P/S Ratio</span> (10 pts): &lt;1=10 &middot; &lt;3=7 &middot; &lt;5=4 &middot; &lt;10=2</div>
                    <div><span className="text-text-primary">P/E Ratio</span> (10 pts): &lt;10=10 &middot; &lt;15=7 &middot; &lt;20=4 &middot; &lt;30=2</div>
                  </div>
                </div>

                <div>
                  <h3 className="text-green mb-2">TECHNICAL SCORE (50 pts)</h3>
                  <div className="space-y-1.5 ml-1">
                    <div><span className="text-text-primary">vs 200 WMA</span> (25 pts): at/below=25 &middot; &le;3%=20 &middot; &le;8%=12 &middot; &le;15%=5</div>
                    <div><span className="text-text-primary">vs 200 MMA</span> (25 pts): at/below=25 &middot; &le;3%=20 &middot; &le;8%=12 &middot; &le;15%=5</div>
                  </div>
                </div>

                <div>
                  <h3 className="text-green mb-2">ENTRY ZONE LOGIC</h3>
                  <div className="space-y-1 ml-1">
                    <div><span className="text-green">Best entry:</span> price at/below BOTH 200WMA and 200MMA</div>
                    <div><span className="text-amber">Good entry:</span> price at/below ONE of the two MAs</div>
                    <div><span className="text-text-primary">Approaching:</span> within 3% of either MA</div>
                    <div><span className="text-text-secondary">Wait:</span> more than 8% above both MAs</div>
                  </div>
                </div>

                <div className="border-t border-border pt-3">
                  <h3 className="text-text-primary mb-2">SIGNALS</h3>
                  <div className="space-y-1">
                    <div><span className="text-green">75–100</span> LOAD THE BOAT — fundamental + technical sweet spot</div>
                    <div><span className="text-amber">60–74</span> ACCUMULATE — building position zone</div>
                    <div><span className="text-text-secondary">40–59</span> WATCH — monitor for improvement</div>
                    <div><span className="text-text-dim">&lt;40</span> PASS — filtered out</div>
                  </div>
                </div>

                <div className="border-t border-border pt-3">
                  <h3 className="text-text-primary mb-2">TELEGRAM ALERTS</h3>
                  <p>The system fires real-time alerts when: a stock reaches LOAD THE BOAT, a signal upgrades,
                  or price crosses below the 200WMA or 200MMA for the first time.</p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
