import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PaymentSettingsDisplay from './PaymentSettingsDisplay';
import { getPaymentDisplaySettings } from './paymentDisplaySettings';

const legacySettings = {
  paymentInstructions: {
    methodName: 'GCash',
    accountName: 'Legacy Shop',
    accountNumber: '09170000000',
    qrImageUrl: 'https://images.example/legacy-qr.png'
  }
};

function renderSettings(settings, isLoading = false, loadError = '') {
  return renderToStaticMarkup(
    <PaymentSettingsDisplay
      settings={settings}
      isLoading={isLoading}
      loadError={loadError}
      onCopy={() => {}}
    />
  );
}

describe('GCash modal payment settings display', () => {
  it('shows a loading skeleton while payment settings are being fetched', () => {
    const markup = renderSettings(getPaymentDisplaySettings(legacySettings, null), true);

    expect(markup).toContain('Loading GCash payment settings');
    expect(markup).toContain('gcash-payment-skeleton-qr');
  });

  it('shows the fetched QR, account details and instructions', () => {
    const settings = getPaymentDisplaySettings(legacySettings, {
      gcashQrUrl: 'https://images.example/current-qr.png',
      gcashAccountName: 'Current Shop',
      gcashAccountNumber: '639171234567',
      paymentInstructions: 'Use your reservation code as the payment note.'
    });
    const markup = renderSettings(settings);

    expect(markup).toContain('https://images.example/current-qr.png');
    expect(markup).toContain('Current Shop');
    expect(markup).toContain('639171234567');
    expect(markup).toContain('Use your reservation code as the payment note.');
  });

  it('falls back to the existing reservation payment values when loading fails', () => {
    const settings = getPaymentDisplaySettings(legacySettings, null);
    const markup = renderSettings(
      settings,
      false,
      'Could not load the latest payment details. Showing the saved reservation payment details instead.'
    );

    expect(markup).toContain('https://images.example/legacy-qr.png');
    expect(markup).toContain('Legacy Shop');
    expect(markup).toContain('09170000000');
    expect(markup).toContain('saved reservation payment details');
  });
});
