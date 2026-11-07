import { describe, expect, it, vi } from 'vitest';
import { askRevenueQuestion, handleQuestionKeyDown } from './askRevenueQuestion';

describe('Ask AI question submission', () => {
  it('submits Enter and ignores Shift+Enter and IME composition', () => {
    const submit = vi.fn();
    const preventDefault = vi.fn();
    const keyEvent = (overrides = {}) => ({ key: 'Enter', shiftKey: false, preventDefault, ...overrides });

    expect(handleQuestionKeyDown(keyEvent(), submit)).toBe(true);
    expect(handleQuestionKeyDown(keyEvent({ shiftKey: true }), submit)).toBe(false);
    expect(handleQuestionKeyDown(keyEvent({ isComposing: true }), submit)).toBe(false);
    expect(handleQuestionKeyDown(keyEvent({ keyCode: 229 }), submit)).toBe(false);
    expect(submit).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it('does not send whitespace-only questions', async () => {
    const request = vi.fn();
    const result = await askRevenueQuestion({
      question: '  \n ',
      inFlightRef: { current: false },
      request,
      setIsLoading: vi.fn(),
      setAnswer: vi.fn(),
      setChart: vi.fn(),
      setTimestamp: vi.fn(),
      setError: vi.fn()
    });

    expect(result).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it('prevents a second send while the first request is in flight', async () => {
    let resolveRequest;
    const request = vi.fn(() => new Promise((resolve) => { resolveRequest = resolve; }));
    const inFlightRef = { current: false };
    const callbacks = {
      question: 'Revenue trend?',
      inFlightRef,
      request,
      setIsLoading: vi.fn(),
      setAnswer: vi.fn(),
      setChart: vi.fn(),
      setTimestamp: vi.fn(),
      setError: vi.fn()
    };

    const first = askRevenueQuestion(callbacks);
    const second = await askRevenueQuestion(callbacks);
    expect(second).toBe(false);
    expect(request).toHaveBeenCalledOnce();

    resolveRequest({ answer: 'Answer', chart: { type: 'quarterly_trend' }, timestamp: '2026-10-29T01:00:00.000Z' });
    await expect(first).resolves.toBe(true);
    expect(inFlightRef.current).toBe(false);
    expect(callbacks.setChart).toHaveBeenCalledWith({ type: 'quarterly_trend' });
  });
});
