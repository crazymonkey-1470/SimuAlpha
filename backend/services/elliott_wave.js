/**
 * Elliott Wave Detection Engine
 *
 * Layer 1: Pivot Detection (ZigZag with adaptive sensitivity)
 * Layer 2: Wave Labeler (impulse + corrective validation)
 * Layer 3: Current Wave Position Identification
 * Layer 4: Fibonacci Price Targets
 */

// ─── LAYER 1: PIVOT DETECTION ───

/**
 * Detect significant highs and lows using a ZigZag approach.
 * @param {Array<{date:string, close:number}>} priceArray - sorted oldest→newest
 * @param {number} sensitivity - 0.15 for monthly (Primary), 0.08 for weekly (Intermediate)
 * @returns {Array<{date:string, price:number, type:'HIGH'|'LOW', index:number}>}
 */
function detectPivots(priceArray, sensitivity) {
  if (!priceArray || priceArray.length < 10) return [];

  const pivots = [];
  let direction = null; // 'up' or 'down'
  let lastPivotHigh = { price: -Infinity, index: 0 };
  let lastPivotLow = { price: Infinity, index: 0 };

  for (let i = 1; i < priceArray.length; i++) {
    const curr = priceArray[i].close;
    const prev = priceArray[i - 1].close;
    if (curr == null || prev == null) continue;

    if (direction === null) {
      // Initialize direction
      if (curr > prev) {
        direction = 'up';
        lastPivotLow = { price: prev, index: i - 1 };
      } else {
        direction = 'down';
        lastPivotHigh = { price: prev, index: i - 1 };
      }
      continue;
    }

    if (direction === 'up') {
      if (curr > lastPivotHigh.price) {
        lastPivotHigh = { price: curr, index: i };
      }
      // Check if pullback exceeds sensitivity threshold
      if (lastPivotHigh.price > 0 && (lastPivotHigh.price - curr) / lastPivotHigh.price >= sensitivity) {
        // Confirm high pivot
        pivots.push({
          date: priceArray[lastPivotHigh.index].date,
          price: lastPivotHigh.price,
          type: 'HIGH',
          index: lastPivotHigh.index,
        });
        direction = 'down';
        lastPivotLow = { price: curr, index: i };
      }
    } else {
      if (curr < lastPivotLow.price) {
        lastPivotLow = { price: curr, index: i };
      }
      // Check if rally exceeds sensitivity threshold
      if (lastPivotLow.price > 0 && (curr - lastPivotLow.price) / lastPivotLow.price >= sensitivity) {
        // Confirm low pivot
        pivots.push({
          date: priceArray[lastPivotLow.index].date,
          price: lastPivotLow.price,
          type: 'LOW',
          index: lastPivotLow.index,
        });
        direction = 'up';
        lastPivotHigh = { price: curr, index: i };
      }
    }
  }

  // Add the final unconfirmed pivot
  if (direction === 'up' && lastPivotHigh.price > 0) {
    pivots.push({ date: priceArray[lastPivotHigh.index].date, price: lastPivotHigh.price, type: 'HIGH', index: lastPivotHigh.index });
  } else if (direction === 'down' && lastPivotLow.price > 0 && isFinite(lastPivotLow.price)) {
    pivots.push({ date: priceArray[lastPivotLow.index].date, price: lastPivotLow.price, type: 'LOW', index: lastPivotLow.index });
  }

  return pivots;
}

// ─── LAYER 2: WAVE LABELER ───

function isFibClose(actual, expected, tolerance = 0.15) {
  if (expected === 0) return false;
  return Math.abs(actual - expected) / expected <= tolerance;
}

/**
 * Validate a 5-wave impulse structure from 6 pivots.
 * pivot[0]=W1 start(low), [1]=W1 end(high), [2]=W2 end(low),
 * [3]=W3 end(high), [4]=W4 end(low), [5]=W5 end(high)
 */
