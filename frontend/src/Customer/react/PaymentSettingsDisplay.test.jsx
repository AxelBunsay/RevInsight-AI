import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import PaymentSettingsDisplay from './PaymentSettingsDisplay';

const customerFlowCss = readFileSync(new URL('../styles/customer-flow.css', import.meta.url), 'utf8');

describe('GCash payment QR controls', () => {
  const renderBody = () => renderToStaticMarkup(
    <div className="gcash-payment-body">
      <PaymentSettingsDisplay
        settings={{
          qrImageUrl: 'https://images.example/gcash-qr.png',
          accountName: 'Shop',
          accountNumber: '09171234567'
        }}
        amount="₱100.00"
        isLoading={false}
        loadError=""
        onCopy={() => {}}
      />
      <label className="gcash-payment-reference">GCash reference number<input /></label>
      <input className="gcash-payment-file-input" type="file" />
      <button className="customer-secondary-button gcash-payment-attach">Attach receipt</button>
    </div>
  );

  it('renders the enlarged preview trigger, download link, and phone hint', () => {
    const markup = renderToStaticMarkup(
      <PaymentSettingsDisplay
        settings={{
          qrImageUrl: 'https://images.example/gcash-qr.png',
          accountName: 'Shop',
          accountNumber: '09171234567'
        }}
        isLoading={false}
        loadError=""
        onCopy={() => {}}
      />
    );

    expect(markup).toContain('Open GCash QR full-screen preview');
    expect(markup).toContain('href="https://images.example/gcash-qr.png" download="gcash-qr.png"');
    expect(markup).toContain('Save QR image');
    expect(markup).toContain('On a phone? Save the QR and upload it in GCash &gt; Pay QR.');
    expect(markup).toContain('class="gcash-payment-account-name">Shop</strong>');
    expect(markup).toContain('class="gcash-payment-account-number">09171234567</strong>');
    expect(markup).toMatch(
      /class="gcash-payment-qr-section"[\s\S]*?<div class="gcash-payment-qr-image-frame"><button[^>]*class="gcash-payment-qr-trigger[^"]*"[^>]*>[\s\S]*?<img class="gcash-payment-qr"[\s\S]*?<\/button><\/div><a class="customer-secondary-button gcash-payment-save-qr"[^>]*>Save QR image<\/a><small class="gcash-payment-qr-hint">/
    );
  });

  it('uses a responsive QR image without fixed-height clipping on its frame', () => {
    expect(markupForQr()).toContain('class="gcash-payment-qr-image-frame"');
    const qrRule = customerFlowCss.match(/\.gcash-payment-qr\s*\{([^}]+)\}/)?.[1] || '';
    const frameRule = customerFlowCss.match(/\.gcash-payment-qr-image-frame\s*\{([^}]+)\}/)?.[1] || '';

    expect(qrRule).toContain('width: auto');
    expect(qrRule).toContain('height: auto');
    expect(qrRule).toContain('max-width: min(100%, 300px)');
    expect(qrRule).toContain('max-width: min(100%, 300px)');
    expect(qrRule).toContain('max-height: min(48vh, 360px)');
    expect(qrRule).toContain('object-fit: contain');
    expect(frameRule).not.toMatch(/height\s*:/);
    expect(frameRule).not.toMatch(/overflow\s*:\s*hidden/);
    expect(customerFlowCss).toContain('max-height: calc(100vh - 32px)');
    expect(customerFlowCss).toContain('position: sticky');
    expect(customerFlowCss).toContain('max-height: calc(100dvh - 32px)');
  });

  it('places info, QR, reference and attachment actions in a column scrolling body', () => {
    const markup = renderBody();
    const infoIndex = markup.indexOf('class="gcash-payment-info-block"');
    const qrIndex = markup.indexOf('class="gcash-payment-qr-section"');
    const referenceIndex = markup.indexOf('class="gcash-payment-reference"');
    const attachIndex = markup.indexOf('class="customer-secondary-button gcash-payment-attach"');
    const bodyRule = customerFlowCss.match(/\.customer-confirmation-dialog\.gcash-payment-modal > \.gcash-payment-body\s*\{([^}]+)\}/)?.[1] || '';

    expect(markup).toContain('class="gcash-payment-body"');
    expect(markup).toMatch(
      /class="gcash-payment-body"><div class="gcash-payment-info-block">[\s\S]*?<\/div><div class="gcash-payment-qr-section">[\s\S]*?<\/div><label class="gcash-payment-reference">[\s\S]*?<\/label><input class="gcash-payment-file-input"[^>]*><button class="customer-secondary-button gcash-payment-attach">/
    );
    expect(infoIndex).toBeGreaterThan(0);
    expect(qrIndex).toBeGreaterThan(infoIndex);
    expect(referenceIndex).toBeGreaterThan(qrIndex);
    expect(attachIndex).toBeGreaterThan(referenceIndex);
    expect(bodyRule).toContain('flex-direction: column');
    expect(bodyRule).toContain('overflow-y: auto');
    expect(customerFlowCss).toContain('.customer-confirmation-dialog.gcash-payment-modal');
    expect(customerFlowCss).toContain('.customer-confirmation-dialog.gcash-payment-modal > .gcash-payment-body > .gcash-payment-info-block');
    expect(customerFlowCss).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(customerFlowCss).toMatch(/\.gcash-payment-amount\s*\{\s*grid-column:\s*1\s*\/\s*-1;/);
    expect(customerFlowCss).toContain('white-space: nowrap');
    expect(customerFlowCss).toContain('word-break: normal');
    expect(customerFlowCss).toMatch(/>\s*\.gcash-payment-qr-section\s*\{\s*order:\s*-1;/);
    expect(customerFlowCss).toMatch(/>\s*\.gcash-payment-info-block\s*\{\s*grid-template-columns:\s*1fr;\s*order:\s*1;/);
  });
});

function markupForQr() {
  return renderToStaticMarkup(
    <PaymentSettingsDisplay
      settings={{ qrImageUrl: 'https://images.example/gcash-qr.png', accountName: 'Shop', accountNumber: '09171234567' }}
      amount="₱100.00"
      isLoading={false}
      loadError=""
      onCopy={() => {}}
    />
  );
}
