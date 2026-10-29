import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import TransactionsPageActions from './TransactionsPageActions';

describe('transactions page actions', () => {
  it.each(['all', 'items', 'services'])('shows payment settings and export actions on the %s tab', (activeTab) => {
    const markup = renderToStaticMarkup(
      <TransactionsPageActions
        activeTab={activeTab}
        onOpenSettings={() => {}}
        onExport={() => {}}
        isExporting={false}
      />
    );

    expect(markup).toContain('Payment &amp; reservation settings');
    expect(markup).toContain('>Export</button>');
    expect(markup).toContain(`data-active-tab="${activeTab}"`);
  });
});
