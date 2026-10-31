import { describe, expect, it } from 'vitest';
import { getPortalFavicon, syncPortalFavicon } from './portalFavicon';

describe('portal favicon helper', () => {
  it('uses the Admin, Mechanic, and customer icon files for their routes', () => {
    expect(getPortalFavicon('/admin/login')).toEqual({
      href: '/favicon-admin.png?v=2',
      type: 'image/png'
    });
    expect(getPortalFavicon('/mechanic/login')).toEqual({
      href: '/favicon-mechanic.png?v=2',
      type: 'image/png'
    });
    expect(getPortalFavicon('/customer/shop')).toEqual({
      href: '/logo.svg',
      type: 'image/svg+xml'
    });
  });

  it('updates the existing icon link for client-side route changes', () => {
    const icon = { rel: 'icon' };
    const targetDocument = {
      querySelector: () => icon,
      createElement: () => {
        throw new Error('An existing icon link should be reused.');
      },
      head: { appendChild: () => {} }
    };

    syncPortalFavicon('/admin/login', targetDocument);

    expect(icon).toMatchObject({
      rel: 'icon',
      type: 'image/png',
      href: '/favicon-admin.png?v=2'
    });
  });
});
