import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../services/api";
import { CustomerPage } from "./CustomerLayout";
import CustomerPagination from "./CustomerPagination.jsx";
import { CUSTOMER_PAGE_SIZES, getCustomerPageItems } from "./customerPagination";
import { useCustomerPagination } from "./useCustomerPagination";
import ServiceBookingModal from "./ServiceBookingModal";
import { getServicePartsSource, servicesForPartsSource, withServicePartsSource } from "./servicePartsMode";
import "../styles/services.css";

function formatDuration(minutes) {
  const value = Number(minutes) || 60;
  if (value < 60) return `${value} min`;
  const hours = value / 60;
  return `${hours} ${hours === 1 ? "hr" : "hrs"}`;
}

function ServiceSkeleton() {
  return <article className="service-card service-card-skeleton" aria-hidden="true">
    <div className="service-card-art"><span /><span /><div /></div>
    <div className="service-card-body"><i /><b /><span /><span /><div /></div>
  </article>;
}

export function ServiceCard({ service, partsSource = 'shop', onBook }) {
  const unitPrice = partsSource === 'customer' ? service.laborOnlyPrice : service.price;
  const unitTotal = Number(unitPrice || 0) + Number(service.mechanicFee || 0);
  const hasLaborRange = service.laborPriceMin != null || service.laborPriceMax != null;
  const laborRange = hasLaborRange
    ? `Est. PHP ${Number(service.laborPriceMin || 0).toLocaleString('en-PH')} - PHP ${Number(service.laborPriceMax || service.laborPriceMin || 0).toLocaleString('en-PH')}`
    : 'Price set by mechanic';
  return <article
    className="service-card tone-sun"
    key={service._id}
  >
    <div className="service-card-art">
      <span className="service-code">Code: {service.code}</span>
      <span className="service-duration">{formatDuration(service.durationMinutes)}</span>
      <div className="service-icon" aria-hidden="true">
        <svg viewBox="0 0 48 48" focusable="false">
          <path d="M29.8 6.5a13 13 0 0 0-17.1 17.1L5.5 30.8a4.1 4.1 0 0 0 5.8 5.8l7.2-7.2a13 13 0 0 0 17.1-17.1l-8.1 8.1-7.2-7.2 8.1-8.1Z" />
        </svg>
      </div>
    </div>
    <div className="service-card-body">
      <p className="service-category-label">{service.category || 'General'}</p>
      <h2 title={service.name}>{service.name}</h2>
      <p className="service-card-description" title={service.description || 'Service details available at the shop.'}>
        {service.description || 'Service details available at the shop.'}
      </p>
      <div className={`service-card-footer${partsSource === 'customer' ? ' is-quote' : ''}`}>
        {partsSource === 'customer'
          ? <div className="service-quote-estimate"><strong>{laborRange}</strong><small>Final price is set by the mechanic</small></div>
          : <strong>₱{unitTotal.toLocaleString('en-PH')} total{service.pricePerUnit ? ` / ${service.unitLabel || 'unit'}` : ''}</strong>}
        <Link
          to={`/customer/services/${service._id}${partsSource === 'customer' ? '?parts=own' : ''}`}
          className="service-book-link"
          onClick={(event) => {
            event.preventDefault();
            onBook?.(service, event.currentTarget);
          }}
        >{partsSource === 'customer' ? 'Request quote' : 'Book service'}</Link>
      </div>
    </div>
  </article>;
}

