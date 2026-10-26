import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import heroImage from '../../assets/hero.png';
import { CustomerPage } from './CustomerLayout';
import { useCustomerPrototype } from './useCustomerPrototype';
import { api } from '../../services/api';
import ProductImage from './ProductImage';
import { clearCustomerAuthAction, readCustomerAuthAction, saveCustomerAuthAction } from './customerAuthAction';
import '../styles/shop.css';

const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

const categoryIcon = (category = '') => {
  const normalized = category.toLowerCase();
  if (normalized.includes('brake')) return '⬡';
  if (normalized.includes('engine')) return '⚙';
  if (normalized.includes('wheel') || normalized.includes('tire')) return '◉';
  if (normalized.includes('light') || normalized.includes('electrical')) return '✦';
  if (normalized.includes('accessor')) return '▣';
  return '⚙';
};

function ProductSkeleton() {
  return <article className="product-card product-skeleton" aria-hidden="true">
    <div className="product-skeleton-image" />
    <div className="product-card-body">
      <span className="product-skeleton-line is-title" />
      <span className="product-skeleton-line" />
      <span className="product-skeleton-line is-price" />
      <span className="product-skeleton-button" />
    </div>
  </article>;
}

export default function Shop() {
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [sort, setSort] = useState('featured');
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);
  const [error, setError] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [showAddedToast, setShowAddedToast] = useState(false);
  const [resumeError, setResumeError] = useState('');
  const { addCartItem } = useCustomerPrototype();
  const resumedActionRef = useRef('');

  const loadShopData = useCallback(async () => {
    const loadAllProducts = async () => {
      const firstPage = await api.getProducts(1, 50);
      const pages = Number(firstPage.pagination?.pages || 1);
      if (pages <= 1) return firstPage.products || [];
      const remainingPages = await Promise.all(
        Array.from({ length: pages - 1 }, (_, index) => api.getProducts(index + 2, 50))
      );
      return [...(firstPage.products || []), ...remainingPages.flatMap((response) => response.products || [])];
    };
    const [productsResult, settingsResult] = await Promise.allSettled([
      loadAllProducts(),
      api.getShopSettings()
    ]);

    if (productsResult.status === 'fulfilled') {
      setProducts(productsResult.value.map((product) => ({
        ...product,
        quantity: Math.max(0, Number(product.quantity || 0) - Number(product.reservedQty || 0))
      })));
    } else {
      setError(productsResult.reason.message || 'We could not load products right now.');
    }

    if (settingsResult.status === 'fulfilled') {
      setSettings(settingsResult.value.settings || {});
    } else {
      setSettingsError(settingsResult.reason.message || 'Reservation details could not be loaded.');
    }

    setIsLoading(false);
    setIsSettingsLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadShopData);
  }, [loadShopData]);

  const retryShopData = () => {
    setIsLoading(true);
    setIsSettingsLoading(true);
    setError('');
    setSettingsError('');
    loadShopData();
  };

  useEffect(() => {
    if (!showAddedToast) return undefined;
    const timeout = window.setTimeout(() => setShowAddedToast(false), 5000);
    return () => window.clearTimeout(timeout);
  }, [showAddedToast]);

  useEffect(() => {
    if (!location.state?.resumeAction) return undefined;
    const action = readCustomerAuthAction();
    if (!action || action.type !== 'item' || action.returnPath !== location.pathname) {
      clearCustomerAuthAction();
      navigate(location.pathname, { replace: true, state: null });
      return undefined;
    }
    const actionKey = `${action.createdAt}:${action.itemId}`;
    if (resumedActionRef.current === actionKey) return undefined;
    resumedActionRef.current = actionKey;
    let active = true;
    api.getProduct(action.itemId).then((response) => {
      if (!active) return;
      const product = response.product;
      const available = Math.max(0, Number(product.quantity || 0) - Number(product.reservedQty || 0));
      if (available < action.quantity) {
        setResumeError('This item is no longer available in the requested quantity. Please choose another item or quantity.');
        return;
      }
      addCartItem({
        kind: 'product',
        id: product._id,
        name: product.name,
        price: product.price,
        stock: available,
        category: product.category,
        icon: categoryIcon(product.category),
        imageUrl: product.imageUrl || product.image || '',
        quantity: action.quantity
      });
      setShowAddedToast(true);
    }).catch((error) => {
      if (active) setResumeError(error.message || 'This item is no longer available. Please choose another item.');
    }).finally(() => {
      if (active) {
        clearCustomerAuthAction();
        navigate(location.pathname, { replace: true, state: null });
      }
    });
    return () => { active = false; };
  }, [addCartItem, location.pathname, location.state, navigate]);

  const productCategories = useMemo(
    () => ['All', ...new Set(products.map((product) => product.category).filter(Boolean))],
    [products]
  );
  const visibleProducts = useMemo(() => products.filter((product) => {
    const query = search.trim().toLowerCase();
    return (category === 'All' || product.category === category)
      && (!query || `${product.name} ${product.description} ${product.category}`.toLowerCase().includes(query));
  }).sort((left, right) => sort === 'price-low'
    ? left.price - right.price
    : sort === 'price-high'
      ? right.price - left.price
      : left.name.localeCompare(right.name)), [category, products, search, sort]);

  const clearFilters = () => {
    setSearch('');
    setCategory('All');
    setSort('featured');
  };

  const addToCart = (product) => {
    const customerToken = localStorage.getItem('customerToken');
    if (!customerToken || customerToken === 'prototype-guest') {
      saveCustomerAuthAction({
        type: 'item',
        returnPath: location.pathname,
        itemId: product._id,
        quantity: 1
      });
      navigate('/customer/login');
      return;
    }
    addCartItem({
      kind: 'product',
      id: product._id,
      name: product.name,
      price: product.price,
      stock: product.quantity,
      category: product.category,
      icon: categoryIcon(product.category),
      imageUrl: product.imageUrl || product.image || ''
    });
    setShowAddedToast(true);
  };

  const downPaymentPercent = Number(settings?.downPaymentPercent);

  return <CustomerPage title="Motorcycle Shop" description="Browse available parts and accessories.">
    <div className="shop-content">
      {location.state?.message && <p className="customer-success" role="status">{location.state.message}</p>}
      {resumeError && <p className="customer-error" role="alert">{resumeError}</p>}
      <section className="shop-market-hero" style={{ '--shop-hero-image': `url(${heroImage})` }} aria-label="Shop introduction">
        <div className="shop-promo-primary">
          <p>MANOY&apos;S MOTORCYCLE PARTS, ACCESSORIES &amp; SERVICES</p>
          <h2>Everything your ride needs.</h2>
          <span>Quality parts, trusted accessories, and expert service in one place.</span>
          <Link to="/customer/services">Explore services</Link>
        </div>
        <div className="shop-promo-stack">
          <div><strong>Ride-ready essentials</strong><span>Parts selected for everyday maintenance.</span></div>
          <div><strong>Expert service support</strong><span>Book a mechanic when you need one.</span></div>
        </div>
      </section>

      <section className="shop-how-it-works" aria-label="How item reservations work">
        <div><strong>1. Reserve your item</strong></div>
        <div><strong>2. Pay the down payment</strong></div>
        <div><strong>3. Pick up at the shop and pay the balance</strong></div>
        <div className="shop-pickup-only">Pickup only. No delivery.</div>
      </section>

      <div className="shop-toolbar">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search parts, accessories..." aria-label="Search products" />
        <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort products">
          <option value="featured">Sort: Featured</option>
          <option value="price-low">Price: Low to high</option>
          <option value="price-high">Price: High to low</option>
          <option value="name">Name</option>
        </select>
      </div>

      {settingsError && <div className="shop-settings-error" role="status">
        <span>Reservation details are unavailable. Down payment amounts may not be shown yet.</span>
        <button type="button" onClick={retryShopData}>Try again</button>
      </div>}

      <div className="customer-product-categories" role="group" aria-label="Product categories">
        {productCategories.map((item) => <button type="button" className={category === item ? 'active' : ''} key={item} onClick={() => setCategory(item)}>
          {item}<small>{item === 'All' ? products.length : products.filter((product) => product.category === item).length}</small>
        </button>)}
      </div>

      <div className="customer-product-results">
        <h2>{category === 'All' ? 'All products' : category}</h2>
        <span>{isLoading ? 'Loading products' : `${visibleProducts.length} items`}</span>
      </div>

      {isLoading
        ? <div className="product-grid" aria-label="Loading products">{Array.from({ length: 8 }, (_, index) => <ProductSkeleton key={index} />)}</div>
        : error
          ? <div className="shop-load-error" role="alert">
            <p>We couldn&apos;t load the products. Please try again.</p>
            <button type="button" onClick={retryShopData}>Try again</button>
          </div>
          : visibleProducts.length
            ? <div className="product-grid">
              {visibleProducts.map((product) => {
                const imageUrl = product.imageUrl || product.image;
                const downPayment = Number.isFinite(downPaymentPercent)
                  ? Math.round((Number(product.price) * downPaymentPercent / 100 + Number.EPSILON) * 100) / 100
                  : null;
                const isOutOfStock = product.quantity === 0;
                return <article className={`product-card${isOutOfStock ? ' is-out-of-stock' : ''}`} key={product._id}>
                  <div className="product-image">
                    <ProductImage src={imageUrl} alt={product.name} className="product-image-photo" fallback={<div className="product-image-placeholder" aria-label={`${product.category || 'Product'} image placeholder`}>
                      <span aria-hidden="true">{categoryIcon(product.category)}</span>
                    </div>} />
                    <span className="product-badge">{product.category}</span>
                  </div>
                  <div className="product-card-body">
                    <Link className="product-title-link" to={`/customer/products/${product._id}`}><h2>{product.name}</h2></Link>
                    <p className="product-description">{product.description || ''}</p>
                    <p className="product-price">{money(product.price)}</p>
                    <p className="product-down-payment">
                      {downPayment === null || isSettingsLoading
                        ? 'Reserve now: unavailable'
                        : `Reserve now: ${money(downPayment)} (${downPaymentPercent}%)`}
                    </p>
                    <div className="product-stock">
                      {isOutOfStock
                        ? <span className="product-stock-out">Out of stock</span>
                        : <>
                          <span>Available: {product.quantity}</span>
                          {product.quantity <= 5 && <span className="product-stock-low">Only {product.quantity} left</span>}
                        </>}
                    </div>
                    <button type="button" disabled={isOutOfStock} onClick={() => addToCart(product)}>Reserve</button>
                  </div>
                </article>;
              })}
            </div>
            : <div className="shop-no-results">
              <p>No products found</p>
              <button type="button" onClick={clearFilters}>Clear filters</button>
            </div>}
    </div>
    {showAddedToast && <div className="shop-added-toast" role="status" aria-live="polite">
      <span>Added to Reservation Cart</span>
      <Link to="/customer/cart">View cart</Link>
      <button type="button" aria-label="Dismiss notification" onClick={() => setShowAddedToast(false)}>×</button>
    </div>}
  </CustomerPage>;
}
