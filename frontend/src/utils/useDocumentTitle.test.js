import { describe, expect, it } from 'vitest';
import { DEFAULT_DOCUMENT_TITLE, setDocumentTitle } from './useDocumentTitle';

describe('document title helper', () => {
  it('sets the requested title and restores the default when cleaned up', () => {
    const originalDocument = globalThis.document;
    globalThis.document = { title: '' };

    try {
      const restoreTitle = setDocumentTitle('Shop | Manoy\'s Motorcycle');
      expect(document.title).toBe('Shop | Manoy\'s Motorcycle');

      restoreTitle();
      expect(document.title).toBe(DEFAULT_DOCUMENT_TITLE);
    } finally {
      if (originalDocument === undefined) delete globalThis.document;
      else globalThis.document = originalDocument;
    }
  });
});
