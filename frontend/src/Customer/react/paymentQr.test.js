import { describe, expect, it, vi } from 'vitest';
import { downloadQrImage, qrPreviewReducer } from './paymentQr';

describe('GCash QR preview and download', () => {
  it('opens and closes the preview by button, Escape, outside click, or close button', () => {
    const opened = qrPreviewReducer(false, { type: 'open' });
    expect(opened).toBe(true);
    expect(qrPreviewReducer(opened, { type: 'escape' })).toBe(false);
    expect(qrPreviewReducer(opened, { type: 'outside-click' })).toBe(false);
    expect(qrPreviewReducer(opened, { type: 'close' })).toBe(false);
    expect(qrPreviewReducer(opened, { type: 'inside-click' })).toBe(true);
  });

  it('downloads the image blob with a useful file name', async () => {
    vi.useFakeTimers();
    const link = { click: vi.fn(), remove: vi.fn() };
    const documentRef = {
      createElement: vi.fn(() => link),
      body: { appendChild: vi.fn() }
    };
    const fetchImage = vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(new Blob(['qr']))
    });
    const revokeObjectUrl = vi.fn();

    await downloadQrImage('https://images.example/gcash-qr.png', {
      fetchImage,
      documentRef,
      createObjectUrl: vi.fn(() => 'blob:qr'),
      revokeObjectUrl
    });
    await vi.advanceTimersByTimeAsync(1000);

    expect(fetchImage).toHaveBeenCalledWith('https://images.example/gcash-qr.png', { mode: 'cors' });
    expect(link.download).toBe('gcash-qr.png');
    expect(link.click).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:qr');
    vi.useRealTimers();
  });

  it('reports cross-origin image download failures for the long-press fallback', async () => {
    await expect(downloadQrImage('https://images.example/qr.png', {
      fetchImage: vi.fn().mockRejectedValue(new Error('CORS blocked'))
    })).rejects.toThrow('CORS blocked');
  });
});
