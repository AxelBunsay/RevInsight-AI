import { describe, expect, it } from 'vitest';
import { calculateServiceAmounts, formatServiceName, serviceUnitSummary } from './servicePricing';

describe('service unit display helpers', () => {
  it('keeps the original name for single-unit services and formats plural units', () => {
    expect(formatServiceName('Bearing Replacement', 1, 'wheel hub')).toBe('Bearing Replacement');
    expect(formatServiceName('Bearing Replacement', 2, 'wheel hub')).toBe('Bearing Replacement x2 wheel hubs');
    expect(formatServiceName('Wheel Service', 2, 'wheels')).toBe('Wheel Service x2 wheels');
  });

  it('formats the saved unit count and label for booking details', () => {
    expect(serviceUnitSummary(1, 'wheel hub')).toBe('1 wheel hub');
    expect(serviceUnitSummary(2, 'wheel hub')).toBe('2 wheel hubs');
  });

  it('adds mechanic fees into customer totals without adding them twice', () => {
    expect(calculateServiceAmounts(150, 50, 2)).toEqual({
      servicePriceTotal: 300,
      mechanicFeeTotal: 100,
      estimatedPrice: 400
    });
    expect(calculateServiceAmounts(150, 50)).toEqual({
      servicePriceTotal: 150,
      mechanicFeeTotal: 50,
      estimatedPrice: 200
    });
  });
});