function validateImpulseWave(pivots) {
  if (!pivots || pivots.length < 6) return { valid: false, reason: 'Not enough pivots' };

  const p = pivots;
  const w1_len = p[1].price - p[0].price;
  const w3_len = p[3].price - p[2].price;
  const w5_len = p[5].price - p[4].price;

  // HARD RULES
  // Rule 1: Wave 2 never retraces 100% of Wave 1
  if (p[2].price <= p[0].price) return { valid: false, reason: 'Wave 2 retraces beyond Wave 1 start' };

  // Rule 2: Wave 4 must not overlap Wave 1 price territory
  if (p[4].price <= p[1].price) return { valid: false, reason: 'Wave 4 overlaps Wave 1' };

  // Rule 3: Wave 3 must not be the shortest
  if (w3_len <= w1_len && w3_len <= w5_len) return { valid: false, reason: 'Wave 3 is shortest' };

  // All waves must move in correct direction
  if (w1_len <= 0 || w3_len <= 0 || w5_len <= 0) return { valid: false, reason: 'Wave direction invalid' };

  // SOFT GUIDELINES — each adds confidence
  let confidence = 0;

  // G1: Wave 2 retraces 38.2%–61.8% of Wave 1
  const w2_retrace = (p[1].price - p[2].price) / w1_len;
  if (w2_retrace >= 0.382 && w2_retrace <= 0.618) confidence += 15;
  else if (w2_retrace >= 0.236 && w2_retrace <= 0.786) confidence += 8;

  // G2: Wave 3 Fibonacci relationship to Wave 1
  const w3_ratio = w3_len / w1_len;
  if (isFibClose(w3_ratio, 1.618, 0.15)) confidence += 20;
  else if (isFibClose(w3_ratio, 2.618, 0.15)) confidence += 15;
  else if (isFibClose(w3_ratio, 1.0, 0.15)) confidence += 10;
  else if (w3_ratio > 1.0) confidence += 5;

  // G3: Wave 4 retraces ~38.2% of Wave 3
  const w4_retrace = (p[3].price - p[4].price) / w3_len;
  if (isFibClose(w4_retrace, 0.382, 0.12)) confidence += 15;
  else if (w4_retrace >= 0.236 && w4_retrace <= 0.500) confidence += 8;

  // G4: Wave 5 relationship to Wave 1
  const w5_ratio = w5_len / w1_len;
  if (isFibClose(w5_ratio, 1.0, 0.15)) confidence += 15;
  else if (isFibClose(w5_ratio, 0.618, 0.15)) confidence += 10;

  // G5: Alternation — Wave 2 sharp vs Wave 4 flat (or vice versa)
  const w2_depth = w2_retrace;
  const w4_depth = w4_retrace;
  if (Math.abs(w2_depth - w4_depth) > 0.15) confidence += 10;

  // G6: Wave 3 is the longest
  if (w3_len >= w1_len && w3_len >= w5_len) confidence += 15;

  // Cap at 100
  confidence = Math.min(confidence, 100);

  return {
    valid: true,
    confidence,
    wave1_length: w1_len,
    wave3_length: w3_len,
    wave5_length: w5_len,
    fib_relationships: {
      w2_retrace: round(w2_retrace, 3),
      w3_extension: round(w3_ratio, 3),
      w4_retrace: round(w4_retrace, 3),
      w5_relation: round(w5_ratio, 3),
    },
  };
}

/**
 * Validate a 3-wave corrective structure (A-B-C) from 4 pivots.
 * pivot[0]=A start(high), [1]=A end(low), [2]=B end(high), [3]=C end(low)
 */
