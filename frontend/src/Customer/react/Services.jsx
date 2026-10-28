import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../services/api";
import { CustomerPage } from "./CustomerLayout";
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
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

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
    const values = [...new Set(services.map((service) => service.category || "General"))];
    if (!values.length || values.every((value) => value === "General")) return ["All"];
    return ["All", ...values.sort((left, right) => left.localeCompare(right))];
  }, [services]);

  const visibleServices = useMemo(() => {
    const query = search.trim().toLowerCase();
    return services.filter((service) => {
      const serviceCategory = service.category || "General";
      return (category === "All" || serviceCategory === category)
        && (!query || `${service.name} ${service.description || ""}`.toLowerCase().includes(query));
    });
  }, [category, search, services]);

  return (
    <CustomerPage
      title="Motorcycle Services"
      description="Book expert care for your motorcycle."
    >
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
            <span>{services.length} Services</span>
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
            onChange={(event) => setSearch(event.target.value)}
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
              onClick={() => setCategory(item)}
            >
              {item}{" "}
              <small>
                {item === "All"
                  ? services.length
                  : services.filter(
                      (service) => (service.category || "General") === item,
                    ).length}
              </small>
            </button>
          ))}
        </div>
        <Link className="services-my-bookings" to="/customer/purchases">My bookings</Link>
      </div>

      <div className="service-card-grid">
        {isLoading
          ? Array.from({ length: 6 }, (_, index) => <ServiceSkeleton key={index} />)
          : visibleServices.map((service) => (
            <article
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
                <h2>{service.name}</h2>
                <p>{service.description || "Service details available at the shop."}</p>
                <div className="service-card-footer">
                  <strong>₱{(Number(service.price || 0) + Number(service.mechanicFee || 0)).toLocaleString("en-PH")} total{service.pricePerUnit ? ` / ${service.unitLabel || "unit"}` : ""}</strong>
                  <Link to={`/customer/services/${service._id}`} className="service-book-link">Book service</Link>
                </div>
              </div>
            </article>
          ))}
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
      {!isLoading && !error && !services.length && (
        <p className="customer-empty">No services available</p>
      )}
      {!isLoading && !error && services.length > 0 && !visibleServices.length && (
        <p className="customer-empty">No services match your search.</p>
      )}
    </CustomerPage>
  );
}
