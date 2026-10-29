import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import NotificationContent from './NotificationContent';

describe('NotificationContent', () => {
  it('renders a wrapping message and its timestamp as separate elements', () => {
    const markup = renderToStaticMarkup(
      <NotificationContent
        message="Your payment for RSV-0001 was confirmed. A long notification message wraps without clipping."
        timestamp="2026-10-28T12:44:44.000Z"
      />
    );

    expect(markup).toContain('<p class="notification-message">Your payment for RSV-0001 was confirmed.');
    expect(markup).toContain('<time class="notification-timestamp"');
    expect(markup).toContain('Oct 28, 2026');
    expect(markup).not.toContain('nowrap');
    expect(markup.indexOf('notification-message')).toBeLessThan(markup.indexOf('notification-timestamp'));
  });
});
