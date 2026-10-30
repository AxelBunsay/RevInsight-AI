import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCustomerPrototype } from './useCustomerPrototype';
import { api } from '../../services/api';
import ProductImage from './ProductImage';
import { clearCustomerAuthAction, readCustomerAuthAction, saveCustomerAuthAction } from './customerAuthAction';
import { getProductDetailSelection, getVariantAvailability } from './productDetailHelpers';
import '../styles/customer-flow.css';

const formatPrice = (price) => `₱${Number(price || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

export default function ProductDetailContent({
  productId,
  isModal = false,
  headingId = 'product-detail-title',
  onProductLoaded
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { addCartItem } = useCustomerPrototype();
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [product, setProduct] = useState(null);
  const [error, setError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [downPaymentPercent, setDownPaymentPercent] = useState(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const resumedActionRef = useRef('');
  const returnPath = `${location.pathname}${location.search}`;

  useEffect(() => {
    let active = true;
    api.getProduct(productId).then((response) => {
      if (!active) return;
      const item = response.product;
      setProduct({
        ...item,
        quantity: Math.max(0, Number(item.quantity || 0) - Number(item.reservedQty || 0))
      });
      onProductLoaded?.(item);
      const availableVariant = (item.variants || []).find((variant) => getVariantAvailability(variant) > 0);
      setSelectedVariantId(availableVariant ? String(availableVariant._id) : String(item.variants?.[0]?._id || ''));
    }).catch((requestError) => {
      if (active) setError(requestError.message || 'This item could not be loaded.');
    });
    return () => { active = false; };
  }, [onProductLoaded, productId]);

  useEffect(() => {
    let active = true;
    api.getShopSettings().then((response) => {
      if (active) setDownPaymentPercent(Number(response.settings?.downPaymentPercent));
    }).catch(() => {
      if (active) setDownPaymentPercent(null);
    }).finally(() => {
      if (active) setSettingsLoaded(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!actionNotice || actionNotice === 'Added to Reservation Cart') return undefined;
    const timeout = window.setTimeout(() => setActionNotice(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [actionNotice]);

  useEffect(() => {
    if (isModal || !location.state?.resumeAction || !product) return undefined;
    const action = readCustomerAuthAction();
    if (!action || action.type !== 'item' || action.itemId !== productId || action.returnPath !== returnPath) {
      clearCustomerAuthAction();
      navigate(returnPath, { replace: true, state: null });
      return undefined;
    }
    const actionKey = `${action.createdAt}:${action.itemId}:${action.variantId || ''}`;
    if (resumedActionRef.current === actionKey) return undefined;
    resumedActionRef.current = actionKey;
    let active = true;
    api.getProduct(productId).then((response) => {
      if (!active) return;
      const latest = response.product;
      const variant = action.variantId
        ? (latest.variants || []).find((item) => String(item._id) === String(action.variantId))
        : null;
      if (latest.variants?.length && !variant) {
        setActionNotice('The selected variant is no longer available. Please choose another option.');
        return;
      }
      const available = variant
        ? getVariantAvailability(variant)
        : Math.max(0, Number(latest.quantity || 0) - Number(latest.reservedQty || 0));
      if (available < action.quantity) {
        setActionNotice('This item is no longer available in the requested quantity. Please choose another item or quantity.');
        return;
      }
      addCartItem({
        kind: 'product',
        id: latest._id,
        ...(variant ? { variantId: variant._id, variantLabel: variant.label } : {}),
        name: variant?.label ? `${latest.name} - ${variant.label}` : latest.name,
        price: Number(variant?.price ?? latest.price),
        stock: available,
        category: latest.category,
        icon: latest.icon,
        imageUrl: variant?.imageUrl || latest.imageUrl || latest.image || '',
        quantity: action.quantity
      });
      setActionNotice('Added to Reservation Cart');
    }).catch((requestError) => {
      if (active) setActionNotice(requestError.message || 'This item is no longer available. Please choose another item.');
    }).finally(() => {
      if (active) {
        clearCustomerAuthAction();
        navigate(returnPath, { replace: true, state: null });
      }
    });
    return () => { active = false; };
  }, [addCartItem, isModal, location.state, navigate, product, productId, returnPath]);

  const {
    variants,
    selectedVariant,
    availableStock,
    displayedPrice,
    displayedImage,
    variantLabel,
    isOutOfStock
  } = getProductDetailSelection(product, selectedVariantId);
  const downPayment = Number.isFinite(downPaymentPercent)
    ? Math.round((displayedPrice * downPaymentPercent / 100 + Number.EPSILON) * 100) / 100
    : null;

  const addProduct = (goToCart = false) => {
    if (!product || availableStock <= 0) return;
    const customerToken = localStorage.getItem('customerToken');
    if (!customerToken || customerToken === 'prototype-guest') {
      saveCustomerAuthAction({
        type: 'item',
        returnPath,
        itemId: product._id,
        ...(selectedVariant ? { variantId: selectedVariant._id } : {}),
        quantity
      });
      navigate('/customer/login');
      return;
    }
    addCartItem({
      kind: 'product',
      id: product._id,
      ...(selectedVariant ? { variantId: selectedVariant._id, variantLabel: selectedVariant.label } : {}),
      name: selectedVariant?.label ? `${product.name} - ${selectedVariant.label}` : product.name,
      price: displayedPrice,
      stock: availableStock,
      category: product.category,
      icon: product.icon,
      imageUrl: displayedImage || '',
      quantity
    });
    if (goToCart) {
      navigate('/customer/cart', { state: { message: `${product.name} added to your Reservation Cart.` } });
      return;
    }
    setActionNotice('Added to Reservation Cart');
  };

  if (!product) {
    return <section className="customer-product-detail-state" aria-live="polite">
      <h1 id={headingId}>{error ? 'Product unavailable' : 'Loading product details'}</h1>
      {error
        ? <p className="customer-error" role="alert">{error}</p>
        : <p>Loading product details...</p>}
      {error && <Link to="/customer/shop">Back to Shop</Link>}
    </section>;
  }

  return <div className={`customer-product-detail-content${isModal ? ' is-modal' : ''}`}>
    {actionNotice && actionNotice !== 'Added to Reservation Cart' && <p className="customer-error" role="alert">{actionNotice}</p>}
    <section className="customer-detail-layout">
      <div className={`customer-detail-art product-tone-${product.category}`} aria-label={`${product.name} product image`}>
        <ProductImage
          src={displayedImage}
          alt={product.name}
          className="customer-detail-product-image"
          loading="eager"
          fallback={<><span aria-hidden="true">{product.icon}</span><small>{product.category}</small></>}
        />
      </div>
      <div className="customer-detail-copy">
        <p className="customer-eyebrow">{product.category}</p>
        <h1 id={headingId}>{product.name}</h1>
        {product.description && <p>{product.description}</p>}
        {variants.length > 0 && <label className="customer-detail-variant-select">
          <span>{variantLabel}:</span>
          <select
            aria-label={`${variantLabel} for ${product.name}`}
            value={selectedVariant ? String(selectedVariant._id) : ''}
            onChange={(event) => {
              const nextVariant = variants.find((variant) => String(variant._id) === event.target.value);
              setSelectedVariantId(event.target.value);
              setQuantity((current) => Math.min(current, Math.max(1, getVariantAvailability(nextVariant))));
            }}
          >
            {variants.map((variant) => (
              <option key={variant._id} value={String(variant._id)} disabled={getVariantAvailability(variant) === 0}>
                {variant.label || [variant.brand, variant.model, variant.size, variant.color].filter(Boolean).join(' · ')}
                {getVariantAvailability(variant) === 0 ? ' — Out of stock' : ''}
              </option>
            ))}
          </select>
        </label>}
        <strong className="customer-detail-price">{formatPrice(displayedPrice)}</strong>
        <p className={isOutOfStock ? 'customer-stock is-out' : 'customer-stock'}>
          {isOutOfStock ? 'Out of stock' : `Available: ${availableStock}`}
        </p>
        <p className="customer-detail-down-payment">
          {downPayment === null || !settingsLoaded
            ? 'Reserve now: unavailable'
            : `Reserve now: ${formatPrice(downPayment)} (${downPaymentPercent}%)`}
        </p>
        <div className="customer-quantity-control">
          <span>Quantity</span>
          <div>
            <button type="button" aria-label="Decrease quantity" disabled={isOutOfStock || quantity <= 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button>
            <output>{quantity}</output>
            <button type="button" aria-label="Increase quantity" disabled={isOutOfStock || quantity >= availableStock} onClick={() => setQuantity((value) => Math.min(availableStock, value + 1))}>+</button>
          </div>
        </div>
        <div className="customer-detail-actions">
          <button type="button" className="customer-primary-button" disabled={isOutOfStock} onClick={() => addProduct()}>Reserve</button>
          <button type="button" className="customer-secondary-button" disabled={isOutOfStock} onClick={() => addProduct(true)}>Reserve now</button>
        </div>
        {actionNotice === 'Added to Reservation Cart' && <div className={isModal ? 'customer-detail-success' : 'shop-added-toast'} role="status" aria-live="polite">
          <span>Added to Reservation Cart</span>
          <Link to="/customer/cart">View cart</Link>
          {!isModal && <button type="button" aria-label="Dismiss notification" onClick={() => setActionNotice('')}>×</button>}
        </div>}
      </div>
    </section>
  </div>;
}
