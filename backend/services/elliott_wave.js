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
  // Instead of discarding, flag as still in correction with reduced confidence
  if (p[2].price <= p[0].price) return {
    valid: false,
    reason: 'Wave 2 retraces beyond Wave 1 start',
    rule1_violated: true,
    still_in_correction: true,
  };

  // Rule 2: Wave 4 must not enter Wave 2 territory (Wave 4 low must stay above Wave 2 high)
  if (p[4].price <= p[2].price) return { valid: false, reason: 'Wave 4 enters Wave 2 territory', rule2_violated: true };

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

  // G3: Wave 4 retraces ~38.2% of Wave 3 (max 38.2% per TLI rules)
  const w4_retrace = (p[3].price - p[4].price) / w3_len;
  if (w4_retrace > 0.382) confidence -= 10; // Exceeds TLI max — penalize
  else if (isFibClose(w4_retrace, 0.382, 0.10)) confidence += 15;
  else if (w4_retrace >= 0.236 && w4_retrace <= 0.382) confidence += 8;

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

  // G1: Wave B retraces 38.2%–61.8% of Wave A (standard zigzag)
  // If B retraces > 61.8% of A, it's likely a flat correction, not a zigzag
  const wB_retrace = (p[2].price - p[1].price) / wA_len;
  const isFlatCorrection = wB_retrace > 0.618;
  if (wB_retrace >= 0.382 && wB_retrace <= 0.618) confidence += 20;
  else if (wB_retrace > 0.618 && wB_retrace <= 0.786) confidence += 10; // Likely flat
  else if (wB_retrace >= 0.236 && wB_retrace <= 0.886) confidence += 5;

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