function validateCorrectiveWave(pivots) {
  if (!pivots || pivots.length < 4) return { valid: false, reason: 'Not enough pivots' };

  const p = pivots;
  const wA_len = p[0].price - p[1].price; // downward
  const wC_len = p[2].price - p[3].price; // downward

  // HARD RULES
  // Rule 1: Wave B must not exceed Wave A start
  if (p[2].price >= p[0].price) return { valid: false, reason: 'Wave B exceeds Wave A start' };

  // Rule 2: Wave C must move same direction as Wave A (both down)
  if (wA_len <= 0 || wC_len <= 0) return { valid: false, reason: 'Wave direction invalid' };

  // Wave B must bounce (not continue down)
  if (p[2].price <= p[1].price) return { valid: false, reason: 'Wave B did not bounce' };

  let confidence = 0;

  // G1: Wave B retraces 38.2%–78.6% of Wave A
  const wB_retrace = (p[2].price - p[1].price) / wA_len;
  if (wB_retrace >= 0.382 && wB_retrace <= 0.786) confidence += 20;
  else if (wB_retrace >= 0.236 && wB_retrace <= 0.886) confidence += 10;

  // G2: Wave C vs Wave A length
  const wC_ratio = wC_len / wA_len;
  if (isFibClose(wC_ratio, 1.0, 0.15)) confidence += 25;
  else if (isFibClose(wC_ratio, 0.618, 0.15)) confidence += 15;
  else if (isFibClose(wC_ratio, 1.618, 0.15)) confidence += 15;

  // G3: Wave C terminus near Fib of prior impulse (approximated)
  // We check if C end is at a reasonable level relative to A start
  const totalDrop = p[0].price - p[3].price;
  const dropRatio = totalDrop / p[0].price;
  if (dropRatio >= 0.382 && dropRatio <= 0.618) confidence += 20;
  else if (dropRatio >= 0.236 && dropRatio <= 0.786) confidence += 10;

  // G4: Wave B retraces exactly ~50%
  if (isFibClose(wB_retrace, 0.500, 0.08)) confidence += 10;

  // G5: Wave C equals 1.0× Wave A
  if (isFibClose(wC_ratio, 1.0, 0.10)) confidence += 10;

  confidence = Math.min(confidence, 100);

  return {
    valid: true,
    confidence,
    waveA_length: wA_len,
    waveC_length: wC_len,
    fib_relationships: {
      wB_retrace: round(wB_retrace, 3),
      wC_ratio: round(wC_ratio, 3),
      total_correction: round(dropRatio, 3),
    },
  };
}

// ─── LAYER 3: CURRENT WAVE POSITION ───

function identifyCurrentWave(structure, pivotCount, currentPrice, lastPivot) {
  let currentWave = '?';
  let tliSignal = 'WATCH';
  let tliReason = '';

  if (structure === 'impulse') {
    if (pivotCount <= 1) {
      currentWave = '1';
      tliSignal = 'WATCH';
      tliReason = 'Wave 1 potentially forming — too early to confirm.';
    } else if (pivotCount === 2) {
      currentWave = '2';
      tliSignal = 'BUY_ZONE';
      tliReason = 'Wave 2 retracement of new impulse — early entry opportunity before Wave 3.';
    } else if (pivotCount === 3) {
      currentWave = '3';
      tliSignal = 'AVOID';
      tliReason = 'Wave 3 in progress — do not chase. Wait for Wave 4 pullback.';
    } else if (pivotCount === 4) {
      currentWave = '4';
      tliSignal = 'WATCH';
      tliReason = 'Wave 4 correction — potential add opportunity but higher risk than Wave 2 or C entries.';
    } else if (pivotCount === 5) {
      currentWave = '5';
      tliSignal = 'AVOID';
      tliReason = 'Wave 5 — TLI deadly sin to buy here. Take profits. Correction coming.';
    } else {
      currentWave = 'POST-5';
      tliSignal = 'WATCH';
      tliReason = 'Impulse complete — A-B-C correction expected. Wait for Wave C low.';
    }
  } else if (structure === 'corrective') {
    if (pivotCount <= 1) {
      currentWave = 'A';
      tliSignal = 'WATCH';
      tliReason = 'Wave A decline in progress — do not catch falling knife.';
    } else if (pivotCount === 2) {
      currentWave = 'B';
      tliSignal = 'AVOID';
      tliReason = 'Wave B relief bounce — exit liquidity. Do not buy. Wave C decline still ahead.';
    } else if (pivotCount === 3) {
      currentWave = 'C';
      tliSignal = 'BUY_ZONE';
      tliReason = 'Wave C correction approaching terminus — primary TLI entry. Fundamentals permitting, load the position.';
    } else {
      currentWave = 'POST-C';
      tliSignal = 'BUY_ZONE';
      tliReason = 'Correction complete — new impulse expected. Accumulate.';
    }
  }

  return { currentWave, tliSignal, tliReason };
}

