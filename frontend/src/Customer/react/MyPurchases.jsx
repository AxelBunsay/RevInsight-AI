import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../services/api';
import { CustomerPage } from './CustomerLayout';
import { useCustomerPrototype } from './useCustomerPrototype';
import { getServiceBookingStatus } from '../../utils/servicePayment';
import { filterPurchaseRecords, getPurchaseTab, recordsForPurchaseTab } from './customerPurchases';
import CustomerPagination from './CustomerPagination.jsx';
import { CUSTOMER_PAGE_SIZES, getCustomerPageItems } from './customerPagination';
import { useCustomerPagination } from './useCustomerPagination';
import { ItemReservationCard, ServiceBookingCard } from './CustomerPurchaseCards';
import '../styles/customer-flow.css';

const statusOptions = [
  ['all', 'All statuses'],
  ['active', 'Active'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled/Expired']
];

function serviceReference(booking, prototype) {
  return prototype ? booking.id : booking.code || booking._id;
}

function sortTimestamp(record) {
  const date = record.createdAt || record.scheduledDate || record.bookingDate || record.date;
  const timestamp = date ? new Date(date).getTime() : 0;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function PurchaseRecordList({ records, showType, listRef }) {
  return <div className="customer-reservation-list" ref={listRef}>
    {records.map((record) => record.type === 'item'
      ? <ItemReservationCard key={`item-${record.reference}`} reservation={record.value} showType={showType} />
      : <ServiceBookingCard
        key={`service-${record.reference}`}
        booking={record.value}
        prototype={record.prototype}
        showType={showType}
      />)}
  </div>;
}

export default function MyPurchases() {
  const { reservations: prototypeBookings } = useCustomerPrototype();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = getPurchaseTab(searchParams.toString());
  const [itemReservations, setItemReservations] = useState([]);
  const [serviceBookings, setServiceBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errors, setErrors] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const purchasesListRef = useRef(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 200);
    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    let isMounted = true;
    Promise.allSettled([api.getCustomerReservations(), api.getCustomerServiceRequests()])
      .then(([itemsResult, servicesResult]) => {
        if (!isMounted) return;
        const loadErrors = [];
        if (itemsResult.status === 'fulfilled') {
          setItemReservations(itemsResult.value.reservations || []);
        } else {
          loadErrors.push(itemsResult.reason.message || 'Item reservations could not be loaded.');
        }
        if (servicesResult.status === 'fulfilled') {
          setServiceBookings(servicesResult.value.requests || []);
        } else {
          loadErrors.push(servicesResult.reason.message || 'Service bookings could not be loaded.');
        }
        setErrors(loadErrors);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => { isMounted = false; };
  }, []);

  const records = useMemo(() => {
    const prototypeIds = new Set(prototypeBookings.map((booking) => booking.id));
    const items = itemReservations.map((reservation) => ({
      type: 'item',
      reference: reservation.code,
      status: reservation.status,
      createdAt: reservation.createdAt,
      value: reservation
    }));
    const services = [
      ...prototypeBookings.map((booking) => ({ booking, prototype: true })),
      ...serviceBookings
        .filter((booking) => !prototypeIds.has(booking._id))
        .map((booking) => ({ booking, prototype: false }))
    ].map(({ booking, prototype }) => ({
      type: 'service',
      reference: serviceReference(booking, prototype),
      status: prototype ? booking.status : getServiceBookingStatus(booking),
      createdAt: prototype ? booking.bookingDate : booking.createdAt,
      scheduledDate: prototype ? booking.bookingDate : booking.scheduledDate,
      bookingDate: prototype ? booking.bookingDate : '',
      prototype,
      value: booking
    }));
    return [...items, ...services].sort((left, right) => sortTimestamp(right) - sortTimestamp(left));
  }, [itemReservations, prototypeBookings, serviceBookings]);

  const tabRecords = recordsForPurchaseTab(records, activeTab);
  const visibleRecords = filterPurchaseRecords(tabRecords, statusFilter, debouncedSearchQuery);
  const pageSize = CUSTOMER_PAGE_SIZES.purchases;
  const { page, pageCount, setPage, resetPage } = useCustomerPagination({
    itemCount: visibleRecords.length,
    pageSize,
    isReady: !isLoading,
    listRef: purchasesListRef
  });
  const pageRecords = getCustomerPageItems(visibleRecords, page, pageSize);

  const chooseTab = (tab) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', tab);
    nextParams.set('page', '1');
    setSearchParams(nextParams);
  };
  const clearFilters = () => {
    setStatusFilter('all');
    setSearchQuery('');
    setDebouncedSearchQuery('');
    resetPage();
  };

  const emptyCopy = activeTab === 'items'
    ? { title: 'No item reservations yet', description: 'Your reserved items and pickup updates will appear here.', href: '/customer/shop', label: 'Browse the shop' }
    : activeTab === 'services'
      ? { title: 'No service bookings yet', description: 'Your motorcycle service bookings and updates will appear here.', href: '/customer/services', label: 'Browse services' }
      : { title: 'No purchases or bookings yet', description: 'Your item reservations and service bookings will appear here.', href: '/customer/shop', label: 'Browse the shop' };

  return <CustomerPage title="My purchases" description="Your item reservations and service bookings.">
    <div className="customer-flow-page customer-purchases-page">
      {errors.map((error) => <p className="customer-error" role="alert" key={error}>{error}</p>)}
      <div className="customer-purchases-tabs" role="tablist" aria-label="Purchase types">
        {[
          ['all', 'All'],
          ['items', 'Items'],
          ['services', 'Services']
        ].map(([tab, label]) => <button
          type="button"
          role="tab"
          aria-selected={activeTab === tab}
          className={activeTab === tab ? 'is-active' : ''}
          key={tab}
          onClick={() => chooseTab(tab)}
        >{label}<span className="customer-purchases-tab-count">{recordsForPurchaseTab(records, tab).length}</span></button>)}
      </div>
      <div className="customer-purchases-filters">
        <label>
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); resetPage(); }}>
            {statusOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>Search</span>
          <span className="customer-purchases-search">
            <input
              type="text"
              role="searchbox"
              inputMode="search"
              value={searchQuery}
              onChange={(event) => { setSearchQuery(event.target.value); resetPage(); }}
              placeholder="Search by name or reference"
            />
            {searchQuery && <button type="button" aria-label="Clear search" title="Clear search" onClick={() => {
              setSearchQuery('');
              setDebouncedSearchQuery('');
              resetPage();
            }}>×</button>}
          </span>
        </label>
      </div>
      {!isLoading && <CustomerPagination
        page={page}
        pageCount={pageCount}
        totalItems={visibleRecords.length}
        pageSize={pageSize}
        onPageChange={setPage}
        label="Purchases and bookings"
      />}
      {isLoading
        ? <p className="customer-empty">Loading purchases and bookings...</p>
        : visibleRecords.length
          ? <PurchaseRecordList records={pageRecords} showType={activeTab === 'all'} listRef={purchasesListRef} />
          : debouncedSearchQuery
            ? <section className="customer-empty-cart">
              <span aria-hidden="true">⌕</span>
              <h2>No purchases match your search</h2>
              <button type="button" className="customer-secondary-button" onClick={() => {
                setSearchQuery('');
                setDebouncedSearchQuery('');
                resetPage();
              }}>Clear search</button>
            </section>
          : tabRecords.length
            ? <section className="customer-empty-cart">
              <span aria-hidden="true">⌕</span>
              <h2>No matching purchases</h2>
              <p>Try a different status or reference number.</p>
              <button type="button" className="customer-secondary-button" onClick={clearFilters}>Clear filters</button>
            </section>
            : <section className="customer-empty-cart">
              <span aria-hidden="true">{activeTab === 'services' ? '⌁' : '▱'}</span>
              <h2>{emptyCopy.title}</h2>
              <p>{emptyCopy.description}</p>
              {activeTab === 'all'
                ? <div className="customer-purchases-empty-actions">
                  <Link className="customer-primary-button" to="/customer/shop">Browse the shop</Link>
                  <Link className="customer-secondary-button" to="/customer/services">Browse services</Link>
                </div>
                : <Link className="customer-primary-button" to={emptyCopy.href}>{emptyCopy.label}</Link>}
            </section>}
    </div>
  </CustomerPage>;
}
