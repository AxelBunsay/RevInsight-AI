import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import Landing from './Landing';
import { selectLandingProducts, shouldShowFeaturedProducts } from './landingData';

const appSource = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
const landingSource = readFileSync(new URL('./Landing.jsx', import.meta.url), 'utf8');

describe('customer landing page', () => {
  it('renders the root hero and hides featured products when the list is empty', () => {
    const markup = renderToStaticMarkup(<MemoryRouter><Landing /></MemoryRouter>);
    expect(appSource).toContain('<Route path="/" element={<Landing />} />');
    expect(appSource).toContain('<Route path="/customer" element={<Navigate to="/" replace />} />');
    expect(appSource).toContain('<Route path="/customer/home" element={<Navigate to="/" replace />} />');
    expect(appSource).toContain('<Route path="/customer/shop" element={<Shop />} />');
    expect(appSource).not.toContain('<Route path="/" element={<Shop />} />');
    expect(markup).toContain('landing-hero');
    expect(markup).toContain('Everything your ride needs.');
    expect(selectLandingProducts()).toEqual([]);
    expect(shouldShowFeaturedProducts(false, selectLandingProducts([]))).toBe(false);
    expect(shouldShowFeaturedProducts(true, [])).toBe(true);
    expect(landingSource).toContain('shouldShowFeaturedProducts(productsLoading, featuredProducts)');
  });
});