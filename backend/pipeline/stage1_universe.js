const supabase = require('../services/supabase');
const log = require('../services/logger').child({ module: 'stage1_universe' });

/**
 * S&P 500 Universe
 * Curated list — reliable data, large-cap, fundamentally sound.
 * Expand later: Russell 2000, commodities, international, etc.
 */
// Removed delisted/acquired tickers:
// ATVI (acquired by MSFT 2023), SIVB (collapsed 2023), FRC (collapsed 2023),
// SBNY (collapsed 2023), DISH (merged w/ EchoStar), LUMN (removed from S&P),
// CTLT (acquired by Novo), PXD (acquired by XOM), ETSY (removed), DXC (removed),
// PEAK (renamed to DOC), BBWI (renamed to BBWI→removed), CDAY (acquired)
// Added recent S&P 500 additions:
// UBER, SMCI, DECK, GEV, SOLV, VLTO, KVUE, HUBB, AXON, BLDR, GDDY, FICO, PODD, TRGP already present
const SP500 = [
  'AAPL','ABBV','ABT','ACN','ADBE','ADI','ADM','ADP','ADSK','AEE',
  'AEP','AES','AFL','AIG','AIZ','AJG','AKAM','ALB','ALGN','ALK',
  'ALL','ALLE','AMAT','AMCR','AMD','AME','AMGN','AMP','AMT','AMZN',
  'ANET','ANSS','AON','AOS','APA','APD','APH','APTV','ARE','ATO',
  'AVB','AVGO','AVY','AWK','AXON','AXP','AZO','BA','BAC','BAX',
  'BBY','BDX','BEN','BG','BIIB','BIO','BK','BKNG',
  'BKR','BLK','BLDR','BMY','BR','BRO','BSX','BWA','BXP','C',
  'CAG','CAH','CARR','CAT','CB','CBOE','CBRE','CCI','CCL',
  'CDNS','CDW','CE','CEG','CF','CFG','CHD','CHRW','CHTR','CI',
  'CINF','CL','CLX','CMA','CMCSA','CME','CMG','CMI','CMS','CNC',
  'CNP','COF','COO','COP','COST','CPB','CPRT','CPT','CRL','CRM',
  'CSCO','CSGP','CSX','CTAS','CTRA','CTSH','CTVA','CVS','CVX',
  'CZR','D','DAL','DD','DE','DECK','DFS','DG','DGX','DHI','DHR',
  'DIS','DLR','DLTR','DOV','DOW','DPZ','DRI','DTE','DUK',
  'DVA','DVN','DXCM','EA','EBAY','ECL','ED','EFX','EIX',
  'EL','EMN','EMR','ENPH','EOG','EPAM','EQIX','EQR','EQT','ES',
  'ESS','ETN','ETR','EVRG','EW','EXC','EXPD','EXPE','EXR',
  'F','FANG','FAST','FBHS','FCX','FDS','FDX','FE','FICO','FFIV','FIS',
  'FISV','FITB','FLT','FMC','FOX','FOXA','FRT','FTNT','FTV',
  'GD','GE','GDDY','GEHC','GEN','GEV','GILD','GIS','GL','GLW','GM','GNRC',
  'GOOG','GOOGL','GPC','GPN','GRMN','GS','GWW','HAL','HAS','HBAN',
  'HCA','HD','HOLX','HON','HPE','HPQ','HRL','HSIC','HST','HSY',
  'HUBB','HUM','HWM','IBM','ICE','IDXX','IEX','IFF','ILMN','INCY','INTC',
  'INTU','INVH','IP','IPG','IQV','IR','IRM','ISRG','IT','ITW',
  'IVZ','J','JBHT','JCI','JKHY','JNJ','JNPR','JPM','K','KDP',
  'KEY','KEYS','KHC','KIM','KLAC','KMB','KMI','KMX','KO','KR',
  'KVUE','L','LDOS','LEN','LH','LHX','LIN','LKQ','LLY','LMT','LNC',
  'LNT','LOW','LRCX','LUV','LVS','LW','LYB','LYV','MA',
  'MAA','MAR','MAS','MCD','MCHP','MCK','MCO','MDLZ','MDT','MET',
  'META','MGM','MHK','MKC','MKTX','MLM','MMC','MMM','MNST','MO',
  'MOH','MOS','MPC','MPWR','MRK','MRNA','MRO','MS','MSCI','MSFT',
  'MSI','MTB','MTCH','MTD','MU','NCLH','NDAQ','NDSN','NEE','NEM',
  'NFLX','NI','NKE','NOC','NOW','NRG','NSC','NTAP','NTRS','NUE',
  'NVDA','NVR','NWL','NWS','NWSA','NXPI','O','ODFL','OGN','OKE',
  'OMC','ON','ORCL','ORLY','OTIS','OXY','PARA','PAYC','PAYX','PCAR',
  'PCG','PEG','PEP','PFE','PFG','PG','PGR','PH','PHM',
  'PKG','PKI','PLD','PM','PNC','PNR','PNW','PODD','POOL','PPG','PPL',
  'PRU','PSA','PSX','PTC','PVH','PWR','PYPL','QCOM','QRVO',
  'RCL','RE','REG','REGN','RF','RHI','RJF','RL','RMD','ROK',
  'ROL','ROP','ROST','RSG','RTX','RVTY','SBAC','SBUX','SCHW',
  'SEE','SHW','SJM','SLB','SMCI','SNA','SNPS','SO','SOLV','SPG','SPGI',
  'SRE','STE','STT','STX','STZ','SWK','SWKS','SYF','SYK','SYY',
  'T','TAP','TDG','TDY','TECH','TEL','TER','TFC','TFX','TGT',
  'TMO','TMUS','TPR','TRGP','TRMB','TROW','TRV','TSCO','TSLA','TSN',
  'TT','TTWO','TXN','TXT','TYL','UAL','UBER','UDR','UHS','ULTA','UNH',
  'UNP','UPS','URI','USB','V','VFC','VICI','VLO','VLTO','VMC','VNO',
  'VRSK','VRSN','VRTX','VTR','VTRS','VZ','WAB','WAT','WBA','WBD',
  'WDC','WEC','WELL','WFC','WHR','WM','WMB','WMT','WRB','WRK',
  'WST','WTW','WY','WYNN','XEL','XOM','XRAY','XYL','YUM','ZBH',
  'ZBRA','ZION','ZTS',
];

