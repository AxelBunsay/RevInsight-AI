const { SERVICE_CATEGORIES, isServiceCategory, normalizeServiceCategory } = require('./serviceCategories');

const percentage = (amount, total) => (total ? Number(((amount / total) * 100).toFixed(1)) : 0);

function buildServiceRevenueReport({ entries, nonServiceRevenue = 0, serviceCategoryByName = new Map() }) {
  const serviceEntries = entries.filter((entry) => entry.source === 'service');
  const revenueByRecord = new Map();
  const revenueByCategory = new Map(SERVICE_CATEGORIES.map((category) => [
    category,
    { revenue: 0, recordIds: new Set() }
  ]));
  const revenueByName = new Map();

  serviceEntries.forEach((entry) => {
    const recordId = String(entry.recordId);
    const hasQuotedPrice = entry.quotedPrice !== null
      && entry.quotedPrice !== undefined
      && Number.isFinite(Number(entry.quotedPrice));
    const revenue = entry.quoteStatus === 'accepted' && hasQuotedPrice
      ? Number(entry.quotedPrice)
      : Number(entry.revenue) || 0;
    const name = entry.name || 'Service';
    const savedCategory = isServiceCategory(entry.serviceCategory)
      ? normalizeServiceCategory(entry.serviceCategory)
      : null;
    const category = savedCategory
      || normalizeServiceCategory(serviceCategoryByName.get(name.trim().toLocaleLowerCase('en')));

    revenueByRecord.set(recordId, revenue);
    const categoryGroup = revenueByCategory.get(category);
    categoryGroup.revenue += revenue;
    categoryGroup.recordIds.add(recordId);

    const serviceGroup = revenueByName.get(name) || { name, revenue: 0, recordIds: new Set() };
    serviceGroup.revenue += revenue;
    serviceGroup.recordIds.add(recordId);
    revenueByName.set(name, serviceGroup);
  });

  const serviceRevenue = [...revenueByRecord.values()].reduce((sum, amount) => sum + amount, 0);
  const completedJobs = revenueByRecord.size;
  const categories = SERVICE_CATEGORIES.map((name) => {
    const group = revenueByCategory.get(name);
    return {
      name,
      revenue: group.revenue,
      jobs: group.recordIds.size,
      percent: percentage(group.revenue, serviceRevenue)
    };
  });
  const topServices = [...revenueByName.values()]
    .map(({ name, revenue, recordIds }) => ({ name, revenue, jobs: recordIds.size }))
    .sort((left, right) => right.revenue - left.revenue || left.name.localeCompare(right.name))
    .slice(0, 5);

  return {
    totalServiceRevenue: serviceRevenue,
    completedJobs,
    averagePerJob: completedJobs ? serviceRevenue / completedJobs : 0,
    percentOfTotalRevenue: percentage(serviceRevenue, Number(nonServiceRevenue) + serviceRevenue),
    categories,
    topServices
  };
}

module.exports = { buildServiceRevenueReport };
