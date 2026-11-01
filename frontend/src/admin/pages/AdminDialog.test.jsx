import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdminDialog } from './ManagementPageComponents';
import { createAdminModalLifecycle, lockAdminModalScroll } from '../components/useAdminModalEffects';

function makeDocument() {
  return {
    body: { style: { overflow: 'auto' } },
    documentElement: { style: { overflow: 'scroll' } },
    addEventListener(type, handler) { this.handlers ||= {}; this.handlers[type] = handler; },
    removeEventListener(type) { delete this.handlers?.[type]; }
  };
}

describe('admin modal behavior', () => {
  it.each(['close button', 'Cancel', 'Save success', 'Escape', 'overlay click', 'route change', 'unmount'])(
    'restores page scrolling after %s closes the modal',
    (closePath) => {
      const documentRef = makeDocument();
      let cleanup;
      const onClose = () => cleanup();
      cleanup = createAdminModalLifecycle(documentRef, onClose);

      expect(documentRef.body.style.overflow).toBe('hidden');
      expect(documentRef.documentElement.style.overflow).toBe('hidden');
      if (closePath === 'Escape') {
        documentRef.handlers.keydown({
          key: 'Escape',
          defaultPrevented: false,
          preventDefault() {},
          stopImmediatePropagation() {}
        });
      } else if (closePath === 'route change' || closePath === 'unmount') {
        cleanup();
      } else {
        onClose();
      }
      expect(documentRef.body.style.overflow).toBe('auto');
      expect(documentRef.documentElement.style.overflow).toBe('scroll');
      expect(documentRef.handlers.keydown).toBeUndefined();
    }
  );

  it('keeps scrolling locked until the last nested modal closes', () => {
    const documentRef = makeDocument();
    const releaseFirst = lockAdminModalScroll(documentRef);
    const releaseSecond = lockAdminModalScroll(documentRef);

    releaseFirst();
    expect(documentRef.body.style.overflow).toBe('hidden');
    releaseSecond();
    expect(documentRef.body.style.overflow).toBe('auto');
    expect(documentRef.documentElement.style.overflow).toBe('scroll');
  });

  it('closes on Escape and restores scrolling when the modal lifecycle cleans up', () => {
    const documentRef = makeDocument();
    let closed = false;
    const cleanup = createAdminModalLifecycle(documentRef, () => { closed = true; });
    let prevented = false;
    let propagationStopped = false;
    documentRef.handlers.keydown({
      key: 'Escape',
      defaultPrevented: false,
      preventDefault() { prevented = true; },
      stopImmediatePropagation() { propagationStopped = true; }
    });

    expect(closed).toBe(true);
    expect(prevented).toBe(true);
    expect(propagationStopped).toBe(true);
    cleanup();
    expect(documentRef.body.style.overflow).toBe('auto');
    expect(documentRef.handlers.keydown).toBeUndefined();
  });

  it('keeps footer actions outside the scrolling body', () => {
    const markup = renderToStaticMarkup(createElement(AdminDialog, {
      title: 'Settings',
      onClose: () => {},
      footer: createElement('button', { type: 'submit' }, 'Save'),
      children: createElement('form', { id: 'settings-form' }, createElement('input', { name: 'value' }))
    }));
    const bodyEnd = markup.indexOf('</div>', markup.indexOf('class="admin-dialog-body"'));
    const footerStart = markup.indexOf('class="admin-dialog-footer"');

    expect(markup).toContain('class="admin-dialog-header"');
    expect(bodyEnd).toBeGreaterThan(-1);
    expect(footerStart).toBeGreaterThan(bodyEnd);
    expect(markup).toContain('>Save</button>');
  });
});