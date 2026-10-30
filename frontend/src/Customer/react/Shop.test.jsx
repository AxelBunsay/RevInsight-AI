import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Link, MemoryRouter } from 'react-router-dom';
import ShopProductCard from './ShopProductCard';
import { readFileSync } from 'node:fs';

const shopStyles = readFileSync(new URL('../styles/shop.css', import.meta.url), 'utf8');
const shopSource = readFileSync(new URL('./Shop.jsx', import.meta.url), 'utf8');
const customerLayoutSource = readFileSync(new URL('./CustomerLayout.jsx', import.meta.url), 'utf8');

const defaultProps = {
  product: { _id: 'part-123', name: 'Brake Cable', category: 'Cables' },
  variants: [],
  selectedStock: 10,
  price: 100,
  downPayment: 30,
  downPaymentPercent: 30,
  isOutOfStock: false,
  categoryIcon: () => '⚙'
};

const renderCard = (props) => renderToStaticMarkup(
  <MemoryRouter>
    <ShopProductCard
      {...defaultProps}
      {...props}
    />
  </MemoryRouter>
);

describe('shop product card', () => {
  it('navigates to product details and saves the shop view when the card link is activated', () => {
    const onOpen = vi.fn();
    const card = ShopProductCard({ ...defaultProps, onOpen });
    expect(card.type).toBe(Link);
    expect(card.props.to).toBe('/customer/products/part-123');
    card.props.onClick();
    expect(onOpen).toHaveBeenCalledOnce();

    const markup = renderCard({});
    expect(markup).toContain('<a class="product-card" aria-label="Brake Cable, ₱100" href="/customer/products/part-123"');
    expect(markup).toContain('aria-label="Brake Cable, ₱100"');
    expect(markup).toContain('Brake Cable</h2>');
    expect(markup).not.toContain('<button');
    expect(markup).not.toContain('<select');
    expect(markup).not.toContain('<a class="product-title-link"');
  });

  it('shows compact variant pricing and option count without an in-card selector', () => {
    const markup = renderCard({
      variants: [{ _id: 'v1', price: 100 }, { _id: 'v2', price: 120 }],
      price: 100
    });
    expect(markup).toContain('From ₱100');
    expect(markup).toContain('2 options');
    expect(markup).not.toContain('<select');
  });

  it('keeps out-of-stock products linked with a clear status', () => {
    const markup = renderCard({
      isOutOfStock: true,
      selectedStock: 0
    });
    expect(markup).toContain('href="/customer/products/part-123"');
    expect(markup).toContain('Out of stock');
    expect(markup).toContain('is-out-of-stock');
  });

  it('uses a compact left-aligned responsive grid with keyboard focus styling', () => {
    expect(shopStyles).toContain('grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));');
    expect(shopStyles).toContain('grid-template-columns: repeat(auto-fill, minmax(166px, 1fr));');
    expect(shopStyles).toContain('grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));');
    expect(shopStyles).toContain('aspect-ratio: 1 / 1;');
    expect(shopStyles).toContain('padding: 8px 10px 10px;');
    expect(shopStyles).toContain('.shop-page .product-card:focus-visible');
    expect(shopStyles).toContain('align-items: start;');
    expect(shopSource).toContain('scrollY: window.scrollY');
    expect(shopSource).toContain('preserveScrollOnMount={Boolean(restoredShopView)}');
    expect(customerLayoutSource).toContain('if (!preserveScrollOnMount) window.scrollTo(0, 0);');
  });
});
