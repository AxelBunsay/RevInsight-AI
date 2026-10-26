import { describe, expect, it } from 'vitest';
import reservationController from '../controllers/reservationController.js';

const { canTransitionReservationStatus } = reservationController;

describe('reservation status transitions', () => {
  it.each([
    ['Pending Down Payment', 'Payment Submitted'],
    ['Pending Down Payment', 'Cancelled'],
    ['Pending Down Payment', 'Expired'],
    ['Payment Submitted', 'Reserved'],
    ['Payment Submitted', 'Pending Down Payment'],
    ['Payment Submitted', 'Cancelled'],
    ['Reserved', 'Completed'],
    ['Reserved', 'Cancelled'],
    ['Reserved', 'Expired'],
    ['Expired', 'Cancelled']
  ])('allows %s -> %s', (current, next) => {
    expect(canTransitionReservationStatus(current, next)).toBe(true);
  });

  it.each([
    ['Completed', 'Cancelled'],
    ['Cancelled', 'Reserved'],
    ['Payment Submitted', 'Completed'],
    ['Pending Down Payment', 'Completed'],
    ['Unknown', 'Cancelled']
  ])('rejects %s -> %s', (current, next) => {
    expect(canTransitionReservationStatus(current, next)).toBe(false);
  });
});
