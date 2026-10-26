import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { CustomerPage } from './CustomerLayout';
import { useCustomerPrototype } from './useCustomerPrototype';
import ProductImage from './ProductImage';
import '../styles/customer-flow.css';

const money = (value) => `₱${Number(value).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

export default function Cart() {
  const location = useLocation();
  const navigate = useNavigate();
  const { cart, updateCartItem, setCartItemStock, removeCartItem } = useCustomerPrototype();
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const products = cart.filter((item) => item.kind === 'product');
  const productSubtotal = products.reduce((total, item) => total + item.price * item.quantity, 0);
  const serviceItems = cart.filter((item) => item.kind === 'service');
  const serviceTotal = serviceItems.reduce((total, item) => total + item.price, 0);
  const downPayment = Math.round((productSubtotal * (settings?.downPaymentPercent ?? 30) / 100 + Number.EPSILON) * 100) / 100;
  const productEntries = JSON.stringify(products.map(({ key, id, name }) => ({ key, id, name })));

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
      await Promise.all(JSON.parse(productEntries).map(async (item) => {
        try {
          const response = await api.getProduct(item.id);
          const product = response.product;
          const available = Math.max(0, Number(product.quantity || 0) - Number(product.reservedQty || 0));
          if (isMounted) setCartItemStock(item.key, available, Number(product.price), product.name);
        } catch {
          if (isMounted) {
            setError('Could not check stock');
          }
        }
      }));
    };
    if (productEntries !== '[]') refreshStock();
    return () => { isMounted = false; };
  }, [productEntries, setCartItemStock]);

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
            <div className="customer-cart-item-copy"><span className="customer-cart-item-kind">{item.kind === 'service' ? 'SERVICE BOOKING' : 'ITEM RESERVATION'}</span><h2>{item.name}</h2><p>{item.kind === 'service' ? `${item.bookingDate} · ${item.timeSlot} · ${item.vehicle}` : `${money(item.price)} each · Only ${item.stock} left`}</p>{item.notes && <small>Note: {item.notes}</small>}</div>
            <div className="customer-cart-item-actions">{item.kind === 'product' && <div className="customer-quantity-control"><div><button type="button" aria-label={`Decrease ${item.name} quantity`} disabled={item.quantity <= 1} onClick={() => updateCartItem(item.key, item.quantity - 1)}>−</button><output>{item.quantity}</output><button type="button" aria-label={`Increase ${item.name} quantity`} disabled={item.quantity >= item.stock} onClick={() => updateCartItem(item.key, item.quantity + 1)}>+</button></div></div>}<strong>{money(item.price * item.quantity)}</strong><button type="button" className="customer-remove-item" onClick={() => removeCartItem(item.key)}>Remove</button></div>
          </article>)}
          <Link className="customer-continue-link" to="/customer/shop">← Continue shopping</Link>
        </section>
        <aside className="customer-cart-summary">
          <h2>{products.length ? 'Reservation summary' : 'Booking summary'}</h2>
          {!!products.length && <>
            <div className="customer-summary-line"><span>Items total</span><strong>{money(productSubtotal)}</strong></div>
            <div className="customer-summary-line"><span>Down payment ({settings?.downPaymentPercent ?? 30}%): due now</span><strong>{money(downPayment)}</strong></div>
            <div className="customer-summary-line"><span>Balance due at pickup</span><strong>{money(productSubtotal - downPayment)}</strong></div>
            <p className="customer-reservation-note">Your item is reserved only after the shop confirms your down payment.</p>
            {settings?.pickupAddress && <p className="customer-pickup-location">Pickup at {settings.pickupAddress}{settings.pickupHours ? ` · ${settings.pickupHours}` : ''}</p>}
          </>}
          {!!serviceItems.length && !products.length && <div className="customer-summary-total"><span>Service total</span><strong>{money(serviceTotal)}</strong></div>}
          <button type="button" className="customer-primary-button customer-checkout-button" disabled={products.some((item) => item.stock < 1 || item.quantity > item.stock)} onClick={() => navigate('/customer/checkout')}>{products.length ? 'Continue to checkout' : 'Continue to service checkout'}</button>
        </aside>
      </div>}
    </div>
  </CustomerPage>;
}
