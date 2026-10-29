import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MarkdownAnswer from './MarkdownAnswer';

describe('MarkdownAnswer', () => {
  it('renders headings, bold, italic, lists, and horizontal rules as elements', () => {
    const html = renderToStaticMarkup(<MarkdownAnswer markdown={'## Summary\nA **strong** and *clear* answer.\n\n- First point\n- Second point\n\n1. Next step\n\n---'} />);

    expect(html).toContain('<h2');
    expect(html).toContain('<strong>strong</strong>');
    expect(html).toContain('<em>clear</em>');
    expect(html).toContain('<ul');
    expect(html).toContain('<ol');
    expect(html).toContain('<hr');
  });

  it('removes raw HTML and never renders executable or image markup', () => {
    const html = renderToStaticMarkup(<MarkdownAnswer markdown={'Safe text <script>alert(1)</script> <img src=x onerror=alert(1)> after.'} />);

    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('alert(1)');
    expect(html).toContain('Safe text');
    expect(html).toContain('after.');
  });
});