/**
 * Stage 1 — Universe
 * Seeds the universe table with S&P 500 tickers.
 * Clean, reliable, data-rich — no scraper dependency.
 */
async function fetchUniverse() {
  log.info('Seeding S&P 500 universe');
  const startTime = Date.now();

  // Filter out tickers with dots (BRK.B, BF.B) — scraper may not handle them
  const tickers = SP500.filter((t) => !/[.]/.test(t));

  log.info({ tickerCount: tickers.length, skipped: SP500.length - tickers.length }, 'S&P 500 tickers filtered');

  // Remove old tickers that are NOT in S&P 500 list
  // Paginate reads (Supabase defaults to 1000 rows)
  let allTickers = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data } = await supabase
      .from('universe')
      .select('ticker')
      .range(from, from + pageSize - 1);
    if (!data || data.length === 0) break;
    allTickers = allTickers.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  if (allTickers && allTickers.length > 0) {
    const sp500Set = new Set(tickers);
    const toDelete = allTickers
      .map((r) => r.ticker)
      .filter((t) => !sp500Set.has(t));

    if (toDelete.length > 0) {
      log.info({ count: toDelete.length }, 'Removing old tickers not in S&P 500');
      // Delete in batches of 100 (Supabase .in() limit)
      for (let i = 0; i < toDelete.length; i += 100) {
        const batch = toDelete.slice(i, i + 100);
        const { error } = await supabase
          .from('universe')
          .delete()
          .in('ticker', batch);
        if (error) log.error({ err: error }, 'Delete batch error');
      }
      log.info({ count: toDelete.length }, 'Removed old tickers');
    }
  }

  // Upsert in batches of 100
  const batchSize = 100;
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize).map((ticker) => ({
      ticker,
      company_name: null,
      exchange: 'NYSE',
      sector: null,
      industry: null,
      market_cap: null,
      last_updated: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('universe')
      .upsert(batch, { onConflict: 'ticker' });

    if (error) log.error({ err: error }, 'Upsert batch error');
  }

  // Clean up screener_candidates that are no longer in universe
  const sp500SetFinal = new Set(tickers);
  const { data: oldCandidates } = await supabase
    .from('screener_candidates')
    .select('ticker');

  if (oldCandidates && oldCandidates.length > 0) {
    const staleCandidates = oldCandidates
      .map((r) => r.ticker)
      .filter((t) => !sp500SetFinal.has(t));

    if (staleCandidates.length > 0) {
      log.info({ count: staleCandidates.length }, 'Removing stale candidates not in S&P 500');
      for (let i = 0; i < staleCandidates.length; i += 100) {
        const batch = staleCandidates.slice(i, i + 100);
        await supabase.from('screener_candidates').delete().in('ticker', batch);
      }
    }
  }

  // Log scan history
  await supabase.from('scan_history').insert({
    stage: 'UNIVERSE',
    tickers_processed: SP500.length,
    tickers_passed: tickers.length,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log.info({ tickerCount: tickers.length, elapsedSec: elapsed }, 'Stage 1 complete');
  return tickers.length;
}

module.exports = { fetchUniverse };
