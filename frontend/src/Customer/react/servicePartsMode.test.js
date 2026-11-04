import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getServicePartsSource, servicesForPartsSource, withServicePartsSource } from './servicePartsMode';

const servicesSource = readFileSync(new URL('./Services.jsx', import.meta.url), 'utf8');
const detailSource = readFileSync(new URL('./ServiceDetail.jsx', import.meta.url), 'utf8');
const purchaseCardsSource = readFileSync(new URL('./CustomerPurchaseCards.jsx', import.meta.url), 'utf8');

const services = [
  { _id: 'shop-only', price: 500, laborOnlyPrice: null },
  { _id: 'labor-option', price: 500, laborOnlyPrice: 200 },
  { _id: 'free-labor', price: 500, laborOnlyPrice: 0 }
];

describe('customer service parts mode', () => {
  it('defaults to shop parts and reads the labor-only URL mode', () => {
    expect(getServicePartsSource('')).toBe('shop');
    expect(getServicePartsSource('?parts=shop')).toBe('shop');
    expect(getServicePartsSource('?parts=own&page=2')).toBe('customer');
  });

  it('keeps every active service visible in both parts modes', () => {
    expect(servicesForPartsSource(services, 'shop')).toEqual(services);
    expect(servicesForPartsSource(services, 'customer')).toEqual(services);
  });

  it('sets the parts URL mode and resets pagination without dropping other filters', () => {
    const own = withServicePartsSource(new URLSearchParams('category=Brake&page=4'), 'customer');
    const shop = withServicePartsSource(own, 'shop');
    expect(own.toString()).toBe('category=Brake&page=1&parts=own');
    expect(shop.toString()).toBe('category=Brake&page=1');
  });

  it('renders the mode switch, carries the selected mode into details, and tags purchase bookings', () => {
    expect(servicesSource).toContain('role="tablist" aria-label="Service parts source"');
    expect(servicesSource).toContain('Labor only (I have my own parts)');
    expect(servicesSource).toContain('service.laborOnlyPrice');
    expect(servicesSource).toContain('?parts=own');
    expect(detailSource).toContain('customer-labor-only-note');
    expect(detailSource).toContain('partsSource,');
    expect(purchaseCardsSource).toContain('booking.partsSource === \'customer\'');
    expect(purchaseCardsSource).toContain('customer-parts-source-tag');
  });
});