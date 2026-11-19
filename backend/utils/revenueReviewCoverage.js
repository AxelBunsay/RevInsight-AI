function applyQuarterReviewCoverage(data, review) {
  const reviewed = review.reviewed;
  const confirmedZeroSales = reviewed ? review.months.every(row => row.confirmedZeroSales) : null;
  const coverage = {
    ...data.coverage,
    completeness: reviewed ? 'reviewed' : 'unknown',
    reviewStatus: review.status,
    confirmedZeroSales,
    notice: reviewed
      ? 'Closed quarter reviewed by an Admin. Reviews reflect the current eligible records; later revenue changes require another review.'
      : 'Quarter review is ' + review.status.replaceAll('_', ' ') + '. Coverage remains unverified; missing records may affect comparisons, decline signals and forecasts.'
  };
  data.coverage = coverage;
  data.concentration.coverage = coverage;
  data.risk.coverage = coverage;
  return data;
}
module.exports = { applyQuarterReviewCoverage };
