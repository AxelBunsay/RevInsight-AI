import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import Landing from './Landing';
import { selectLandingProducts, selectLandingServices, shouldShowFeaturedProducts } from './landingData';

const appSource = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
const landingSource = readFileSync(new URL('./Landing.jsx', import.meta.url), 'utf8');

describe('customer landing page', () => {
  it('renders the root hero and hides featured products when the list is empty', () => {
    const markup = renderToStaticMarkup(<MemoryRouter><Landing /></MemoryRouter>);
    expect(appSource).toContain('<Route path="/" element={<CustomerLandingRoute />} />');
    expect(appSource).toContain('<Route path="/customer" element={<Navigate to="/" replace />} />');
    expect(appSource).toContain('<Route path="/customer/home" element={<Navigate to="/" replace />} />');
    expect(appSource).toContain('<Route path="/customer/shop" element={<Shop />} />');
    expect(appSource).not.toContain('<Route path="/" element={<Shop />} />');
    expect(markup).not.toContain('landing-hero');
    expect(markup).not.toContain('Shop parts');
    expect(markup).not.toContain('Book a service');
    expect(markup).not.toContain('Ready to ride?');
    expect(markup).not.toContain('Create an account to reserve parts and book services.');
    expect(selectLandingProducts()).toEqual([]);
    expect(shouldShowFeaturedProducts(false, selectLandingProducts([]))).toBe(false);
    expect(shouldShowFeaturedProducts(true, [])).toBe(true);
    expect(landingSource).toContain('shouldShowFeaturedProducts(productsLoading, featuredProducts)');
  });

  it('selects up to six available products and three active services for the home sections', () => {
    const products = Array.from({ length: 7 }, (_, index) => ({
      _id: `product-${index}`,
      name: `Product ${index}`,
      createdAt: new Date(2026, 0, index + 1),
      quantity: 1,
      price: 100,
      isActive: true
    }));
    const services = Array.from({ length: 4 }, (_, index) => ({
      _id: `service-${index}`,
      isActive: true
    }));

    expect(selectLandingProducts(products)).toHaveLength(6);
    expect(selectLandingServices(services)).toHaveLength(3);
    expect(landingSource).toContain('api.getProducts(1, 6)');
  });
});