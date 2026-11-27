// Recorded transaction dates describe observations, not proof of full coverage.
// There is currently no period-close/certification workflow in this system.
const revenueTransactionKey = row => row.walkInId ? 'walk-in:' + row.walkInId : row.source + ':' + row.recordId;

function revenueCoverage(entries, scope = {}, now = new Date()) {
  const dates = entries.map(row => row.dateLabel).filter(Boolean).sort();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const includedTransactions = new Set(entries.map(revenueTransactionKey)).size;
  return {
    includedTransactions, firstRecordedDate: dates[0] || null, lastRecordedDate: dates.at(-1) || null,
    quarterInProgress: scope.mode === 'selectedQuarter' ? today >= scope.startDate && today < scope.endDateExclusive : null,
    completeness: 'unknown', confirmedZeroSales: null,
    empty: includedTransactions === 0,
    notice: 'Completeness unknown. Recorded dates do not verify full-period coverage. Missing records may affect comparisons, decline signals and projections.'
  };
}
module.exports = { revenueCoverage, revenueTransactionKey };
