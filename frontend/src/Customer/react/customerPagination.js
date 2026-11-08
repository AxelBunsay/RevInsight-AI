export const CUSTOMER_PAGE_SIZES = Object.freeze({
  shop: 15,
  services: 10,
  purchases: 10
});

export function getCustomerPageSize(list) {
  return CUSTOMER_PAGE_SIZES[list] || CUSTOMER_PAGE_SIZES.purchases;
}

export function getCustomerPageItems(items, page, pageSize) {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function getCustomerPageRange(totalItems, page, pageSize) {
  if (!totalItems) return { start: 0, end: 0 };
  return {
    start: (page - 1) * pageSize + 1,
    end: Math.min(page * pageSize, totalItems)
  };
}

export function getCustomerPageNumbers(page, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const visible = new Set([1, totalPages]);
  for (let number = Math.max(2, page - 1); number <= Math.min(totalPages - 1, page + 1); number += 1) {
    visible.add(number);
  }

  const result = [];
  let previous = 0;
  for (const number of [...visible].sort((left, right) => left - right)) {
    if (number - previous > 1) result.push(`ellipsis-${previous}-${number}`);
    result.push(number);
    previous = number;
  }
  return result;
}

export function withCustomerPage(searchParams, page) {
  const nextParams = new URLSearchParams(searchParams);
  nextParams.set('page', String(page));
  return nextParams;
}