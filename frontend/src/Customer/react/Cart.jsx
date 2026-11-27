import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { CustomerPage } from './CustomerLayout';
import { useCustomerPrototype } from './useCustomerPrototype';
import ProductImage from './ProductImage';
import { calculateServiceAmounts, formatServiceName, serviceUnitSummary } from '../../utils/servicePricing';
import ServicePriceBreakdown from '../../components/ServicePriceBreakdown';
import ServicePaymentOptions from './ServicePaymentOptions';
import { getCartSummary, isCartItemSelected } from './serviceCart';
import '../styles/customer-flow.css';

const money = (value) => `₱${Number(value).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

export default function Cart() {
  const location = useLocation();
  const navigate = useNavigate();
  const { cart, updateCartItem, updateCartItemDetails, setCartItemStock, setCartItemSelected, setCartSectionSelected, removeCartItem } = useCustomerPrototype();
  const [settings, setSettings] = useState(null);
  const [servicePaymentMethod, setServicePaymentMethod] = useState('Cash');
  const [error, setError] = useState('');
  const products = cart.filter((item) => item.kind === 'product');
  const serviceItems = cart.filter((item) => item.kind === 'service');
  const selectedProducts = products.filter(isCartItemSelected);
  const selectedServices = serviceItems.filter(isCartItemSelected);
  const cartSections = [
    { kind: 'product', tab: 'Shop', catalog: '/customer/shop', empty: 'No products in your cart', title: 'Product reservations', items: products },
    { kind: 'service', tab: 'Services', catalog: '/customer/services', empty: 'No service bookings in your cart', title: 'Service bookings', items: serviceItems }
  ];
  const [activeTab, setActiveTab] = useState(products.length || !serviceItems.length ? 'product' : 'service');
  function handleTabKey(event, kind) {
    let next;
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowRight': next = kind === 'product' ? 'service' : 'product'; break;
      case 'Home': next = 'product'; break;
      case 'End': next = 'service'; break;
      default: return;
    }
    event.preventDefault();
    setActiveTab(next);
    document.getElementById('cart-tab-' + next).focus();
  }
  const [refreshingProducts, setRefreshingProducts] = useState(products.length > 0);
  const [refreshingServices, setRefreshingServices] = useState(serviceItems.length > 0);
  const isRefreshingProducts = selectedProducts.length > 0 && refreshingProducts;
  const isRefreshingServices = selectedServices.length > 0 && refreshingServices;
  const { productSubtotal, serviceSubtotal: serviceTotal, downPayment, balanceDueAtPickup } = getCartSummary(
    cart,
    settings?.downPaymentPercent ?? 30
  );
  const productEntries = JSON.stringify(products.map(({ key, id, variantId }) => ({
    key, id, variantId
  })));
  const serviceEntries = JSON.stringify(serviceItems.map(({ key, id, serviceId, units, partsSource }) => ({
    key, id: serviceId || id, units, partsSource
  })));

  useEffect(() => {
    let isMounted = true;
    api.getReservationSettings().then((response) => {
      if (isMounted) setSettings(response.settings);
    }).catch((requestError) => {
      if (isMounted) setError(requestError.message || 'Pickup details could not be loaded.');
    });
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const refreshStock = async () => {
      const entries = JSON.parse(productEntries);
      setRefreshingProducts(entries.length > 0);
      try {
        await Promise.all(entries.map(async (item) => {
          try {
            const response = await api.getProduct(item.id);
            const product = response.product;
            const variant = item.variantId
              ? (product.variants || []).find((entry) => String(entry._id) === String(item.variantId))
              : null;
            if (product.variants?.length && !variant) {
              if (isMounted) setCartItemStock(item.key, 0, null, undefined, '', true);
              return;
            }
            const available = variant
              ? Math.max(0, Number(variant.available ?? (Number(variant.stock || 0) - Number(variant.reservedQty || 0))))
              : Math.max(0, Number(product.quantity || 0) - Number(product.reservedQty || 0));
            const name = variant?.label
              ? `${product.name} - ${variant.label}`
              : product.name;
            if (isMounted) {
              setCartItemStock(
                item.key,
                available,
                Number(variant?.price ?? product.price),
                name,
                variant?.imageUrl || product.imageUrl || product.image || '',
                false
              );
            }
          } catch (requestError) {
            if (isMounted) {
              setCartItemStock(item.key, 0, null, undefined, '', true);
              setError(requestError.message || 'Could not refresh item price and stock.');
            }
          }
        }));
      } finally {
        if (isMounted) setRefreshingProducts(false);
      }
    };
    if (productEntries !== '[]') refreshStock();
    return () => { isMounted = false; };
  }, [productEntries, setCartItemStock]);

  useEffect(() => {
    let isMounted = true;
    const refreshServicePrices = async () => {
      const entries = JSON.parse(serviceEntries);
      setRefreshingServices(entries.length > 0);
      try {
        await Promise.all(entries.map(async (item) => {
          try {
            const response = await api.getService(item.id);
            const service = response.service;
            const units = service.pricePerUnit ? Number(item.units || 1) : 1;
            if (item.partsSource === 'customer' && service.laborOnlyPrice == null) {
              if (isMounted) updateCartItemDetails(item.key, { pricingUnavailable: true });
              return;
            }
            const unitPrice = Number(item.partsSource === 'customer' ? service.laborOnlyPrice : service.price);
            const amounts = calculateServiceAmounts(unitPrice, service.mechanicFee, units);
            if (isMounted) {
              updateCartItemDetails(item.key, {
                name: formatServiceName(service.name, units, service.unitLabel),
                serviceId: service._id,
                partsSource: item.partsSource || 'shop',
                unitPrice,
                unitMechanicFee: Number(service.mechanicFee || 0),
                price: amounts.servicePriceTotal,
                mechanicFee: amounts.mechanicFeeTotal,
                ...amounts,
                ...(service.pricePerUnit ? { units, unitLabel: service.unitLabel } : { units: undefined, unitLabel: undefined }),
                category: service.category,
                pricingUnavailable: false
              });
            }
          } catch (requestError) {
            if (isMounted) {
              updateCartItemDetails(item.key, { pricingUnavailable: true });
              setError(requestError.message || 'Could not refresh service pricing.');
            }
          }
        }));
      } finally {
        if (isMounted) setRefreshingServices(false);
      }
    };
    if (serviceEntries !== '[]') refreshServicePrices();
    return () => { isMounted = false; };
  }, [serviceEntries, updateCartItemDetails]);

  return <CustomerPage title="Cart">
    <div className="customer-flow-page customer-cart-page">
      <div className="customer-cart-tabs" role="tablist" aria-label="Cart sections">
        {cartSections.map(({ kind, tab, items }) => <button type="button" role="tab" key={kind}
          id={`cart-tab-${kind}`} aria-controls={`cart-panel-${kind}`} aria-selected={activeTab === kind}
          tabIndex={activeTab === kind ? 0 : -1} onClick={() => setActiveTab(kind)} onKeyDown={event => handleTabKey(event, kind)}>
          {tab} ({items.length})
        </button>)}
      </div>
      {location.state?.message && <p className="customer-success" role="status">{location.state.message}</p>}
      {error && <p className="customer-error" role="alert">{error}</p>}
      {cartSections.map(section => <div key={section.kind} role="tabpanel" hidden={activeTab !== section.kind}
        id={`cart-panel-${section.kind}`} aria-labelledby={`cart-tab-${section.kind}`}>
        {section.items.length ? <div className="customer-cart-layout">
          <section className="customer-cart-card" aria-labelledby={`cart-${section.kind}-title`}>
            <div className="customer-cart-section">
              <h2 id={`cart-${section.kind}-title`}>{section.title}</h2>
              <label className="customer-cart-section__select">
                <input
                  type="checkbox"
                  checked={section.items.every(isCartItemSelected)}
                  onChange={(event) => setCartSectionSelected(section.kind, event.target.checked)}
                  aria-label={`Select all ${section.title.toLowerCase()}`}
                />
                <strong>Select all</strong>
              </label>
              {section.items.map((item) => <article className="customer-cart-item" key={item.key}>
              <label className="customer-cart-item-select">
                <input
                  type="checkbox"
                  checked={isCartItemSelected(item)}
                  onChange={(event) => setCartItemSelected(item.key, event.target.checked)}
                  aria-label={`Select ${item.name}`}
                />
              </label>
              <div className={`customer-cart-item-art${item.kind === 'service' ? ' is-service' : ''}${item.kind === 'product' && item.imageUrl ? ' has-image' : ''}`} aria-hidden="true">{item.kind === 'product'
                ? <ProductImage src={item.imageUrl} alt="" className="customer-inline-product-image" loading="lazy" fallback={<span>{item.icon || '▣'}</span>} />
                : <svg viewBox="0 0 48 48" focusable="false"><path d="M29.8 6.5a13 13 0 0 0-17.1 17.1L5.5 30.8a4.1 4.1 0 0 0 5.8 5.8l7.2-7.2a13 13 0 0 0 17.1-17.1l-8.1 8.1-7.2-7.2 8.1-8.1Z" /></svg>}</div>
              <div className="customer-cart-item-copy"><span className="customer-cart-item-kind">{item.kind === 'service' ? 'SERVICE BOOKING' : 'ITEM RESERVATION'}</span>{item.kind === 'service' && item.partsSource === 'customer' && <span className="customer-parts-source-tag">Own parts</span>}<h3>{item.name}</h3><p>{item.kind === 'service' ? `${item.units ? `${serviceUnitSummary(item.units, item.unitLabel)} · ` : ''}${item.bookingDate || ''} · ${item.timeSlot} · ${item.vehicle}` : refreshingProducts ? 'Checking current price and stock...' : item.unavailable ? 'This option is no longer available. Remove it and choose another.' : `${money(item.price)} each · Only ${item.stock} left`}</p>{item.kind === 'service' && (refreshingServices ? <small>Refreshing service price...</small> : item.pricingUnavailable ? <small>Service pricing is unavailable.</small> : <ServicePriceBreakdown servicePriceTotal={item.servicePriceTotal} mechanicFeeTotal={item.mechanicFeeTotal} estimatedPrice={item.estimatedPrice ?? Number(item.price || 0) + Number(item.mechanicFee || 0)} />)} {item.notes && <small>Note: {item.notes}</small>}</div>
              <div className="customer-cart-item-actions">{item.kind === 'product' && <div className="customer-quantity-control"><div><button type="button" aria-label={`Decrease ${item.name} quantity`} disabled={item.quantity <= 1 || refreshingProducts} onClick={() => updateCartItem(item.key, item.quantity - 1)}>−</button><output>{item.quantity}</output><button type="button" aria-label={`Increase ${item.name} quantity`} disabled={item.quantity >= item.stock || refreshingProducts} onClick={() => updateCartItem(item.key, item.quantity + 1)}>+</button></div></div>}<strong>{item.kind === 'product' && (refreshingProducts || item.unavailable) || item.kind === 'service' && (refreshingServices || item.pricingUnavailable) ? '—' : item.kind === 'service' ? money(item.estimatedPrice ?? Number(item.price || 0) + Number(item.mechanicFee || 0)) : money(item.price * item.quantity)}</strong>{item.kind === 'service' && <Link className="customer-edit-item" to={`/customer/services/${item.serviceId || item.id}${item.partsSource === 'customer' ? '?parts=own' : ''}`} state={{ editCartKey: item.key }}>Edit</Link>}<button type="button" className="customer-remove-item" onClick={() => removeCartItem(item.key)}>Remove</button></div>
              </article>)}
            </div>
            <div className="customer-cart-summary">
              <h3>Payment summary</h3>
              {section.kind === 'product' ? <>
                {isRefreshingProducts ? <p>Refreshing current prices and availability...</p> : <>
                  <div className="customer-summary-line"><span>Selected products subtotal</span><strong>{money(productSubtotal)}</strong></div>
                  <div className="customer-summary-line"><span>Down payment ({settings?.downPaymentPercent ?? 30}%): due now</span><strong>{money(downPayment)}</strong></div>
                  <div className="customer-summary-line"><span>Balance due at pickup</span><strong>{money(balanceDueAtPickup)}</strong></div>
                </>}
                <p className="customer-reservation-note">Checkout holds your items until the payment deadline. Submit your down payment to keep the reservation.</p>
                {settings?.pickupAddress && <p className="customer-pickup-location">Pickup at {settings.pickupAddress}{settings.pickupHours ? ` · ${settings.pickupHours}` : ''}</p>}
                <button type="button" className="customer-primary-button customer-checkout-button" disabled={!selectedProducts.length || isRefreshingProducts || selectedProducts.some((item) => item.unavailable || item.stock < 1 || item.quantity < 1 || item.quantity > item.stock)} onClick={() => navigate('/customer/checkout?flow=products')}>Check out products</button>
              </> : <>
                {isRefreshingServices ? <p>Refreshing service prices...</p> : selectedServices.some((item) => item.pricingUnavailable) ? <p>Service pricing is unavailable. Try again before checkout.</p> :
                  <div className="customer-summary-line"><span>Selected service total</span><strong>{money(serviceTotal)}</strong></div>}
                <ServicePaymentOptions payment={servicePaymentMethod} onChange={setServicePaymentMethod} />
                <button type="button" className="customer-primary-button customer-checkout-button" disabled={!selectedServices.length || isRefreshingServices || selectedServices.some((item) => item.pricingUnavailable)} onClick={() => navigate('/customer/checkout?flow=services', { state: { servicePaymentMethod } })}>Check out services</button>
              </>}
            </div>
          </section>
          <Link className="customer-continue-link" to={section.catalog}>{section.kind === 'product' ? '← Continue shopping' : '← Browse services'}</Link>
        </div> : <section className="customer-empty-cart">
          <h2>{section.empty}</h2>
          <Link className="customer-primary-button" to={section.catalog}>{section.kind === 'product' ? 'Browse parts' : 'Browse services'}</Link>
        </section>}
      </div>)}
    </div>
  </CustomerPage>;
}