// ─── LAYER 4: FIBONACCI PRICE TARGETS ───

function calculateFibTargets(structure, currentWave, pivots, currentPrice) {
  let entryZoneLow = null, entryZoneHigh = null, stopLoss = null;
  let target1 = null, target2 = null, target3 = null;
  let rewardRiskRatio = null;

  if (currentWave === 'C' && pivots.length >= 4) {
    // Buying correction low
    const corrStart = pivots[0].price; // Wave A start (prior impulse end)
    const wA_len = pivots[0].price - pivots[1].price;

    // Use prior impulse if available (approximate from A start)
    const impulseLen = corrStart * 0.5; // approximate if we don't have full impulse

    entryZoneLow = corrStart - impulseLen * 0.618;
    entryZoneHigh = corrStart - impulseLen * 0.500;
    stopLoss = corrStart - impulseLen * 0.786;

    target1 = (entryZoneLow + entryZoneHigh) / 2 + wA_len * 1.618;
    target2 = target1 + wA_len;
    target3 = corrStart * 1.618;
  } else if (currentWave === '2' && pivots.length >= 2) {
    // Buying early impulse
    const w1_len = pivots[1].price - pivots[0].price;
    const w1_start = pivots[0].price;

    entryZoneHigh = pivots[1].price - w1_len * 0.382;
    entryZoneLow = pivots[1].price - w1_len * 0.618;
    stopLoss = w1_start * 0.99;

    target1 = entryZoneLow + w1_len * 1.618;
    target2 = target1 + w1_len;
    target3 = target1 * 1.272;
  } else if (currentWave === '4' && pivots.length >= 4) {
    // Wave 4 entry
    const w1_len = pivots[1].price - pivots[0].price;
    const w1_high = pivots[1].price;

    entryZoneHigh = pivots[3].price - (pivots[3].price - pivots[2].price) * 0.382;
    entryZoneLow = pivots[3].price - (pivots[3].price - pivots[2].price) * 0.500;
    stopLoss = w1_high; // Wave 4 cannot overlap Wave 1

    target1 = currentPrice + w1_len;
    target2 = target1 * 1.272;
    target3 = null;
  }

  // Calculate reward/risk
  if (target1 != null && stopLoss != null && currentPrice > stopLoss) {
    rewardRiskRatio = round((target1 - currentPrice) / (currentPrice - stopLoss), 1);
  }

  return {
    entry_zone_low: round(entryZoneLow),
    entry_zone_high: round(entryZoneHigh),
    stop_loss: round(stopLoss),
    target_1: round(target1),
    target_2: round(target2),
    target_3: round(target3),
    reward_risk_ratio: rewardRiskRatio,
  };
}

// ─── ORCHESTRATOR ───

/**
 * Run full wave analysis for a ticker.
 * @returns {Array} Up to 4 wave counts sorted by confidence
 */
