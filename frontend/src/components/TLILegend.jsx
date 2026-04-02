import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function TLILegend() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-7 h-7 flex items-center justify-center border border-border text-text-secondary hover:text-green hover:border-green/40 transition-colors font-mono text-xs"
        title="TLI Scoring Methodology"
      >
        ?
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, x: 300 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 300 }}
              transition={{ type: 'spring', damping: 25 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-sm bg-bg border-l border-border z-50 overflow-y-auto p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-heading font-bold text-lg text-green">TLI METHODOLOGY</h2>
                <button
                  onClick={() => setOpen(false)}
                  className="text-text-secondary hover:text-text-primary font-mono"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-5 text-xs font-mono text-text-secondary leading-relaxed">
                <div>
                  <h3 className="text-green mb-2 text-sm">FUNDAMENTAL SCORE (50 pts)</h3>
                  <div className="space-y-2 ml-1">
                    <div>
                      <div className="text-text-primary mb-0.5">Revenue YoY Growth (15 pts max)</div>
                      <div>&gt;15% = 15pts &middot; &gt;8% = 10pts &middot; &gt;0% = 5pts</div>
                    </div>
                    <div>
                      <div className="text-text-primary mb-0.5">Price vs 52-Week High (15 pts max)</div>
                      <div>&gt;50% below = 15pts &middot; &gt;30% = 10pts &middot; &gt;15% = 5pts</div>
                    </div>
                    <div>
                      <div className="text-text-primary mb-0.5">P/S Ratio (10 pts max)</div>
                      <div>&lt;2 = 10pts &middot; &lt;5 = 5pts</div>
                    </div>
                    <div>
                      <div className="text-text-primary mb-0.5">P/E Ratio (10 pts max)</div>
                      <div>&lt;15 = 10pts &middot; &lt;20 = 5pts</div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-green mb-2 text-sm">TECHNICAL SCORE (50 pts)</h3>
                  <div className="space-y-2 ml-1">
                    <div>
                      <div className="text-text-primary mb-0.5">Price vs 200 WMA (25 pts max)</div>
                      <div>At/below = 25pts &middot; Within 5% = 15pts &middot; Within 15% = 5pts</div>
                    </div>
                    <div>
                      <div className="text-text-primary mb-0.5">Price vs 200 MMA (25 pts max)</div>
                      <div>At/below = 25pts &middot; Within 5% = 15pts &middot; Within 10% = 5pts</div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-border pt-4">
                  <h3 className="text-text-primary mb-2 text-sm">SIGNALS</h3>
                  <div className="space-y-1">
                    <div><span className="text-green">75–100</span> &nbsp;LOAD THE BOAT</div>
                    <div><span className="text-amber">60–74</span> &nbsp;ACCUMULATE</div>
                    <div><span className="text-text-secondary">0–59</span> &nbsp;WATCH</div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
