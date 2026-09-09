// Vercel Serverless Function
// Route: /api/quote?symbol=ADVANC.BK   (Thai stocks use the ".BK" suffix)
// Route: /api/quote?symbol=GOOGL       (US stocks: no suffix)
//
// Pulls daily OHLCV history from Yahoo Finance's public chart endpoint
// (no API key required) and returns clean JSON for the frontend.

export default async function handler(req, res) {
  const { symbol } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: "Missing ?symbol=" });
  }

  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?range=6mo&interval=1d`;

  try {
    const r = await fetch(yahooUrl, {
      headers: {
        // Yahoo blocks requests with no user-agent
        "User-Agent": "Mozilla/5.0 (compatible; StockDashboard/1.0)",
      },
    });

    if (!r.ok) {
      return res.status(r.status).json({ error: `Yahoo Finance returned ${r.status}` });
    }

    const json = await r.json();
    const result = json?.chart?.result?.[0];

    if (!result) {
      return res.status(404).json({ error: "No data found for that symbol" });
    }

    const timestamps = result.timestamp || [];
    const q = result.indicators?.quote?.[0] || {};
    const currency = result.meta?.currency || "USD";
    const longName = result.meta?.longName || result.meta?.symbol || symbol;

    const rows = timestamps
      .map((t, i) => ({
        date: new Date(t * 1000).toISOString().slice(0, 10),
        open: q.open?.[i],
        high: q.high?.[i],
        low: q.low?.[i],
        close: q.close?.[i],
        volume: q.volume?.[i],
      }))
      // Yahoo sometimes returns null rows for holidays/gaps — drop them
      .filter((row) => row.close != null);

    // Cache at the edge for 5 minutes so repeated ticker switches don't
    // hammer Yahoo Finance
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({ symbol, name: longName, currency, rows });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
