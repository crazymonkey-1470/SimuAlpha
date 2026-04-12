/**
 * Kill Thesis Flags — Sprint 10B (Munger Inversion)
 *
 * "All I want to know is where I'm going to die, so I'll never go there."
 *
 * Checks for structural risks that can destroy an investment thesis
 * regardless of how attractive the upside looks. 3+ flags forces
 * a rating downgrade.
 */

function checkKillThesis(stock) {
  const flags = [];

  if (stock.patentCliffWithin3Years) flags.push('PATENT_CLIFF');
  if (stock.regulatoryActionPending) flags.push('REGULATORY_ACTION');
  if (stock.tariffExposure > 30) flags.push('TARIFF_EXPOSURE');
  if (stock.debtToEquity > 2.0 && stock.fcfMargin < 5) flags.push('EXCESSIVE_DEBT');
  if (stock.recentDataBreach) flags.push('DATA_BREACH');
  if (stock.keyPersonRisk) flags.push('KEY_PERSON_RISK');
  if (stock.accountingAllegations) flags.push('ACCOUNTING_ALLEGATIONS');
  if (stock.gaapNonGaapDivergence > 30) flags.push('EARNINGS_MANIPULATION');

  const killCount = flags.length;
  const forceDowngrade = killCount >= 3;

  return {
    flags,
    killCount,
    forceDowngrade,
    reason: forceDowngrade ? `${killCount} kill thesis flags fired — forced downgrade` : null,
  };
}

module.exports = { checkKillThesis };
