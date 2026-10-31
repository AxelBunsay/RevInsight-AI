import { formatTransactionMoney, getShortTransactionId } from './transactionCardData';

export default function TransactionCards({
  transactions,
  activeTab,
  isLoading,
  emptyMessage,
  onView,
  renderActions
}) {
  if (isLoading) {
    return <div className="transaction-card-state" role="status">Loading transactions...</div>;
  }

  if (!transactions.length) {
    return <div className="transaction-card-state" role="status">{emptyMessage}</div>;
  }

  return <div className="transaction-card-list" aria-label={`${activeTab} transaction cards`}>
    {transactions.map((transaction) => {
      const fullId = String(transaction._id || transaction.id || '');
      const isService = transaction.recordType === 'service' || transaction.isServiceRequest;
      const statusClass = String(transaction.status || 'completed').toLowerCase().replaceAll(' ', '-');
      const itemSummary = transaction.reservationItems?.length
        ? transaction.reservationItems.map((item) => `${item.displayName || item.name || 'Item'} × ${item.qty} · ${formatTransactionMoney(item.lineTotal)}`).join(', ')
        : transaction.items || 'N/A';
      return <article className="transaction-card" key={transaction.id || transaction._id}>
        <div className="transaction-card__top">
          <strong className="transaction-card__customer">{transaction.customer || 'Unknown'}</strong>
          <div className="transaction-card__badges">
            {activeTab === 'all' && <span className={`transaction-type-badge ${isService ? 'is-service' : 'is-item'}`}>
              {isService ? 'Service' : 'Item'}
            </span>}
            <span className={`status-badge status-${statusClass}`}>{transaction.status || 'completed'}</span>
          </div>
        </div>
        <p className="transaction-card__items" title={itemSummary}>
          {transaction.items || 'N/A'}
        </p>
        <div className="transaction-card__details">
          <span>{transaction.date || 'N/A'}</span>
          <span title={`Full record ID: ${fullId}`}>ID {getShortTransactionId(transaction)}</span>
          {activeTab === 'items' && transaction.customerPhone && <span>{transaction.customerPhone}</span>}
          {transaction.mechanic && transaction.mechanic !== 'N/A' && (
            <span>Mechanic: {transaction.mechanic}</span>
          )}
        </div>
        {activeTab === 'items' && <div className="transaction-card__extra-details">
          <span>Payment: {transaction.paymentMethod || '—'}</span>
          {transaction.paymentReference && <span>Ref {transaction.paymentReference}</span>}
          {transaction.reservedUntil && <span>Hold until {new Date(transaction.reservedUntil).toLocaleString('en-PH')}</span>}
          {transaction.rejectionReason && <span>Last rejection: {transaction.rejectionReason}</span>}
          {transaction.refundDecision && <span>Refund decision: {transaction.refundDecision}</span>}
          {transaction.bookingStatus && <span>Reservation status: {transaction.bookingStatus}</span>}
        </div>}
        {activeTab === 'services' && transaction.isServiceRequest && <div className="transaction-card__extra-details">
          <span>Payment: {transaction.paymentStatus}</span>
          {transaction.paymentReference && <span>Ref {transaction.paymentReference}</span>}
          {transaction.refundDecision && <span>Refund decision: {transaction.refundDecision}</span>}
        </div>}
        {activeTab === 'all' && transaction.refundDecision && <div className="transaction-card__extra-details">
          <span>Refund decision: {transaction.refundDecision}</span>
        </div>}
        {transaction.status === 'Payment Submitted' && <small className="transaction-needs-review">Needs review</small>}
        <div className="transaction-card__money" aria-label="Payment summary">
          <div><span>Amount</span><strong>{formatTransactionMoney(activeTab === 'services' && transaction.isServiceRequest
            ? transaction.estimatedPrice ?? transaction.amount
            : transaction.amount)}</strong></div>
          <div><span>Down payment paid</span><strong>{activeTab === 'all' && isService ? '—' : formatTransactionMoney(transaction.paid)}</strong></div>
          <div><span>Balance to collect</span><strong>{activeTab === 'all' && isService ? '—' : formatTransactionMoney(transaction.balance)}</strong></div>
        </div>
        <div className="transaction-card__actions">
          <button
            className="btn-small btn-edit transaction-card__view"
            type="button"
            aria-label={`View details for ${transaction.customer || 'transaction'}`}
            onClick={() => onView(transaction)}
          >View</button>
          {renderActions?.(transaction)}
        </div>
      </article>;
    })}
  </div>;
}