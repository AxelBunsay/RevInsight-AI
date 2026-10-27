import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import heroImage from '../../assets/hero.png';
import { CustomerPage } from './CustomerLayout';
import { useCustomerPrototype } from './useCustomerPrototype';
import { api } from '../../services/api';
import ProductImage from './ProductImage';
import { variantSelectorLabel } from './shopVariantLabel';
import { clearCustomerAuthAction, readCustomerAuthAction, saveCustomerAuthAction } from './customerAuthAction';
import '../styles/shop.css';

const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const MOTORCYCLE_FILTER_KEY = 'revinsightShopMotorcycle';
const variantAvailable = (variant) => Math.max(
  0,
  Number(variant.available ?? (Number(variant.stock || 0) - Number(variant.reservedQty || 0)))
);
const hasFitment = (variant) => Boolean(variant.brand || variant.model);
const matchesMotorcycle = (variant, brand, model) =>
  (!brand || variant.brand?.toLowerCase() === brand.toLowerCase())
  && (!model || variant.model?.toLowerCase() === model.toLowerCase());
const readMotorcycleFilter = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(MOTORCYCLE_FILTER_KEY) || '{}');
    return {
      brand: typeof saved.brand === 'string' ? saved.brand : '',
      model: typeof saved.model === 'string' ? saved.model : ''
    };
  } catch {
    return { brand: '', model: '' };
  }
};

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
  const [selectedVariants, setSelectedVariants] = useState({});
  const [motorcycle, setMotorcycle] = useState(readMotorcycleFilter);
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

  useEffect(() => {
    try {
      localStorage.setItem(MOTORCYCLE_FILTER_KEY, JSON.stringify(motorcycle));
    } catch {
      // Storage is optional; the in-memory filter remains usable.
    }
  }, [motorcycle]);

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
    const actionKey = `${action.createdAt}:${action.itemId}:${action.variantId || ''}`;
    if (resumedActionRef.current === actionKey) return undefined;
    resumedActionRef.current = actionKey;
    let active = true;
    api.getProduct(action.itemId).then((response) => {
      if (!active) return;
      const product = response.product;
      const variant = action.variantId
        ? (product.variants || []).find((item) => String(item._id) === String(action.variantId))
        : null;
      if (product.variants?.length && !variant) {
        setResumeError('The selected variant is no longer available. Please choose another option.');
        return;
      }
      const available = variant
        ? variantAvailable(variant)
        : Math.max(0, Number(product.quantity || 0) - Number(product.reservedQty || 0));
      if (available < action.quantity) {
        setResumeError('This item is no longer available in the requested quantity. Please choose another item or quantity.');
        return;
      }
      addCartItem({
        kind: 'product',
        id: product._id,
        ...(variant ? { variantId: variant._id, variantLabel: variant.label } : {}),
        name: variant?.label ? `${product.name} - ${variant.label}` : product.name,
        price: Number(variant?.price ?? product.price),
        stock: available,
        category: product.category,
        icon: categoryIcon(product.category),
        imageUrl: variant?.imageUrl || product.imageUrl || product.image || '',
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
  const motorcycleBrands = useMemo(() => [...new Set(products.flatMap((product) =>
    (product.variants || []).map((variant) => variant.brand?.trim()).filter(Boolean)
  ))].sort((left, right) => left.localeCompare(right)), [products]);
  const motorcycleModels = useMemo(() => [...new Set(products.flatMap((product) =>
    (product.variants || [])
      .filter((variant) => !motorcycle.brand || variant.brand?.toLowerCase() === motorcycle.brand.toLowerCase())
      .map((variant) => variant.model?.trim())
      .filter(Boolean)
  ))].sort((left, right) => left.localeCompare(right)), [motorcycle.brand, products]);
  const getMatchingFitmentVariants = (product) => (product.variants || []).filter((variant) =>
    hasFitment(variant) && matchesMotorcycle(variant, motorcycle.brand, motorcycle.model)
  );
  const motorcycleFilterKey = `${motorcycle.brand.toLowerCase()}|${motorcycle.model.toLowerCase()}`;
  const getSelectedVariant = (product) => {
    const variants = product.variants || [];
    if (!variants.length) return null;
    const savedSelection = selectedVariants[product._id];
    const selected = variants.find((variant) => String(variant._id) === savedSelection?.variantId);
    if (selected && savedSelection.filterKey === motorcycleFilterKey) return selected;
    const matching = motorcycle.brand || motorcycle.model
      ? getMatchingFitmentVariants(product)
      : [];
    if (matching.length) {
      return matching.find((variant) => variantAvailable(variant) > 0) || matching[0];
    }
    return variants.find((variant) => variantAvailable(variant) > 0) || variants[0];
  };
  const visibleProducts = useMemo(() => products.filter((product) => {
    const query = search.trim().toLowerCase();
    const variants = product.variants || [];
    const fitmentVariants = variants.filter(hasFitment);
    const matchesBike = !motorcycle.brand && !motorcycle.model
      || !fitmentVariants.length
      || fitmentVariants.some((variant) => matchesMotorcycle(variant, motorcycle.brand, motorcycle.model));
    return (category === 'All' || product.category === category)
      && matchesBike
      && (!query || `${product.name} ${product.description} ${product.category}`.toLowerCase().includes(query));
  }).sort((left, right) => sort === 'price-low'
    ? Math.min(...(left.variants || []).map((variant) => Number(variant.price)), Number(left.price))
      - Math.min(...(right.variants || []).map((variant) => Number(variant.price)), Number(right.price))
    : sort === 'price-high'
      ? Math.min(...(right.variants || []).map((variant) => Number(variant.price)), Number(right.price))
        - Math.min(...(left.variants || []).map((variant) => Number(variant.price)), Number(left.price))
      : left.name.localeCompare(right.name)), [category, motorcycle, products, search, sort]);

  const clearFilters = () => {
    setSearch('');
    setCategory('All');
    setSort('featured');
    setMotorcycle({ brand: '', model: '' });
  };

  const addToCart = (product, variant) => {
    const customerToken = localStorage.getItem('customerToken');
    if (!customerToken || customerToken === 'prototype-guest') {
      saveCustomerAuthAction({
        type: 'item',
        returnPath: location.pathname,
        itemId: product._id,
        ...(variant ? { variantId: variant._id } : {}),
        quantity: 1
      });
      navigate('/customer/login');
      return;
    }
    const stock = variant ? variantAvailable(variant) : product.quantity;
    if (stock < 1) return;
    addCartItem({
      kind: 'product',
      id: product._id,
      ...(variant ? { variantId: variant._id, variantLabel: variant.label } : {}),
      name: variant?.label ? `${product.name} - ${variant.label}` : product.name,
      price: Number(variant?.price ?? product.price),
      stock,
      category: product.category,
      icon: categoryIcon(product.category),
      imageUrl: variant?.imageUrl || product.imageUrl || product.image || ''
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

      <div className="shop-motorcycle-filter" aria-label="Filter by motorcycle">
        <strong>My motorcycle</strong>
        <select
          value={motorcycle.brand}
          aria-label="Motorcycle brand"
          onChange={(event) => setMotorcycle({ brand: event.target.value, model: '' })}
        >
          <option value="">All brands</option>
          {motorcycleBrands.map((brand) => <option value={brand} key={brand}>{brand}</option>)}
        </select>
        <select
          value={motorcycle.model}
          aria-label="Motorcycle model"
          disabled={!motorcycle.brand}
          onChange={(event) => setMotorcycle((current) => ({ ...current, model: event.target.value }))}
        >
          <option value="">All models</option>
          {motorcycleModels.map((model) => <option value={model} key={model}>{model}</option>)}
        </select>
        <button type="button" onClick={() => setMotorcycle({ brand: '', model: '' })}>Clear</button>
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
                const variants = product.variants || [];
                const selectedVariant = getSelectedVariant(product);
                const selectedStock = selectedVariant ? variantAvailable(selectedVariant) : product.quantity;
                const selectedPrice = Number(selectedVariant?.price ?? product.price);
                const selectedImageUrl = selectedVariant?.imageUrl || product.imageUrl || product.image;
                const hasExplicitSelection = selectedVariants[product._id]?.filterKey === motorcycleFilterKey
                  || Boolean((motorcycle.brand || motorcycle.model) && getMatchingFitmentVariants(product).length);
                const distinctPrices = new Set(variants.map((variant) => Number(variant.price))).size > 1;
                const lowestPrice = variants.length
                  ? Math.min(...variants.map((variant) => Number(variant.price)))
                  : Number(product.price);
                const downPayment = Number.isFinite(downPaymentPercent)
                  ? Math.round((selectedPrice * downPaymentPercent / 100 + Number.EPSILON) * 100) / 100
                  : null;
                const isOutOfStock = selectedStock === 0;
                return <article className={`product-card${isOutOfStock ? ' is-out-of-stock' : ''}`} key={product._id}>
                  <div className="product-image">
                    <ProductImage src={selectedImageUrl} alt={product.name} className="product-image-photo" fallback={<div className="product-image-placeholder" aria-label={`${product.category || 'Product'} image placeholder`}>
                      <span aria-hidden="true">{categoryIcon(product.category)}</span>
                    </div>} />
                    <span className="product-badge">{product.category}</span>
                  </div>
                  <div className="product-card-body">
                    <Link className="product-title-link" to={`/customer/products/${product._id}`}><h2>{product.name}</h2></Link>
                    <p className="product-description">{product.description || ''}</p>
                    {variants.length > 0 && (
                      <label className="product-variant-select">
                        <span>{variantSelectorLabel(variants)}</span>
                        <select
                          aria-label={`${variantSelectorLabel(variants).replace(':', '')} for ${product.name}`}
                          value={selectedVariant ? String(selectedVariant._id) : ''}
                          onChange={(event) => setSelectedVariants((current) => ({
                            ...current,
                            [product._id]: {
                              variantId: event.target.value,
                              filterKey: motorcycleFilterKey
                            }
                          }))}
                        >
                          {variants.map((variant) => (
                            <option
                              key={variant._id}
                              value={String(variant._id)}
                              disabled={variantAvailable(variant) === 0}
                            >
                              {variant.label || [variant.brand, variant.model, variant.size, variant.color].filter(Boolean).join(' · ')}
                              {variantAvailable(variant) === 0 ? ' — Out of stock' : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <p className="product-price">
                      {variants.length && distinctPrices && !hasExplicitSelection
                        ? `From ${money(lowestPrice)}`
                        : money(selectedPrice)}
                    </p>
                    <p className="product-down-payment">
                      {downPayment === null || isSettingsLoading
                        ? 'Reserve now: unavailable'
                        : `Reserve now: ${money(downPayment)} (${downPaymentPercent}%)`}
                    </p>
                    <div className="product-stock">
                      {isOutOfStock
                        ? <span className="product-stock-out">Out of stock</span>
                        : <>
                          <span>Available: {selectedStock}</span>
                          {selectedStock <= 5 && <span className="product-stock-low">Only {selectedStock} left</span>}
                        </>}
                    </div>
                    <button type="button" disabled={isOutOfStock} onClick={() => addToCart(product, selectedVariant)}>Reserve</button>
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
