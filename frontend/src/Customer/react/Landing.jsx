import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAuthToken } from '../../auth/authSession';
import { api } from '../../services/api';
import ShopProductCard from './ShopProductCard';
import { CustomerPage } from './CustomerLayout';
import { selectLandingProducts, selectLandingServices, shouldShowFeaturedProducts } from './landingData';
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
  const [downPaymentPercent, setDownPaymentPercent] = useState(null);
  const [hasCustomerAccount] = useState(() => {
    const token = getAuthToken('customer');
    return Boolean(token && token !== 'prototype-guest');
  });
  const featuredProducts = useMemo(() => selectLandingProducts(products), [products]);
  const popularServices = useMemo(() => selectLandingServices(services), [services]);
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
          <h1>Everything your ride needs.</h1>
          <span>Quality parts, trusted accessories, and expert service in one place. Reserve online, pay the down payment, and pick up at the shop.</span>
          <div className="landing-hero-actions">
            <Link to="/customer/shop">Shop parts</Link>
            <Link to="/customer/services">Book a service</Link>
          </div>
        </div>
      </section>

      <section className="landing-trust-strip" aria-label="Shop highlights">
        <div className="landing-trust-card">
          <span className="landing-trust-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M4 13.5h16l-1.6-5a2 2 0 0 0-1.9-1.4H7.5a2 2 0 0 0-1.9 1.4L4 13.5Zm0 0v4h2m12 0h2v-4m-14 0v2h16v-2M7 17.5v1m10-1v1" /><circle cx="7" cy="13.5" r="1" /><circle cx="17" cy="13.5" r="1" /></svg></span>
          <div><strong>Ride-ready essentials</strong><p>Parts selected for everyday maintenance.</p></div>
        </div>
        <div className="landing-trust-card">
          <span className="landing-trust-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M12 3.5 19 6v5.3c0 4.3-2.8 7.4-7 9.2-4.2-1.8-7-4.9-7-9.2V6l7-2.5Z" /><path d="m9 12 2 2 4-4" /></svg></span>
          <div><strong>Expert service support</strong><p>Book a mechanic when you need one.</p></div>
        </div>
        <div className="landing-trust-card">
          <span className="landing-trust-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M4 7h10v10H4zM14 10h3l3 3v4h-6" /><circle cx="8" cy="18" r="1.7" /><circle cx="17" cy="18" r="1.7" /></svg></span>
          <div><strong>Pickup only. No delivery.</strong><p>Reserve online, collect at the shop.</p></div>
        </div>
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
          <article className="landing-how-parts">
            <h3>Parts</h3>
            <ol><li><span className="landing-step-number">1</span><span>Reserve your item</span></li><li><span className="landing-step-number">2</span><span>Pay the down payment (GCash)</span></li><li><span className="landing-step-number">3</span><span>Pick up at the shop and pay the balance</span></li></ol>
          </article>
          <article className="landing-how-services">
            <h3>Services</h3>
            <ol><li><span className="landing-step-number">1</span><span>Choose a service, date and time</span></li><li><span className="landing-step-number">2</span><span>Pay the down payment (GCash)</span></li><li><span className="landing-step-number">3</span><span>A mechanic handles the rest</span></li></ol>
          </article>
        </div>
      </section>

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