function identifyCurrentWave(structure, pivotCount, currentPrice, lastPivot, pivots) {
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
      // Wave 2 must retrace between 50% and 100% of Wave 1
      if (pivots && pivots.length >= 2) {
        const w1Len = pivots[1].price - pivots[0].price;
        const retrace = w1Len > 0 ? (pivots[1].price - currentPrice) / w1Len : 0;
        if (retrace >= 1.0) {
          tliSignal = 'WATCH';
          tliReason = 'Wave 2 exceeded 100% retracement of Wave 1 — wave count is invalid.';
        } else if (retrace >= 0.5) {
          const w3Target = currentPrice + w1Len * 1.618;
          tliSignal = 'WAVE_2_BOTTOM';
          tliReason = `Wave 2 pullback to 0.618 Fib of Wave 1 — deep and scary but this is TLI's highest conviction entry. Smart money accumulates here while retail panics. Wave 3 target: $${round(w3Target)}.`;
        } else {
          tliSignal = 'WATCH';
          tliReason = `Wave 2 retracement at ${round(retrace * 100, 0)}% — waiting for deeper pullback to 50-61.8% zone.`;
        }
      } else {
        tliSignal = 'WAVE_2_BOTTOM';
        tliReason = 'Wave 2 retracement of new impulse — entry opportunity before Wave 3.';
      }
    } else if (pivotCount === 3) {
      currentWave = '3';
      tliSignal = 'WAVE_3_IN_PROGRESS';
      tliReason = 'TLI deadly sin #2 — never chase Wave 3 in progress. The move is already underway. Wait for Wave 4 pullback to add.';
    } else if (pivotCount === 4) {
      currentWave = '4';
      if (pivots && pivots.length >= 4) {
        const w1Len = pivots[1].price - pivots[0].price;
        const w3Len = pivots[3].price - pivots[2].price;
        const w4Retrace = w3Len > 0 ? (pivots[3].price - currentPrice) / w3Len : 0;
        const overlapsW2 = currentPrice <= pivots[2].price;

        if (overlapsW2) {
          tliSignal = 'WATCH';
          tliReason = 'Wave 4 entered Wave 2 territory — violates Elliott Wave rules unless this is a diagonal pattern.';
        } else if (w4Retrace > 0.382) {
          tliSignal = 'WATCH';
          tliReason = 'Wave 4 retracement exceeds 38.2% of Wave 3 — wave count may be invalid.';
        } else {
          const w5Target = currentPrice + w1Len;
          tliSignal = 'WAVE_4_BOTTOM';
          tliReason = `Wave 4 pullback to 0.382 Fib of Wave 3 — shallower than Wave 2, less scary, less reward. Add cautiously. Wave 5 target: $${round(w5Target)}.`;
        }
      } else {
        tliSignal = 'WAVE_4_BOTTOM';
        tliReason = 'Wave 4 correction — potential add opportunity but lower conviction than Wave 2 or C entries.';
      }
    } else if (pivotCount === 5) {
      currentWave = '5';
      tliSignal = 'WAVE_5_IN_PROGRESS';
      tliReason = 'TLI deadly sin #1 — Wave 5 is the final leg up. Begin taking profits. An A-B-C correction is coming after Wave 5 completes.';
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
      tliSignal = 'WAVE_B_BOUNCE';
      tliReason = 'Exit liquidity — smart money exits Wave B bounces. Retail buys thinking recovery has started. Wave C decline is still ahead. Do not buy.';
    } else if (pivotCount === 3) {
      currentWave = 'C';
      tliSignal = 'WAVE_C_BOTTOM';
      if (pivots && pivots.length >= 4) {
        const wA_len = pivots[0].price - pivots[1].price;
        const newImpulseTarget = currentPrice + wA_len * 1.618;
        tliReason = `A-B-C correction completing at 0.618 Fib of the prior impulse — TLI's primary entry signal. New impulse wave starting. Initial target: $${round(newImpulseTarget)}. Fundamentals permitting, load the position.`;
      } else {
        tliReason = 'A-B-C correction completing at 0.618 Fib — TLI\'s primary entry signal. New impulse wave starting. Fundamentals permitting, load the position.';
      }
    } else {
      currentWave = 'POST-C';
      tliSignal = 'WAVE_C_BOTTOM';
      tliReason = 'Correction complete — new impulse beginning. This is equivalent to a Wave C bottom entry. Accumulate.';
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
    // Buying correction low — entry zone at 0.500-0.618 Fib of prior impulse
    const corrStart = pivots[0].price; // Wave A start (prior impulse end)
    const wA_len = pivots[0].price - pivots[1].price;

    // Use prior impulse if available (approximate from A start)
    const impulseLen = corrStart * 0.5; // approximate if we don't have full impulse

    entryZoneHigh = corrStart - impulseLen * 0.500; // 0.5 Fib = zone high
    entryZoneLow = corrStart - impulseLen * 0.618;  // 0.618 Fib = zone low (optimal)
    stopLoss = corrStart - impulseLen * 0.786;

    target1 = (entryZoneLow + entryZoneHigh) / 2 + wA_len * 1.618;
    target2 = target1 + wA_len;
    target3 = corrStart * 1.618;
  } else if (currentWave === '2' && pivots.length >= 2) {
    // Wave 2 bottom: entry zone between 0.500 and 0.618 Fib of Wave 1
    const w1_len = pivots[1].price - pivots[0].price;
    const w1_start = pivots[0].price;

    entryZoneHigh = pivots[1].price - w1_len * 0.500; // 0.5 Fib = zone high
    entryZoneLow = pivots[1].price - w1_len * 0.618;  // 0.618 Fib = zone low (optimal)
    stopLoss = w1_start * 0.99; // Just below Wave 1 start

    // Wave 3 target = 1.618x Wave 1 length from Wave 2 low
    target1 = entryZoneLow + w1_len * 1.618;
    target2 = entryZoneLow + w1_len * 2.618;
    target3 = pivots[1].price * 1.618; // Extended target
  } else if (currentWave === '4' && pivots.length >= 4) {
    // Wave 4 bottom: project Wave 5 as ~equal to Wave 1 from Wave 4 low
    const w1_len = pivots[1].price - pivots[0].price;
    const w3_len = pivots[3].price - pivots[2].price;

    entryZoneHigh = pivots[3].price - w3_len * 0.236; // Shallow target
    entryZoneLow = pivots[3].price - w3_len * 0.382;  // Standard target
    stopLoss = pivots[2].price * 0.99; // Just below Wave 2 high (Rule 2)

    // Wave 5 ≈ Wave 1 length from Wave 4 low
    target1 = currentPrice + w1_len;
    target2 = currentPrice + w1_len * 1.272;
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

        // Handle Rule 1 violation — still in correction
        if (!result.valid && result.still_in_correction) {
          results.push({
            ticker,
            timeframe: tf.label,
            wave_degree: tf.degree,
            wave_structure: 'impulse',
            current_wave: '2',
            wave_count_json: candidate,
            confidence_score: 25,
            confidence_label: 'SPECULATIVE',
            tli_signal: 'STILL_IN_CORRECTION',
            tli_signal_reason: 'Wave 2 breaking below Wave 1 start means this is not yet a new impulse wave — the corrective structure is still in progress. Wait for confirmation of a new Wave 1.',
            entry_zone_low: null, entry_zone_high: null, stop_loss: null,
            target_1: null, target_2: null, target_3: null, reward_risk_ratio: null,
            last_updated: new Date().toISOString(),
          });
          continue;
        }

        // Handle Rule 2 violation — check for diagonal patterns
        if (!result.valid && result.rule2_violated) {
          const diagonal = detectLeadingDiagonal(candidate, '1');
          if (diagonal && diagonal.confidence) {
            results.push({
              ticker,
              timeframe: tf.label,
              wave_degree: tf.degree,
              wave_structure: 'impulse',
              current_wave: '1',
              wave_count_json: candidate,
              wave_pattern: 'LEADING_DIAGONAL',
              confidence_score: diagonal.confidence === 'HIGH' ? 70 : 55,
              confidence_label: diagonal.confidence,
              tli_signal: 'LEADING_DIAGONAL_WAVE1',
              tli_signal_reason: 'Leading Diagonal confirmed in Wave 1 position. Wave 4 overlap with Wave 2 is valid here — this is the beginning of a new trend. Expect a deeper than normal Wave 2 pullback after this Leading Diagonal completes. That Wave 2 pullback is the primary TLI entry point. Do not enter during the Leading Diagonal itself.',
              entry_zone_low: null, entry_zone_high: null, stop_loss: null,
              target_1: null, target_2: null, target_3: null, reward_risk_ratio: null,
              last_updated: new Date().toISOString(),
            });
          }
          continue;
        }

        if (result.valid && result.confidence >= 40) {
          const pivotCount = getPivotCountSinceStart(candidate, pivots, currentPrice);
          const position = identifyCurrentWave('impulse', pivotCount, currentPrice, candidate[candidate.length - 1], candidate);
          const targets = calculateFibTargets('impulse', position.currentWave, candidate, currentPrice);

          // Detect extended wave
          const extended = detectExtendedWave(result);
          let wavePattern = null;
          let signalReason = position.tliReason;
          if (extended) {
            wavePattern = extended.pattern;
            const t2618 = round(candidate[2].price + result.wave1_length * 2.618);
            const t4236 = round(candidate[2].price + result.wave1_length * 4.236);
            signalReason += ` Extended Wave 3 detected — the most powerful move in the entire cycle. Trim 50% at 1.618, let the remainder run to 2.618 ($${t2618}).`;
            if (targets.target_2 == null || t2618 > targets.target_2) targets.target_2 = t2618;
            targets.target_3 = t4236;
          }

          // Detect ending diagonal in Wave 5
          const endingDiag = detectEndingDiagonal(candidate, position.currentWave);
          if (endingDiag) {
            wavePattern = endingDiag.pattern;
            if (endingDiag.pattern === 'ENDING_DIAGONAL') {
              position.tliSignal = 'ENDING_DIAGONAL_WARNING';
              signalReason = 'Ending Diagonal in Wave 5 position — this signals EXHAUSTION of the current trend. A sharp A-B-C correction is coming after this completes. Do not buy. If holding from Wave 2 or Wave 4 begin taking profits. TLI deadly sin: buying an Ending Diagonal thinking the trend will continue.';
            } else if (endingDiag.pattern === 'WAVE_C_ENDING_DIAGONAL') {
              position.tliSignal = 'WAVE_C_ENDING_DIAGONAL';
              signalReason = 'Ending Diagonal completing Wave C — the correction is in its final exhaustion stage. A new impulse wave is imminent. Prepare to scale into a position as this structure completes.';
            }
          }

          // Detect Wave 4 type
          const w4Type = position.currentWave === '4' || position.currentWave === '5' ? detectWave4Type(candidate) : null;

          // Wave 1 origin = starting price of Wave 1
          const wave1Origin = candidate[0].price;

          // Skip if reward/risk too low for buy signals
          const buySignals = ['WAVE_C_BOTTOM', 'WAVE_2_BOTTOM', 'WAVE_4_BOTTOM'];
          if (buySignals.includes(position.tliSignal) && targets.reward_risk_ratio != null && targets.reward_risk_ratio < 2.0) {
            continue;
          }

          results.push({
            ticker,
            timeframe: tf.label,
            wave_degree: tf.degree,
            wave_structure: 'impulse',
            current_wave: position.currentWave,
            wave_count_json: candidate,
            wave_pattern: wavePattern,
            wave4_type: w4Type?.wave4_type || null,
            wave1_origin: round(wave1Origin),
            confidence_score: result.confidence,
            confidence_label: getConfidenceLabel(result.confidence),
            tli_signal: position.tliSignal,
            tli_signal_reason: signalReason,
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
          const position = identifyCurrentWave('corrective', pivotCount, currentPrice, candidate[candidate.length - 1], candidate);
          const targets = calculateFibTargets('corrective', position.currentWave, candidate, currentPrice);

          // Detect correction type (Zigzag vs Flat)
          const corrType = detectCorrectionType(candidate, result);
          let signalReason = position.tliReason;
          if (corrType?.note) {
            signalReason += ' ' + corrType.note;
          }

          // Detect ending diagonal in Wave C
          const endingDiag = detectEndingDiagonal(candidate, position.currentWave);
          if (endingDiag && endingDiag.pattern === 'WAVE_C_ENDING_DIAGONAL') {
            position.tliSignal = 'WAVE_C_ENDING_DIAGONAL';
            signalReason = 'Ending Diagonal completing Wave C — the correction is in its final exhaustion stage. A new impulse wave is imminent. Prepare to scale into a position as this structure completes.';
          }

          // Detect capitulation at Wave C
          const weeklyVols = tf.label === 'weekly' ? tf.data.map(d => d.volume).filter(v => v != null) : [];
          const cap = position.currentWave === 'C' ? detectCapitulation(candidate, weeklyVols, tf.data) : null;
          if (cap?.capitulation) {
            signalReason += ' CAPITULATION DETECTED: ' + cap.note;
          }

          const buySignals = ['WAVE_C_BOTTOM', 'WAVE_2_BOTTOM', 'WAVE_4_BOTTOM', 'WAVE_C_ENDING_DIAGONAL'];
          if (buySignals.includes(position.tliSignal) && targets.reward_risk_ratio != null && targets.reward_risk_ratio < 2.0) {
            continue;
          }

          results.push({
            ticker,
            timeframe: tf.label,
            wave_degree: tf.degree,
            wave_structure: 'corrective',
            current_wave: position.currentWave,
            wave_count_json: candidate,
            correction_type: corrType?.correction_type || null,
            capitulation_detected: cap?.capitulation || false,
            confidence_score: result.confidence + (cap?.capitulation ? 10 : 0),
            confidence_label: getConfidenceLabel(result.confidence + (cap?.capitulation ? 10 : 0)),
            tli_signal: position.tliSignal,
            tli_signal_reason: signalReason,
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

// ─── STANDARD FIBONACCI LEVELS (includes TLI's 0.65) ───

const FIB_LEVELS = [0.236, 0.382, 0.500, 0.618, 0.650, 0.786, 0.886, 1.0, 1.272, 1.618, 2.618, 4.236];

// ─── PART 2: PATTERN DETECTION ───

/**
 * Detect if trendlines through highs and lows converge (wedge shape).
 */
function detectWedge(pivots) {
  if (!pivots || pivots.length < 4) return false;
  const highs = pivots.filter(p => p.type === 'HIGH');
  const lows = pivots.filter(p => p.type === 'LOW');
  if (highs.length < 2 || lows.length < 2) return false;

  // Slope of upper trendline (through highs)
  const upperSlope = (highs[highs.length - 1].price - highs[0].price) / (highs[highs.length - 1].index - highs[0].index || 1);
  // Slope of lower trendline (through lows)
  const lowerSlope = (lows[lows.length - 1].price - lows[0].price) / (lows[lows.length - 1].index - lows[0].index || 1);

  // Converging = upper slope negative and lower slope positive, or both moving toward each other
  return (upperSlope < 0 && lowerSlope > 0) || (upperSlope < lowerSlope);
}

/**
 * Detect Extended Wave 3 — when Wave 3 length > 1.618x Wave 1 length.
 */
function detectExtendedWave(validation) {
  if (!validation || !validation.valid) return null;
  const { wave1_length, wave3_length, wave5_length } = validation;
  if (!wave1_length || !wave3_length) return null;

  const w3Ext = wave3_length / wave1_length;
  if (w3Ext > 1.618) {
    return {
      pattern: 'EXTENDED_WAVE_3',
      extension_ratio: round(w3Ext, 3),
      target_2618: null, // Calculated in context
      target_4236: null,
    };
  }
  return null;
}

/**
 * Detect Leading Diagonal — only valid as Wave 1 or Wave A.
 * Returns confidence criteria count.
 */
function detectLeadingDiagonal(pivots, currentWave) {
  if (!pivots || pivots.length < 6) return null;
  // Only valid in Wave 1 or Wave A position
  if (currentWave !== '1' && currentWave !== 'A') return null;

  const p = pivots;
  let criteria = 0;

  // 1. Overall pattern has 5 waves
  if (p.length >= 6) criteria++;

  // 2. Wave 4 overlaps Wave 2 territory (normally invalid)
  const w4OverlapsW2 = p[4].price <= p[2].price;
  if (w4OverlapsW2) criteria++;

  // 3. Wave 4 stays above the starting point of Wave 2 (= Wave 1 end)
  const w4AboveW2Start = p[4].price > p[1].price;
  if (w4AboveW2Start) criteria++;

  // 4. Wedge shape — converging trendlines
  if (detectWedge(p)) criteria++;

  // 5. Occurs at start of a new move (assumed true if we're labeling Wave 1)
  if (currentWave === '1' || currentWave === 'A') criteria++;

  // 6. Wave 4 has corrective structure (3 subwaves — approximated)
  // This is hard to check without sub-wave analysis, give benefit of doubt
  criteria++;

  // 7. Wave 4 retraces between 0.236 and 0.500 of Wave 3
  const w3_len = p[3].price - p[2].price;
  const w4_retrace = w3_len > 0 ? (p[3].price - p[4].price) / w3_len : 0;
  if (w4_retrace >= 0.236 && w4_retrace <= 0.500) criteria++;

  if (criteria >= 5) {
    return {
      pattern: 'LEADING_DIAGONAL',
      criteria_met: criteria,
      confidence: criteria >= 7 ? 'HIGH' : criteria >= 5 ? 'PROBABLE' : null,
    };
  }
  return null;
}

/**
 * Detect Ending Diagonal — only valid as Wave 5 or Wave C.
 * Signals exhaustion of the current trend.
 */
function detectEndingDiagonal(pivots, currentWave) {
  if (!pivots || pivots.length < 6) return null;
  // Only valid in Wave 5 or Wave C position
  if (currentWave !== '5' && currentWave !== 'C' && currentWave !== 'POST-5') return null;

  const p = pivots;
  let criteria = 0;

  // Wave 4 overlaps Wave 1 territory (acceptable here)
  if (p.length >= 5 && p[4].price <= p[1].price) criteria++;

  // Wave 4 must end above start of Wave 2
  if (p.length >= 5 && p[4].price > p[0].price) criteria++;

  // Wedge shape
  if (detectWedge(p)) criteria++;

  // Occurs at end of move
  if (currentWave === '5' || currentWave === 'C' || currentWave === 'POST-5') criteria++;

  if (criteria >= 3) {
    return {
      pattern: currentWave === 'C' ? 'WAVE_C_ENDING_DIAGONAL' : 'ENDING_DIAGONAL',
      criteria_met: criteria,
      position: currentWave,
    };
  }
  return null;
}

// ─── PART 3: WAVE 4 VARIATION DETECTION ───

function detectWave4Type(pivots) {
  if (!pivots || pivots.length < 5) return { wave4_type: 'FORMING' };

  const w3High = pivots[3].price;
  const w3Len = pivots[3].price - pivots[2].price;
  const w4Low = pivots[4].price;

  // We need subwave info for A, B, C of Wave 4 — approximate from pivot data
  // Use the Wave 4 retrace ratio to determine type
  const w4Retrace = w3Len > 0 ? (w3High - w4Low) / w3Len : 0;

  // Check if Wave 4 high exceeded Wave 3 high (Running Flat indicator)
  // We'd need intermediate pivots within Wave 4 for this — approximate
  const possibleRunningFlat = false; // Would need sub-pivots

  if (w4Retrace <= 0.236 + 0.05) {
    return {
      wave4_type: 'FLAT',
      target: round(w3High - w3Len * 0.236),
      note: 'Flat Wave 4 indicates strong underlying bullish pressure — the market does not want to give back gains. Wave 5 that follows is often stronger.',
    };
  }

  if (w4Retrace >= 0.236 && w4Retrace <= 0.382 + 0.05) {
    // Check for triangle characteristics (converging range)
    // Approximate: if retrace is shallow and price action compressed
    return {
      wave4_type: 'STANDARD',
      target: round(w3High - w3Len * 0.382),
    };
  }

  // Default
  return {
    wave4_type: 'STANDARD',
    target: round(w3High - w3Len * 0.382),
  };
}

// ─── PART 4: CORRECTIVE PATTERN DETECTION ───

function detectCorrectionType(pivots, validation) {
  if (!pivots || pivots.length < 4 || !validation || !validation.valid) return null;

  const wB_retrace = validation.fib_relationships?.wB_retrace;
  const wC_ratio = validation.fib_relationships?.wC_ratio;

  // Regular Flat: Wave B retraces 90-100% of Wave A (near double-top)
  if (wB_retrace != null && wB_retrace >= 0.90) {
    return {
      correction_type: 'REGULAR_FLAT',
      note: 'Regular Flat Correction detected — Wave B nearly erased all of Wave A creating a near double top. This pattern fools retail investors into thinking recovery has started. Wave C decline is still coming. Do not buy the Wave B bounce. Wait for Wave C to complete at 0.382 to 0.500 Fib before entering.',
    };
  }

  // Standard Zigzag: Wave B retraces < 61.8% of A, C makes lower low
  if (wB_retrace != null && wB_retrace <= 0.618) {
    return {
      correction_type: 'ZIGZAG',
      note: 'Standard Zigzag correction (5-3-5). Entry zone at 0.618 of entire prior impulse.',
    };
  }

  // Flat with B > 61.8%
  if (wB_retrace != null && wB_retrace > 0.618) {
    return {
      correction_type: 'FLAT',
      note: 'Flat correction pattern — Wave B retraced more than 61.8% of Wave A. Entry zone at 0.382 to 0.500 of prior impulse.',
    };
  }

  return null;
}

// ─── PART 5: CAPITULATION DETECTION ───

/**
 * Detect capitulation at Wave C completion.
 * Requires: speed acceleration, volume spike, deep Fibonacci retracement.
 */
function detectCapitulation(pivots, weeklyVolumes, priceArray) {
  if (!pivots || pivots.length < 4 || !weeklyVolumes || weeklyVolumes.length < 12) return null;

  const p = pivots;
  const wA_len = p[0].price - p[1].price;
  const wA_duration = Math.max(p[1].index - p[0].index, 1);
  const wC_len = p[2].price - p[3].price;
  const wC_duration = Math.max(p[3].index - p[2].index, 1);

  let criteria = 0;

  // 1. SPEED: Wave C declines faster than Wave A
  const wA_speed = wA_len / wA_duration;
  const wC_speed = wC_len / wC_duration;
  if (wA_speed > 0 && wC_speed / wA_speed > 1.3) criteria++;

  // 2. VOLUME: Volume spikes at Wave C low
  const recentVols = weeklyVolumes.slice(-4);
  const priorVols = weeklyVolumes.slice(-12, -4);
  if (recentVols.length >= 2 && priorVols.length >= 4) {
    const avgRecent = recentVols.reduce((a, b) => a + b, 0) / recentVols.length;
    const avgPrior = priorVols.reduce((a, b) => a + b, 0) / priorVols.length;
    if (avgPrior > 0 && avgRecent / avgPrior > 2.0) criteria++;
  }

  // 3. FIBONACCI: Wave C reaches at least 0.786 of prior impulse
  if (priceArray && priceArray.length > 0) {
    const totalDrop = p[0].price - p[3].price;
    const dropRatio = totalDrop / p[0].price;
    if (dropRatio >= 0.5) criteria++; // Deep retracement approximation
  }

  if (criteria >= 3) {
    return {
      capitulation: true,
      note: 'Capitulation detected — aggressive Wave C decline with panic volume at key Fibonacci support. This is the pattern that precedes the most powerful new impulse moves.',
    };
  }

  return criteria >= 2 ? { capitulation: false, near_capitulation: true } : null;
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
  detectWedge,
  detectExtendedWave,
  detectLeadingDiagonal,
  detectEndingDiagonal,
  detectWave4Type,
  detectCorrectionType,
  detectCapitulation,
  FIB_LEVELS,
};
