const transitions = {
  'Pending Down Payment': ['Payment Submitted', 'Cancelled', 'Expired'],
  'Payment Submitted': ['Reserved', 'Pending Down Payment', 'Cancelled'],
  Reserved: ['Completed', 'Cancelled', 'Expired'],
  Expired: ['Cancelled'],
  Completed: [],
  Cancelled: []
};

const canTransitionReservationStatus = (currentStatus, nextStatus) => (
  transitions[currentStatus]?.includes(nextStatus) || false
);

module.exports = { canTransitionReservationStatus };
