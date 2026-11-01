import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import RouteContentTransition from './RouteContentTransition';
import { getRouteContentKey } from './routeContentTransitionKey';

const transitionStyles = readFileSync(
  new URL('./route-content-transition.css', import.meta.url),
  'utf8'
).replaceAll('\r\n', '\n');

describe('route content transition', () => {
  it('keys the content wrapper by pathname', () => {
    expect(getRouteContentKey('/admin/inventory')).toBe('/admin/inventory');
    expect(getRouteContentKey('/customer/shop', '?page=2'))
      .toBe(getRouteContentKey('/customer/shop', '?sort=name'));
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ['/admin/inventory'] },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/admin/*',
            element: createElement(
              RouteContentTransition,
              null,
              createElement('p', null, 'Inventory')
            )
          })
        )
      )
    );

    expect(markup).toContain('data-route-path="/admin/inventory"');
    expect(markup).toContain('class="route-content-transition"');
  });

  it('uses the requested motion and disables it for reduced-motion preferences', () => {
    expect(transitionStyles).toContain('opacity: 0;');
    expect(transitionStyles).toContain('transform: translateY(8px);');
    expect(transitionStyles).toContain('animation: route-content-fade-in 220ms ease-out both;');
    expect(transitionStyles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.route-content-transition \{[\s\S]*?animation: none;/);
    expect(transitionStyles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition: none;/);
  });
});