function runWaveAnalysis(ticker, monthlyPrices, weeklyPrices, currentPrice) {
  const results = [];

  const timeframes = [
    { label: 'monthly', degree: 'primary', data: monthlyPrices, sensitivity: 0.15 },
    { label: 'weekly', degree: 'intermediate', data: weeklyPrices, sensitivity: 0.08 },
  ];

  for (const tf of timeframes) {
    if (!tf.data || tf.data.length < 30) continue;

    const pivots = detectPivots(tf.data, tf.sensitivity);
    if (pivots.length < 4) continue;

    // Try impulse wave (last 6, 8, 10 pivots)
    for (const windowSize of [6, 8, 10]) {
      if (pivots.length < windowSize) continue;
      const window = pivots.slice(-windowSize);

      // Find groups of 6 consecutive pivots starting with LOW
      for (let i = 0; i <= window.length - 6; i++) {
        const candidate = window.slice(i, i + 6);
        if (candidate[0].type !== 'LOW') continue;

        const result = validateImpulseWave(candidate);
        if (result.valid && result.confidence >= 40) {
          const pivotCount = getPivotCountSinceStart(candidate, pivots, currentPrice);
          const position = identifyCurrentWave('impulse', pivotCount, currentPrice, candidate[candidate.length - 1]);
          const targets = calculateFibTargets('impulse', position.currentWave, candidate, currentPrice);

          // Skip if reward/risk too low for BUY_ZONE signals
          if (position.tliSignal === 'BUY_ZONE' && targets.reward_risk_ratio != null && targets.reward_risk_ratio < 2.0) {
            continue;
          }

          results.push({
            ticker,
            timeframe: tf.label,
            wave_degree: tf.degree,
            wave_structure: 'impulse',
            current_wave: position.currentWave,
            wave_count_json: candidate,
            confidence_score: result.confidence,
            confidence_label: getConfidenceLabel(result.confidence),
            tli_signal: position.tliSignal,
            tli_signal_reason: position.tliReason,
            ...targets,
            last_updated: new Date().toISOString(),
          });
          break; // Take best impulse fit per timeframe
        }
      }
    }

    // Try corrective wave (last 4, 6 pivots)
    for (const windowSize of [4, 6]) {
      if (pivots.length < windowSize) continue;
      const window = pivots.slice(-windowSize);

      for (let i = 0; i <= window.length - 4; i++) {
        const candidate = window.slice(i, i + 4);
        if (candidate[0].type !== 'HIGH') continue;

        const result = validateCorrectiveWave(candidate);
        if (result.valid && result.confidence >= 40) {
          const pivotCount = getPivotCountSinceStart(candidate, pivots, currentPrice);
          const position = identifyCurrentWave('corrective', pivotCount, currentPrice, candidate[candidate.length - 1]);
          const targets = calculateFibTargets('corrective', position.currentWave, candidate, currentPrice);

          if (position.tliSignal === 'BUY_ZONE' && targets.reward_risk_ratio != null && targets.reward_risk_ratio < 2.0) {
            continue;
          }

          results.push({
            ticker,
            timeframe: tf.label,
            wave_degree: tf.degree,
            wave_structure: 'corrective',
            current_wave: position.currentWave,
            wave_count_json: candidate,
            confidence_score: result.confidence,
            confidence_label: getConfidenceLabel(result.confidence),
            tli_signal: position.tliSignal,
            tli_signal_reason: position.tliReason,
            ...targets,
            last_updated: new Date().toISOString(),
          });
          break;
        }
      }
    }
  }

  // Sort by confidence descending, return up to 4
  return results.sort((a, b) => b.confidence_score - a.confidence_score).slice(0, 4);
}

// ─── HELPERS ───

function getPivotCountSinceStart(candidatePivots, allPivots, currentPrice) {
  // Count how many pivots have formed since the start of this wave pattern
  const startIndex = candidatePivots[0].index;
  const lastConfirmedIndex = allPivots[allPivots.length - 1]?.index || 0;
  let count = 0;
  for (const p of allPivots) {
    if (p.index >= startIndex) count++;
  }
  return Math.min(count, candidatePivots.length);
}

function getConfidenceLabel(score) {
  if (score >= 80) return 'HIGH CONFIDENCE';
  if (score >= 60) return 'PROBABLE';
  if (score >= 40) return 'SPECULATIVE';
  return 'INVALID';
}

function round(val, dec = 2) {
  if (val == null || !isFinite(val)) return null;
  return Math.round(val * Math.pow(10, dec)) / Math.pow(10, dec);
}

module.exports = {
  detectPivots,
  validateImpulseWave,
  validateCorrectiveWave,
  identifyCurrentWave,
  calculateFibTargets,
  runWaveAnalysis,
};
