import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { withCustomerPage } from './customerPagination';

export function useCustomerPagination({ itemCount, pageSize, isReady = true, listRef }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const previousPage = useRef(null);
  const pageCount = Math.max(1, Math.ceil(itemCount / pageSize));
  const rawPage = searchParams.get('page');
  const requestedPage = Number.parseInt(rawPage || '1', 10);
  const validRequestedPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const page = Math.min(validRequestedPage, pageCount);

  useEffect(() => {
    if (!isReady || !rawPage || String(page) === rawPage) return;
    setSearchParams(withCustomerPage(searchParams, page), { replace: true });
  }, [isReady, page, rawPage, searchParams, setSearchParams]);

  useEffect(() => {
    if (previousPage.current === null) {
      previousPage.current = page;
      return undefined;
    }
    if (previousPage.current === page) return undefined;
    previousPage.current = page;
    if (!listRef?.current) return undefined;

    const frame = window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      listRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [listRef, page]);

  const setPage = (nextPage, options = {}) => {
    const clampedPage = Math.min(Math.max(1, nextPage), pageCount);
    if (clampedPage === page && searchParams.get('page') === String(clampedPage)) return;
    setSearchParams(withCustomerPage(searchParams, clampedPage), options);
  };

  const resetPage = () => setPage(1, { replace: true });
  return { page, pageCount, setPage, resetPage };
}