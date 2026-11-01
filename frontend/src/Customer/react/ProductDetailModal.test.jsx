import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CustomerPrototypeProvider } from './CustomerPrototypeProvider';
import ProductDetail from './ProductDetail';
import ProductDetailModal from './ProductDetailModal';
import { readFileSync } from 'node:fs';

const modalStyles = readFileSync(new URL('../styles/customer-flow.css', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
const shopSource = readFileSync(new URL('./Shop.jsx', import.meta.url), 'utf8');
const modalSource = readFileSync(new URL('./ProductDetailModal.jsx', import.meta.url), 'utf8');
const modalEffectsSource = readFileSync(new URL('./useCustomerModalEffects.js', import.meta.url), 'utf8');
const modalHelpersSource = readFileSync(new URL('./productDetailModalHelpers.js', import.meta.url), 'utf8');
const contentSource = readFileSync(new URL('./ProductDetailContent.jsx', import.meta.url), 'utf8');
const responsiveStyles = readFileSync(new URL('../styles/customer-responsive.css', import.meta.url), 'utf8');

const renderModal = (productId) => renderToStaticMarkup(
  <MemoryRouter>
    <CustomerPrototypeProvider>
      <ProductDetailModal productId={productId} onClose={() => {}} openerRef={{ current: null }} />
    </CustomerPrototypeProvider>
  </MemoryRouter>
);

describe('product detail modal', () => {
  it('renders an accessible dialog when a product query is present', () => {
    const markup = renderModal('part-123');
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-labelledby="product-detail-title"');
    expect(markup).toContain('Close product details');
    expect(markup).toContain('Loading product details');
  });

  it('supports Escape, backdrop close, focus trapping and scroll restoration', () => {
    expect(modalHelpersSource).toContain("event.key === 'Escape'");
    expect(modalHelpersSource).toContain("event.key !== 'Tab'");
    expect(modalHelpersSource).toContain('event.target !== event.currentTarget');
    expect(modalSource).toContain("document.addEventListener('keydown', handleKeyDown)");
    expect(modalSource).toContain('useCustomerModalEffects(Boolean(visibleProductId)');
    expect(modalEffectsSource).toContain("documentRef.body.style.overflow = 'hidden'");
    expect(modalSource).toContain('window.scrollTo(0, scrollY)');
    expect(modalSource).toContain('openerElement?.focus()');
  });

  it('uses the product query for open state so browser Back removes the modal', () => {
    expect(appSource).toContain('<Route path="/customer/shop" element={<Shop />} />');
    expect(shopSource).toContain("productId={isShopViewRestored ? productModalId : ''}");
    expect(modalSource).toContain('setIsClosing(true)');
    expect(modalStyles).toContain('.customer-product-modal-overlay.is-closing');
  });

  it('keeps the existing direct product-detail route on the same shared content', () => {
    const originalLocalStorage = globalThis.localStorage;
    globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    let markup;
    try {
      markup = renderToStaticMarkup(
        <MemoryRouter initialEntries={['/customer/products/part-123']}>
          <CustomerPrototypeProvider>
            <Routes>
              <Route path="/customer/products/:productId" element={<ProductDetail />} />
            </Routes>
          </CustomerPrototypeProvider>
        </MemoryRouter>
      );
    } finally {
      if (originalLocalStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = originalLocalStorage;
    }
    expect(markup).toContain('Product details and availability.');
    expect(markup).toContain('Loading product details...');
    expect(contentSource).toContain('export default function ProductDetailContent');
    expect(appSource).toContain('<Route path="/customer/products/:productId" element={<ProductDetail />} />');
  });

  it('does not render a wishlist action or retain product-detail wishlist styles', () => {
    expect(contentSource).not.toContain('wishlist');
    expect(contentSource).not.toContain('toggleWishlist');
    expect(contentSource).not.toContain('Save to wishlist');
    expect(modalStyles).not.toContain('.customer-wishlist-action');
  });

  it('provides a responsive scrollable dialog and reduced-motion-safe animation', () => {
    expect(modalStyles).toContain('width: min(880px, 100%);');
    expect(modalStyles).toContain('max-height: 90vh;');
    expect(modalStyles).toContain('grid-template-columns: minmax(0, 45%) minmax(0, 1fr);');
    expect(modalStyles).toContain('@media (max-width: 767px)');
    expect(modalStyles).toContain('max-height: 92dvh;');
    expect(responsiveStyles).toContain('customer-product-modal-footer');
    expect(modalSource).toContain('modalFooter={isCompactLayout ? modalFooter : null}');
    expect(modalStyles).toContain('@media (prefers-reduced-motion: no-preference)');
    expect(modalStyles).toContain('180ms ease-out');
    expect(responsiveStyles).toContain('max-height: calc(100dvh - 24px);');
    expect(responsiveStyles).toContain('position: sticky;');
    expect(contentSource).toContain('onClick={() => addProduct()}')
    expect(contentSource).toContain('onClick={() => addProduct(true)}');
    expect(contentSource).toContain('>Add to cart</button>');
    expect(contentSource).toContain('>Reserve now</button>');
  });
});
