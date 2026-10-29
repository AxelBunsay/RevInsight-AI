import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { CustomerPage } from './CustomerLayout';
import { useCustomerPrototype } from './useCustomerPrototype';
import { api } from '../../services/api';
import ProductImage from './ProductImage';
import { clearCustomerAuthAction, readCustomerAuthAction, saveCustomerAuthAction } from './customerAuthAction';
import '../styles/customer-flow.css';

const variantAvailable = (variant) => Math.max(
  0,
  Number(variant.available ?? (Number(variant.stock || 0) - Number(variant.reservedQty || 0)))
);

export default function ProductDetail() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { wishlist, toggleWishlist, addCartItem } = useCustomerPrototype();
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [product, setProduct] = useState(null);
  const [error, setError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const resumedActionRef = useRef('');

  useEffect(() => {
    let isMounted = true;
    api.getProduct(productId).then((response) => {
      if (isMounted) {
        const item = response.product;
        setProduct({ ...item, quantity: Math.max(0, Number(item.quantity || 0) - Number(item.reservedQty || 0)) });
        const availableVariant = (item.variants || []).find((variant) => variantAvailable(variant) > 0);
        setSelectedVariantId(availableVariant ? String(availableVariant._id) : String(item.variants?.[0]?._id || ''));
      }
    }).catch((requestError) => {
      if (isMounted) setError(requestError.message || 'This item could not be loaded.');
    });
    return () => { isMounted = false; };
  }, [productId]);

  useEffect(() => {
    if (!actionNotice) return undefined;
    const timeout = window.setTimeout(() => setActionNotice(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [actionNotice]);

  useEffect(() => {
    if (!location.state?.resumeAction || !product) return undefined;
    const action = readCustomerAuthAction();
    if (!action || action.type !== 'item' || action.itemId !== productId || action.returnPath !== location.pathname) {
      clearCustomerAuthAction();
      navigate(location.pathname, { replace: true, state: null });
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
        ? variantAvailable(variant)
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
        navigate(location.pathname, { replace: true, state: null });
      }
    });
    return () => { active = false; };
  }, [addCartItem, location.pathname, location.state, navigate, product, productId]);

  if (!product) return <CustomerPage title={error ? 'Product unavailable' : 'Loading product'} description={error || 'Loading product details.'}><Link to="/customer/shop">Back to Shop</Link></CustomerPage>;

  const variants = product.variants || [];
  const selectedVariant = variants.find((variant) => String(variant._id) === selectedVariantId)
    || variants.find((variant) => variantAvailable(variant) > 0)
    || variants[0];
  const availableStock = selectedVariant ? variantAvailable(selectedVariant) : product.quantity;
  const displayedPrice = Number(selectedVariant?.price ?? product.price);
  const displayedImage = selectedVariant?.imageUrl || product.imageUrl || product.image;
  const addProduct = (goToCart = false) => {
    const customerToken = localStorage.getItem('customerToken');
    if (!customerToken || customerToken === 'prototype-guest') {
      saveCustomerAuthAction({
        type: 'item',
        returnPath: location.pathname,
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
    if (goToCart) navigate('/customer/cart', { state: { message: `${product.name} added to your Reservation Cart.` } });
  };

  return <CustomerPage title={product.name} description="Product details and availability.">
    <div className="customer-flow-page">
      {actionNotice && !actionNotice.startsWith('Added') && <p className="customer-error" role="alert">{actionNotice}</p>}
      <nav className="customer-breadcrumbs" aria-label="Breadcrumb"><Link to="/customer/shop">Shop</Link><span>/</span><span>{product.category}</span><span>/</span><span>{product.name}</span></nav>
      <section className="customer-detail-layout">
        <div className={`customer-detail-art product-tone-${product.category}`} aria-label={`${product.name} product image`}><ProductImage src={displayedImage} alt={product.name} className="customer-detail-product-image" fallback={<><span aria-hidden="true">{product.icon}</span><small>{product.category}</small></>} /></div>
        <div className="customer-detail-copy">
          <p className="customer-eyebrow">{product.category}</p>
          <h1>{product.name}</h1>
          <p>{product.description}</p>
          {variants.length > 0 && <label className="customer-detail-variant-select">
            <span>Choose an option</span>
            <select
              aria-label={`Choose a variant for ${product.name}`}
              value={selectedVariant ? String(selectedVariant._id) : ''}
              onChange={(event) => {
                const nextVariant = variants.find((variant) => String(variant._id) === event.target.value);
                setSelectedVariantId(event.target.value);
                setQuantity((current) => Math.min(current, Math.max(1, variantAvailable(nextVariant))));
              }}
            >
              {variants.map((variant) => (
                <option key={variant._id} value={String(variant._id)} disabled={variantAvailable(variant) === 0}>
                  {variant.label || [variant.brand, variant.model, variant.size, variant.color].filter(Boolean).join(' · ')}
                  {variantAvailable(variant) === 0 ? ' — Out of stock' : ''}
                </option>
              ))}
            </select>
          </label>}
          <strong className="customer-detail-price">₱{displayedPrice.toLocaleString('en-PH')}</strong>
          <p className={availableStock > 0 ? 'customer-stock' : 'customer-stock is-out'}>{availableStock > 0 ? `Available: ${availableStock}` : 'Currently unavailable'}</p>
          {availableStock > 0 && <>
            <div className="customer-quantity-control"><span>Quantity</span><div><button type="button" aria-label="Decrease quantity" disabled={quantity <= 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button><output>{quantity}</output><button type="button" aria-label="Increase quantity" disabled={quantity >= availableStock} onClick={() => setQuantity((value) => Math.min(availableStock, value + 1))}>+</button></div></div>
            <div className="customer-detail-actions"><button type="button" className="customer-primary-button" onClick={() => addProduct()}>Reserve</button><button type="button" className="customer-secondary-button" onClick={() => addProduct(true)}>Reserve now</button></div>
          </>}
          <button type="button" className={`customer-wishlist-action${wishlist.includes(product._id) ? ' is-saved' : ''}`} aria-pressed={wishlist.includes(product._id)} onClick={() => toggleWishlist(product._id)}>{wishlist.includes(product._id) ? '♥ Saved to wishlist' : '♡ Save to wishlist'}</button>
        </div>
      </section>
    </div>
    {actionNotice === 'Added to Reservation Cart' && <div className="shop-added-toast" role="status" aria-live="polite">
      <span>Added to Reservation Cart</span>
      <Link to="/customer/cart">View cart</Link>
      <button type="button" aria-label="Dismiss notification" onClick={() => setActionNotice('')}>×</button>
    </div>}
  </CustomerPage>;
}