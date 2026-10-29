import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { CustomerPage } from './CustomerLayout';
import { useCustomerPrototype } from './useCustomerPrototype';
import ProductImage from './ProductImage';
import { calculateServiceAmounts, formatServiceName, serviceUnitSummary } from '../../utils/servicePricing';
import ServicePriceBreakdown from '../../components/ServicePriceBreakdown';
import { getCartSummary } from './serviceCart';
import '../styles/customer-flow.css';

const money = (value) => `₱${Number(value).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

export default function Cart() {
  const location = useLocation();
  const navigate = useNavigate();
  const { cart, updateCartItem, updateCartItemDetails, setCartItemStock, removeCartItem } = useCustomerPrototype();
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const products = cart.filter((item) => item.kind === 'product');
  const serviceItems = cart.filter((item) => item.kind === 'service');
  const [refreshingProducts, setRefreshingProducts] = useState(products.length > 0);
  const [refreshingServices, setRefreshingServices] = useState(serviceItems.length > 0);
  const isRefreshingProducts = products.length > 0 && refreshingProducts;
  const isRefreshingServices = serviceItems.length > 0 && refreshingServices;
  const { productSubtotal, serviceSubtotal: serviceTotal, downPayment, balanceDueAtPickup, cartTotal } = getCartSummary(
    cart,
    settings?.downPaymentPercent ?? 30
  );
  const productEntries = JSON.stringify(products.map(({ key, id, variantId }) => ({
    key, id, variantId
  })));
  const serviceEntries = JSON.stringify(serviceItems.map(({ key, id, serviceId, units }) => ({
    key, id: serviceId || id, units
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
            const amounts = calculateServiceAmounts(service.price, service.mechanicFee, units);
            if (isMounted) {
              updateCartItemDetails(item.key, {
                name: formatServiceName(service.name, units, service.unitLabel),
                serviceId: service._id,
                unitPrice: Number(service.price),
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

  return <CustomerPage title="Cart" description="Review products and service bookings.">
    <div className="customer-flow-page customer-cart-page">
      {location.state?.message && <p className="customer-success" role="status">{location.state.message}</p>}
      {error && <p className="customer-error" role="alert">{error}</p>}
      {cart.length === 0 ? <section className="customer-empty-cart"><span aria-hidden="true">▱</span><h2>Your cart is empty</h2><p>Add a part or book a service to get started.</p><div><Link className="customer-primary-button" to="/customer/shop">Browse parts</Link><Link className="customer-secondary-button" to="/customer/services">Explore services</Link></div></section> : <div className="customer-cart-layout">
        <section className="customer-cart-items" aria-label="Cart items and bookings">
          {cart.map((item) => <article className="customer-cart-item" key={item.key}>
            <div className={`customer-cart-item-art${item.kind === 'service' ? ' is-service' : ''}${item.kind === 'product' && item.imageUrl ? ' has-image' : ''}`} aria-hidden="true">{item.kind === 'product'
              ? <ProductImage src={item.imageUrl} alt="" className="customer-inline-product-image" loading="lazy" fallback={<span>{item.icon || '▣'}</span>} />
              : item.icon || '🔧'}</div>
            <div className="customer-cart-item-copy"><span className="customer-cart-item-kind">{item.kind === 'service' ? 'SERVICE BOOKING' : 'ITEM RESERVATION'}</span><h2>{item.name}</h2><p>{item.kind === 'service' ? `${item.units ? `${serviceUnitSummary(item.units, item.unitLabel)} · ` : ''}${item.bookingDate} · ${item.timeSlot} · ${item.vehicle}` : isRefreshingProducts ? 'Checking current price and stock...' : item.unavailable ? 'This option is no longer available. Remove it and choose another.' : `${money(item.price)} each · Only ${item.stock} left`}</p>{item.kind === 'service' && (isRefreshingServices ? <small>Refreshing service price...</small> : item.pricingUnavailable ? <small>Service pricing is unavailable.</small> : <ServicePriceBreakdown servicePriceTotal={item.servicePriceTotal} mechanicFeeTotal={item.mechanicFeeTotal} estimatedPrice={item.estimatedPrice ?? Number(item.price || 0) + Number(item.mechanicFee || 0)} />)} {item.notes && <small>Note: {item.notes}</small>}</div>
            <div className="customer-cart-item-actions">{item.kind === 'product' && <div className="customer-quantity-control"><div><button type="button" aria-label={`Decrease ${item.name} quantity`} disabled={item.quantity <= 1 || isRefreshingProducts} onClick={() => updateCartItem(item.key, item.quantity - 1)}>−</button><output>{item.quantity}</output><button type="button" aria-label={`Increase ${item.name} quantity`} disabled={item.quantity >= item.stock || isRefreshingProducts} onClick={() => updateCartItem(item.key, item.quantity + 1)}>+</button></div></div>}<strong>{item.kind === 'product' && (isRefreshingProducts || item.unavailable) || item.kind === 'service' && (isRefreshingServices || item.pricingUnavailable) ? '—' : item.kind === 'service' ? money(item.estimatedPrice ?? Number(item.price || 0) + Number(item.mechanicFee || 0)) : money(item.price * item.quantity)}</strong>{item.kind === 'service' && <Link className="customer-edit-item" to={`/customer/services/${item.serviceId || item.id}`} state={{ editCartKey: item.key }}>Edit</Link>}<button type="button" className="customer-remove-item" onClick={() => removeCartItem(item.key)}>Remove</button></div>
          </article>)}
          <Link className="customer-continue-link" to="/customer/shop">← Continue shopping</Link>
        </section>
        <aside className="customer-cart-summary">
          <h2>{products.length ? 'Reservation summary' : 'Booking summary'}</h2>
          {!!products.length && <>
            {isRefreshingProducts ? <p>Refreshing current prices and availability...</p> : <>
              <div className="customer-summary-line"><span>Items total</span><strong>{money(productSubtotal)}</strong></div>
              <div className="customer-summary-line"><span>Down payment ({settings?.downPaymentPercent ?? 30}%): due now</span><strong>{money(downPayment)}</strong></div>
              <div className="customer-summary-line"><span>Balance due at pickup</span><strong>{money(balanceDueAtPickup)}</strong></div>
            </>}
            <p className="customer-reservation-note">Your item is reserved only after the shop confirms your down payment.</p>
            {settings?.pickupAddress && <p className="customer-pickup-location">Pickup at {settings.pickupAddress}{settings.pickupHours ? ` · ${settings.pickupHours}` : ''}</p>}
          </>}
          {!!serviceItems.length && <>
            <section className="customer-service-cart-summary" aria-label="Service bookings summary">
              <h3>Service bookings</h3>
              {isRefreshingServices ? <p>Refreshing service prices...</p> : serviceItems.some((item) => item.pricingUnavailable) ? <p>Service pricing is unavailable. Try again before checkout.</p> : <>
                <div className="customer-summary-line"><span>Service bookings subtotal</span><strong>{money(serviceTotal)}</strong></div>
                <div className="customer-summary-line"><span>Amount due for services</span><strong>{money(serviceTotal)}</strong></div>
                <p className="customer-reservation-note">Choose cash at pickup or submit the full service total by GCash after booking.</p>
              </>}
            </section>
          </>}
          {!!products.length && !!serviceItems.length && <div className="customer-summary-total"><span>Cart total</span><strong>{isRefreshingProducts || isRefreshingServices || serviceItems.some((item) => item.pricingUnavailable) ? '—' : money(cartTotal)}</strong></div>}
          <button type="button" className="customer-primary-button customer-checkout-button" disabled={isRefreshingProducts || isRefreshingServices || serviceItems.some((item) => item.pricingUnavailable) || products.some((item) => item.unavailable || item.stock < 1 || item.quantity > item.stock)} onClick={() => navigate('/customer/checkout')}>{products.length ? 'Continue to checkout' : 'Continue to service checkout'}</button>
        </aside>
      </div>}
    </div>
  </CustomerPage>;
}
