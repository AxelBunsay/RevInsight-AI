import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAuthToken } from '../../auth/authSession';
import { api } from '../../services/api';
import ShopProductCard from './ShopProductCard';
import { CustomerPage } from './CustomerLayout';
import { getVisitDetails, selectLandingProducts, selectLandingServices, shouldShowFeaturedProducts } from './landingData';
import { getProductModalSearch } from './productDetailHelpers';
import { ServiceCard } from './Services';
import '../styles/landing.css';

const productAvailability = (product) => {
  const variants = product.variants || [];
  const availableVariants = variants.filter((variant) => Math.max(
    0,
    Number(variant.available ?? (Number(variant.stock || 0) - Number(variant.reservedQty || 0)))
  ) > 0);
  const availableStock = Math.max(0, Number(product.quantity || 0) - Number(product.reservedQty || 0));
  return { variants, availableVariants, availableStock, isAvailable: variants.length ? availableVariants.length > 0 : availableStock > 0 };
};

function categoryIcon() {
  return <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
    <path d="M4 7.5h2.3l1.8 8.2a1.7 1.7 0 0 0 1.7 1.3h6.4a1.7 1.7 0 0 0 1.6-1.2L20 10H7" />
    <circle cx="10" cy="20" r="1" />
    <circle cx="17" cy="20" r="1" />
  </svg>;
}

function featuredProductCard(product, downPaymentPercent) {
  const { variants, availableVariants, availableStock } = productAvailability(product);
  const price = variants.length
    ? Math.min(...availableVariants.map((variant) => Number(variant.price)))
    : Number(product.price);
  const percent = downPaymentPercent == null ? Number.NaN : Number(downPaymentPercent);
  const downPayment = Number.isFinite(percent)
    ? Math.round((price * percent / 100 + Number.EPSILON) * 100) / 100
    : null;
  return <ShopProductCard
    key={product._id}
    to={{ pathname: '/customer/shop', search: getProductModalSearch('', product._id) }}
    product={product}
    variants={variants}
    selectedStock={availableStock}
    price={price}
    downPayment={downPayment}
    downPaymentPercent={percent}
    isOutOfStock={false}
    categoryIcon={categoryIcon}
  />;
}