export default function Services() {
  const [searchParams, setSearchParams] = useSearchParams();
  const partsSource = getServicePartsSource(searchParams);
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState('featured');
  const [category, setCategory] = useState("All");
  const [hasSwitchedPartsMode, setHasSwitchedPartsMode] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const serviceCardOpenerRef = useRef(null);
  const servicesListRef = useRef(null);
  const modeServices = useMemo(
    () => servicesForPartsSource(services),
    [services]
  );

  useEffect(() => {
    let active = true;
    api.getServices().then((response) => {
      if (active) setServices(response.services || []);
    }).catch(() => {
      if (active) {
        setServices([]);
        setError(true);
      }
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [retryKey]);

  const categories = useMemo(() => {
    const values = [...new Set(modeServices.map((service) => service.category || "General"))];
    if (!values.length || values.every((value) => value === "General")) return ["All"];
    return ["All", ...values.sort((left, right) => left.localeCompare(right))];
  }, [modeServices]);

  const visibleServices = useMemo(() => {
    const query = search.trim().toLowerCase();
    return modeServices.filter((service) => {
      const serviceCategory = service.category || "General";
      return (category === "All" || serviceCategory === category)
        && (!query || `${service.name} ${service.description || ""}`.toLowerCase().includes(query));
    }).sort((left, right) => {
      const getTotal = (service) => Number((partsSource === 'customer' ? service.laborOnlyPrice : service.price) || 0)
        + Number(service.mechanicFee || 0);
      if (sort === 'price-low') return getTotal(left) - getTotal(right);
      if (sort === 'price-high') return getTotal(right) - getTotal(left);
      return left.name.localeCompare(right.name);
    });
  }, [category, modeServices, partsSource, search, sort]);

  const servicesPageSize = CUSTOMER_PAGE_SIZES.services;
  const { page, pageCount, setPage, resetPage } = useCustomerPagination({
    itemCount: visibleServices.length,
    pageSize: servicesPageSize,
    isReady: !isLoading,
    listRef: servicesListRef
  });
  const pageServices = getCustomerPageItems(visibleServices, page, servicesPageSize);
  const choosePartsSource = (nextPartsSource) => {
    if (nextPartsSource !== partsSource) setHasSwitchedPartsMode(true);
    setSearchParams(withServicePartsSource(searchParams, nextPartsSource));
  };
  const openServiceBooking = (service, opener) => {
    serviceCardOpenerRef.current = opener;
    setSelectedService(service);
  };

  return (
    <CustomerPage
      title="Motorcycle Services"
      description="Book expert care for your motorcycle."
      hideHeading
    >
      <div className="shop-content">
        <section className="customer-compact-banner services-compact-banner" aria-label="Services introduction">
          <div>
            <h2>Everything your ride needs.</h2>
            <p>Quality parts, trusted accessories, and expert service in one place.</p>
          </div>
          <Link to="/customer/shop">Explore shop</Link>
        </section>
        <div className="customer-product-categories services-parts-mode" role="tablist" aria-label="Service parts source">
          <button type="button" role="tab" aria-selected={partsSource === "shop"} className={partsSource === "shop" ? "active" : ""} onClick={() => choosePartsSource("shop")}>With shop parts</button>
          <button type="button" role="tab" aria-selected={partsSource === "customer"} className={partsSource === "customer" ? "active" : ""} onClick={() => choosePartsSource("customer")}>Labor only (I have my own parts)</button>
        </div>
        <div className="shop-toolbar">
          <input
            value={search}
            onChange={(event) => { setSearch(event.target.value); resetPage(); }}
            placeholder="Search services..."
            aria-label="Search services"
          />
          <select value={sort} onChange={(event) => { setSort(event.target.value); resetPage(); }} aria-label="Sort services">
            <option value="featured">Featured</option>
            <option value="price-low">Price low to high</option>
            <option value="price-high">Price high to low</option>
            <option value="name">Name A-Z</option>
          </select>
        </div>

        <div className="customer-product-categories" role="group" aria-label="Service categories">
          {categories.map((item) => <button type="button" className={category === item ? 'active' : ''} key={item} onClick={() => { setCategory(item); resetPage(); }}>
            {item}<small>{item === 'All' ? modeServices.length : modeServices.filter((service) => (service.category || 'General') === item).length}</small>
          </button>)}
        </div>

        <section className="shop-how-it-works services-how-it-works" aria-label="How service bookings work">
          <div><strong>1. Choose a service</strong></div>
          <div><strong>2. Pay the down payment</strong></div>
          <div><strong>3. A mechanic handles the rest</strong></div>
        </section>

        <div className="customer-product-results">
          <h2>All services</h2>
          <span>{isLoading ? 'Loading services' : `${visibleServices.length} services`}</span>
        </div>

        {isLoading
          ? <div className="product-grid" aria-label="Loading services">{Array.from({ length: 6 }, (_, index) => <ServiceSkeleton key={index} />)}</div>
          : error
            ? <div className="shop-load-error" role="alert">
              <p>Could not load services. Try again.</p>
              <button type="button" onClick={() => {
                setError(false);
                setIsLoading(true);
                setRetryKey((key) => key + 1);
              }}>Try again</button>
            </div>
            : visibleServices.length
              ? <div
                key={partsSource}
                className={`service-card-grid${hasSwitchedPartsMode ? ' is-mode-transition' : ''}`}
                ref={servicesListRef}
              >
                {pageServices.map((service) => <ServiceCard
                  service={service}
                  partsSource={partsSource}
                  onBook={openServiceBooking}
                  key={service._id}
                />)}
              </div>
              : <div className="shop-no-results">
                <p>{modeServices.length ? 'No services match your search.' : 'No services available.'}</p>
                <button type="button" onClick={() => { setSearch(''); setCategory('All'); setSort('featured'); resetPage(); }}>Clear filters</button>
              </div>}
        {!isLoading && !error && <CustomerPagination
          page={page}
          pageCount={pageCount}
          totalItems={visibleServices.length}
          pageSize={servicesPageSize}
          onPageChange={setPage}
          label="Services"
        />}
      </div>
      <ServiceBookingModal
        service={selectedService}
        partsSource={partsSource}
        openerRef={serviceCardOpenerRef}
        onClose={() => setSelectedService(null)}
      />
    </CustomerPage>
  );
}
