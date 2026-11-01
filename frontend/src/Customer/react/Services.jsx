import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../services/api";
import { CustomerPage } from "./CustomerLayout";
import CustomerPagination from "./CustomerPagination.jsx";
import { CUSTOMER_PAGE_SIZES, getCustomerPageItems } from "./customerPagination";
import { useCustomerPagination } from "./useCustomerPagination";
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

export default function Services() {
  const [searchParams, setSearchParams] = useSearchParams();
  const partsSource = getServicePartsSource(searchParams);
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const servicesListRef = useRef(null);
  const modeServices = useMemo(
    () => servicesForPartsSource(services, partsSource),
    [partsSource, services]
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
    });
  }, [category, modeServices, search]);

  const servicesPageSize = CUSTOMER_PAGE_SIZES.services;
  const { page, pageCount, setPage, resetPage } = useCustomerPagination({
    itemCount: visibleServices.length,
    pageSize: servicesPageSize,
    isReady: !isLoading,
    listRef: servicesListRef
  });
  const pageServices = getCustomerPageItems(visibleServices, page, servicesPageSize);
  const choosePartsSource = (nextPartsSource) => {
    setSearchParams(withServicePartsSource(searchParams, nextPartsSource));
  };

  return (
    <CustomerPage
      title="Motorcycle Services"
      description="Book expert care for your motorcycle."
    >
      <div className="services-content">
        <div className="services-parts-mode" role="tablist" aria-label="Service parts source">
          <button type="button" role="tab" aria-selected={partsSource === "shop"} className={partsSource === "shop" ? "active" : ""} onClick={() => choosePartsSource("shop")}>With shop parts</button>
          <button type="button" role="tab" aria-selected={partsSource === "customer"} className={partsSource === "customer" ? "active" : ""} onClick={() => choosePartsSource("customer")}>Labor only (I have my own parts)</button>
        </div>
        <section
          className="services-hero"
          aria-label="Mechanic services introduction"
        >
          <div>
            <p className="services-hero-eyebrow">
              MANOY&apos;S MOTORCYCLE PARTS, ACCESSORIES &amp; SERVICES
            </p>
            <h2>
              Mechanic Services <span aria-hidden="true">🔧</span>
            </h2>
            <p>
              Book a service and our skilled mechanics will handle the rest.
            </p>
            <div className="services-hero-stats">
              <span>{modeServices.length} Services</span>
              <span>Expert Mechanics</span>
              <span>Quality Guaranteed</span>
            </div>
          </div>
          <div className="services-hero-wheel" aria-hidden="true">
            ◉
          </div>
        </section>

        <div className="services-toolbar">
          <label className="services-search">
            <span aria-hidden="true">⌕</span>
            <input
              value={search}
              onChange={(event) => { setSearch(event.target.value); resetPage(); }}
              placeholder="Search services..."
              aria-label="Search services"
            />
          </label>
          <div
            className="service-category-pills"
            role="tablist"
            aria-label="Service categories"
          >
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                className={category === item ? "active" : ""}
                onClick={() => { setCategory(item); resetPage(); }}
              >
                {item}{" "}
                <small>
                  {item === "All"
                    ? modeServices.length
                    : modeServices.filter(
                        (service) => (service.category || "General") === item,
                      ).length}
                </small>
              </button>
            ))}
          </div>
          <Link className="services-my-bookings" to="/my-purchases?tab=services">My bookings</Link>
        </div>

        <div className="service-card-grid" ref={servicesListRef}>
          {isLoading
            ? Array.from({ length: 6 }, (_, index) => <ServiceSkeleton key={index} />)
            : pageServices.map((service) => {
              const unitPrice = partsSource === "customer" ? service.laborOnlyPrice : service.price;
              const unitTotal = Number(unitPrice || 0) + Number(service.mechanicFee || 0);
              return <article
                className="service-card tone-sun"
                key={service._id}
              >
                <div className="service-card-art">
                  <span className="service-code">Code: {service.code}</span>
                  <span className="service-duration">{formatDuration(service.durationMinutes)}</span>
                  <div className="service-icon" aria-hidden="true">🔧</div>
                </div>
                <div className="service-card-body">
                  <p className="service-category-label">{service.category || "General"}</p>
                  <h2 title={service.name}>{service.name}</h2>
                  <p
                    className="service-card-description"
                    title={service.description || "Service details available at the shop."}
                  >{service.description || "Service details available at the shop."}</p>
                </div>
                <div className="service-card-footer">
                  <strong>{partsSource === "customer" && <span className="service-labor-only-label">Labor only · </span>}₱{unitTotal.toLocaleString("en-PH")} total{service.pricePerUnit ? ` / ${service.unitLabel || "unit"}` : ""}</strong>
                  <Link to={`/customer/services/${service._id}${partsSource === "customer" ? "?parts=own" : ""}`} className="service-book-link">Book service</Link>
                </div>
              </article>;
            })}
        </div>
        {!isLoading && error && (
          <div className="customer-empty" role="alert">
            <p>Could not load services. Try again.</p>
            <button type="button" className="customer-secondary-button" onClick={() => {
              setError(false);
              setIsLoading(true);
              setRetryKey((key) => key + 1);
            }}>Try again</button>
          </div>
        )}
        {!isLoading && !error && !modeServices.length && partsSource === "customer" && (
          <div className="customer-empty services-labor-empty">
            <p>No services currently offer labor-only booking. You can still browse all services with shop parts.</p>
            <button type="button" className="customer-secondary-button" onClick={() => choosePartsSource("shop")}>Browse services with shop parts</button>
          </div>
        )}
        {!isLoading && !error && !services.length && (
          <p className="customer-empty">No services available</p>
        )}
        {!isLoading && !error && modeServices.length > 0 && !visibleServices.length && (
          <p className="customer-empty">No services match your search.</p>
        )}
        {!isLoading && !error && <CustomerPagination
          page={page}
          pageCount={pageCount}
          totalItems={visibleServices.length}
          pageSize={servicesPageSize}
          onPageChange={setPage}
          label="Services"
        />}
      </div>
    </CustomerPage>
  );
}