export default function Landing() {
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [services, setServices] = useState([]);
  const [shopSettings, setShopSettings] = useState(null);
  const [downPaymentPercent, setDownPaymentPercent] = useState(null);
  const [hasCustomerAccount] = useState(() => {
    const token = getAuthToken('customer');
    return Boolean(token && token !== 'prototype-guest');
  });
  const featuredProducts = useMemo(() => selectLandingProducts(products), [products]);
  const popularServices = useMemo(() => selectLandingServices(services), [services]);
  const visitDetails = getVisitDetails(shopSettings);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      api.getProducts(1, 4),
      api.getServices(),
      api.getShopSettings()
    ]).then(([productsResult, servicesResult, settingsResult]) => {
      if (!active) return;
      if (productsResult.status === 'fulfilled') setProducts(productsResult.value.products || []);
      if (servicesResult.status === 'fulfilled') setServices(servicesResult.value.services || []);
      if (settingsResult.status === 'fulfilled') {
        const settings = settingsResult.value.settings || null;
        setShopSettings(settings);
        setDownPaymentPercent(settings?.downPaymentPercent ?? null);
      }
    }).finally(() => {
      if (active) setProductsLoading(false);
    });
    return () => { active = false; };
  }, []);

  return <CustomerPage title="Home" description="Everything your ride needs.">
    <div className="landing-content">
      <section className="shop-market-hero landing-hero" aria-label="Manoy's Motorcycle home">
        <div className="shop-promo-primary landing-hero-primary">
          <p>MANOY&apos;S MOTORCYCLE PARTS, ACCESSORIES &amp; SERVICES</p>
          <h1>Everything your ride needs.</h1>
          <span>Quality parts, trusted accessories, and expert service in one place. Reserve online, pay the down payment, and pick up at the shop.</span>
          <div className="landing-hero-actions">
            <Link to="/customer/shop">Shop parts</Link>
            <Link to="/customer/services">Book a service</Link>
          </div>
        </div>
        <div className="landing-hero-logo" aria-hidden="true">
          <img src="/logo.svg" alt="" width="168" height="168" />
        </div>
      </section>

      <section className="landing-trust-strip" aria-label="Shop highlights">
        <div><strong>Ride-ready essentials</strong></div>
        <div><strong>Expert service support</strong></div>
        <div><strong>Pickup only. No delivery.</strong></div>
      </section>

        {shouldShowFeaturedProducts(productsLoading, featuredProducts) && <section className="landing-section" aria-labelledby="landing-featured-title">
        <div className="landing-section-heading">
          <h2 id="landing-featured-title">Featured products</h2>
          <Link to="/customer/shop">View all products</Link>
        </div>
        <div className="landing-product-grid" aria-busy={productsLoading}>
          {productsLoading
            ? Array.from({ length: 4 }, (_, index) => <article className="landing-product-skeleton" key={`product-skeleton-${index}`} aria-hidden="true"><div /><span /><span /></article>)
            : featuredProducts.map((product) => featuredProductCard(product, downPaymentPercent))}
        </div>
      </section>}

      <section className="landing-section" aria-labelledby="landing-services-title">
        <div className="landing-section-heading">
          <h2 id="landing-services-title">Popular services</h2>
          <Link to="/customer/services">View all services</Link>
        </div>
        <div className="landing-services-grid">
          {popularServices.map((service) => <ServiceCard service={service} useInlineIcon key={service._id} />)}
          <article className="landing-labor-card">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14.2 6.1a5 5 0 0 0 6.1 6.1L12 20.5a2.1 2.1 0 0 1-3-3l8.3-8.3a5 5 0 0 0-6.1-6.1l3 3-2.8 2.8-3-3a5 5 0 0 0 6.1 6.1" /></svg>
            <h3>Already have your parts?</h3>
            <p>Book just the mechanic&apos;s labor, with no shop parts to buy.</p>
            <Link to="/customer/services?parts=own">Book labor only</Link>
          </article>
        </div>
      </section>

      <section className="landing-section landing-how" aria-labelledby="landing-how-title">
        <h2 id="landing-how-title">How it works</h2>
        <div className="landing-how-grid">
          <article>
            <h3>Parts</h3>
            <ol><li>Reserve your item</li><li>Pay the down payment (GCash)</li><li>Pick up at the shop and pay the balance</li></ol>
          </article>
          <article>
            <h3>Services</h3>
            <ol><li>Choose a service, date and time</li><li>Pay the down payment (GCash)</li><li>A mechanic handles the rest</li></ol>
          </article>
        </div>
      </section>

      {visitDetails && <section className="landing-section landing-visit" aria-labelledby="landing-visit-title">
        <h2 id="landing-visit-title">Visit us</h2>
        <div className="landing-visit-details">
          {visitDetails.address && <p>{visitDetails.address}</p>}
          {visitDetails.hours && <p>Hours: {visitDetails.hours}</p>}
          {visitDetails.contact && <p>Contact: <a href={`tel:${visitDetails.contact.replace(/[^\d+]/g, '')}`}>{visitDetails.contact}</a></p>}
          <p>Pickup only. No delivery.</p>
        </div>
        {visitDetails.address && <a className="landing-map-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visitDetails.address)}`} target="_blank" rel="noreferrer">Open in Maps</a>}
      </section>}

      {!hasCustomerAccount && <section className="landing-final-cta" aria-label="Customer account">
        <div>
          <h2>Ready to ride?</h2>
          <p>Create an account to reserve parts and book services.</p>
        </div>
        <div><Link to="/customer/login">Sign in</Link><Link to="/customer/register">Register</Link></div>
      </section>}
    </div>
  </CustomerPage>;
}