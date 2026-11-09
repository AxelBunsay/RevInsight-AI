export function createRevenueFiguresFingerprint({ analysis, collectedAmount, outstandingAmount }) {
  const indicators = analysis?.risk?.indicators || {};
  const fingerprintData = {
    totals: [Number(collectedAmount || 0), Number(outstandingAmount || 0)],
    quarters: (analysis?.quarters || []).map(({ year, quarter, revenue }) => [year, quarter, Number(revenue || 0)]),
    overallRisk: [analysis?.risk?.overallRisk?.level || '', analysis?.risk?.overallRisk?.reason || ''],
    indicators: Object.keys(indicators).sort().map((key) => [
      key,
      indicators[key]?.level || '',
      indicators[key]?.value ?? null
    ]),
    forecast: [
      analysis?.risk?.officialForecast?.targetLabel || '',
      analysis?.risk?.officialForecast?.expected ?? null,
      analysis?.risk?.officialForecast?.low ?? null,
      analysis?.risk?.officialForecast?.high ?? null
    ],
    contributors: (analysis?.concentration?.contributors || []).slice(0, 5).map((item) => [
      item.name || '',
      item.contributorType || '',
      item.share ?? null,
      item.revenue ?? null
    ])
  };
  const serialized = JSON.stringify(fingerprintData);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash = Math.imul(hash ^ serialized.charCodeAt(index), 16777619);
  }
  return (hash >>> 0).toString(16);
}