import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CustomerPage } from './CustomerLayout';
import { useCustomerPrototype } from './useCustomerPrototype';
import { api } from '../../services/api';
import ShopProductCard from './ShopProductCard';
import ProductDetailModal from './ProductDetailModal';
import { getProductModalId, getProductModalSearch, removeProductModalSearch } from './productDetailHelpers';
import { clearCustomerAuthAction, readCustomerAuthAction } from './customerAuthAction';
import CustomerPagination from './CustomerPagination.jsx';
import { CUSTOMER_PAGE_SIZES, getCustomerPageItems } from './customerPagination';
import { useCustomerPagination } from './useCustomerPagination';
import '../styles/shop.css';

const SHOP_VIEW_STATE_KEY = 'revinsightShopViewState';
const readShopViewState = () => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SHOP_VIEW_STATE_KEY) || 'null');
    return saved && typeof saved === 'object' ? saved : null;
  } catch {
    return null;
  }
};
const variantAvailable = (variant) => Math.max(
  0,
  Number(variant.available ?? (Number(variant.stock || 0) - Number(variant.reservedQty || 0)))
);

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
  const [restoredShopView] = useState(readShopViewState);
  const [isShopViewRestored, setIsShopViewRestored] = useState(!restoredShopView);
  const [search, setSearch] = useState(() => restoredShopView?.search || '');
  const [category, setCategory] = useState(() => restoredShopView?.category || 'All');
  const [sort, setSort] = useState(() => restoredShopView?.sort || 'featured');
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
  const productCardOpenerRef = useRef(null);
  const productsListRef = useRef(null);
  const locationReturnPath = `${location.pathname}${location.search}`;
  const productModalId = getProductModalId(location.search);

  const saveShopView = (event) => {
    if (event?.currentTarget) productCardOpenerRef.current = event.currentTarget;
    try {
      sessionStorage.setItem(SHOP_VIEW_STATE_KEY, JSON.stringify({
        search,
        category,
        sort,
        scrollY: window.scrollY
      }));
    } catch {
      // The shop remains usable if session storage is unavailable.
    }
  };

  useEffect(() => {
    if (!restoredShopView || isLoading) return undefined;
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo(0, Number(restoredShopView.scrollY) || 0);
      try {
        sessionStorage.removeItem(SHOP_VIEW_STATE_KEY);
      } catch {
        // The restored view is usable even if the snapshot cannot be cleared.
      }
      setIsShopViewRestored(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isLoading, restoredShopView]);

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
    if (!action || action.type !== 'item' || action.returnPath !== locationReturnPath) {
      clearCustomerAuthAction();
      navigate(locationReturnPath, { replace: true, state: null });
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
        navigate(locationReturnPath, { replace: true, state: null });
      }
    });
    return () => { active = false; };
  }, [addCartItem, locationReturnPath, location.state, navigate]);

  const closeProductModal = useCallback(() => {
    navigate({
      pathname: location.pathname,
      search: removeProductModalSearch(location.search),
      hash: location.hash
    }, { replace: true, state: location.state });
  }, [location.hash, location.pathname, location.search, location.state, navigate]);

  const productCategories = useMemo(
    () => ['All', ...new Set(products.map((product) => product.category).filter(Boolean))],
    [products]
  );
  const visibleProducts = useMemo(() => products.filter((product) => {
    const query = search.trim().toLowerCase();
    return (category === 'All' || product.category === category)
      && (!query || `${product.name} ${product.description} ${product.category}`.toLowerCase().includes(query));
  }).sort((left, right) => sort === 'price-low'
    ? Math.min(...(left.variants || []).map((variant) => Number(variant.price)), Number(left.price))
      - Math.min(...(right.variants || []).map((variant) => Number(variant.price)), Number(right.price))
    : sort === 'price-high'
      ? Math.min(...(right.variants || []).map((variant) => Number(variant.price)), Number(right.price))
        - Math.min(...(left.variants || []).map((variant) => Number(variant.price)), Number(left.price))
      : left.name.localeCompare(right.name)), [category, products, search, sort]);

  const shopPageSize = CUSTOMER_PAGE_SIZES.shop;
  const { page, pageCount, setPage, resetPage } = useCustomerPagination({
    itemCount: visibleProducts.length,
    pageSize: shopPageSize,
    isReady: !isLoading,
    listRef: productsListRef
  });
  const pageProducts = getCustomerPageItems(visibleProducts, page, shopPageSize);

  const clearFilters = () => {
    setSearch('');
    setCategory('All');
    setSort('featured');
    resetPage();
  };

  const downPaymentPercent = Number(settings?.downPaymentPercent);

  return <CustomerPage
    title="Motorcycle Shop"
    description="Browse available parts and accessories."
    preserveScrollOnMount={Boolean(restoredShopView)}
  >
    <div className="shop-content">
      {location.state?.message && <p className="customer-success" role="status">{location.state.message}</p>}
      {resumeError && <p className="customer-error" role="alert">{resumeError}</p>}
      <section className="customer-compact-banner shop-compact-banner" aria-label="Shop introduction">
        <div>
          <h2>Everything your ride needs.</h2>
          <p>Quality parts, trusted accessories, and expert service in one place.</p>
        </div>
        <Link to="/customer/services">Explore services</Link>
      </section>
      <div className="shop-toolbar">
        <input value={search} onChange={(event) => { setSearch(event.target.value); resetPage(); }} placeholder="Search parts, accessories..." aria-label="Search products" />
        <select value={sort} onChange={(event) => { setSort(event.target.value); resetPage(); }} aria-label="Sort products">
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
        {productCategories.map((item) => <button type="button" className={category === item ? 'active' : ''} key={item} onClick={() => { setCategory(item); resetPage(); }}>
          {item}<small>{item === 'All' ? products.length : products.filter((product) => product.category === item).length}</small>
        </button>)}
      </div>

      <section className="shop-how-it-works" aria-label="How item reservations work">
        <div><strong>1. Reserve your item</strong></div>
        <div><strong>2. Pay the down payment</strong></div>
        <div><strong>3. Pick up at the shop and pay the balance</strong></div>
        <div className="shop-pickup-only">Pickup only. No delivery.</div>
      </section>

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
            ? <div className="product-grid" ref={productsListRef}>
              {pageProducts.map((product) => {
                const variants = product.variants || [];
                const availableStock = Math.max(0, Number(product.quantity || 0));
                const availableVariants = variants.filter((variant) => variantAvailable(variant) > 0);
                const lowestPrice = variants.length
                  ? Math.min(...(availableVariants.length ? availableVariants : variants).map((variant) => Number(variant.price)))
                  : Number(product.price);
                const displayedPrice = variants.length ? lowestPrice : Number(product.price);
                const downPayment = Number.isFinite(downPaymentPercent)
                  ? Math.round((displayedPrice * downPaymentPercent / 100 + Number.EPSILON) * 100) / 100
                  : null;
                const isOutOfStock = variants.length
                  ? availableVariants.length === 0
                  : availableStock === 0;
                return <ShopProductCard
                  key={product._id}
                  to={{
                    pathname: location.pathname,
                    search: getProductModalSearch(location.search, product._id),
                    hash: location.hash
                  }}
                  product={product}
                  variants={variants}
                  selectedStock={availableStock}
                  price={displayedPrice}
                  downPayment={downPayment === null || isSettingsLoading ? null : downPayment}
                  downPaymentPercent={downPaymentPercent}
                  isOutOfStock={isOutOfStock}
                  categoryIcon={categoryIcon}
                  onOpen={saveShopView}
                />;
              })}
            </div>
            : <div className="shop-no-results">
              <p>No products found</p>
              <button type="button" onClick={clearFilters}>Clear filters</button>
            </div>}
      {!isLoading && !error && <CustomerPagination
        page={page}
        pageCount={pageCount}
        totalItems={visibleProducts.length}
        pageSize={shopPageSize}
        onPageChange={setPage}
        label="Products"
      />}
    </div>
    {showAddedToast && <div className="shop-added-toast" role="status" aria-live="polite">
      <span>Added to Reservation Cart</span>
      <Link to="/customer/cart">View cart</Link>
      <button type="button" aria-label="Dismiss notification" onClick={() => setShowAddedToast(false)}>×</button>
    </div>}
    <ProductDetailModal
      productId={isShopViewRestored ? productModalId : ''}
      onClose={closeProductModal}
      openerRef={productCardOpenerRef}
    />
  </CustomerPage>;
}
