import Panel from '../common/Panel';
import Badge from '../common/Badge';
import EmptyState from '../common/EmptyState';
import { LOW_STOCK_THRESHOLD } from '../../../../../shared/inventory.json';

function InventoryHealth({ inventory = { inStock: 0, low: 0, out: 0, lowItems: [] } }) {
  const total = Number(inventory.inStock || 0) + Number(inventory.low || 0) + Number(inventory.out || 0);
  const segments = [
    { key: 'inStock', label: 'In stock', value: Number(inventory.inStock || 0) },
    { key: 'low', label: 'Low', value: Number(inventory.low || 0) },
    { key: 'out', label: 'Out', value: Number(inventory.out || 0) }
  ];

  return (
    <Panel title="Inventory health" className="admin-inventory-panel">
      <div className="admin-stock-bar" role="img" aria-label={segments.map((segment) => `${segment.label}: ${segment.value}`).join(', ')}>
        {segments.map((segment) => <span key={segment.key} className={`admin-stock-bar__segment is-${segment.key}`} style={{ width: `${total ? (segment.value / total) * 100 : 0}%` }} />)}
      </div>
      <ul className="admin-stock-legend" aria-label="Inventory stock levels">
        {segments.map((segment) => <li key={segment.key}><span className={`admin-stock-legend__dot is-${segment.key}`} />{segment.label}<strong>{segment.value}</strong></li>)}
      </ul>
      <div className="admin-low-stock">
        <h3>Low-stock items</h3>
        {!inventory.lowItems?.length ? <EmptyState>All listed items have healthy stock levels.</EmptyState> : inventory.lowItems.map((item) => (
          <div className="admin-low-stock__row" key={item.id || item._id || item.name}>
            <span>{item.name}</span>
            <Badge tone={Number(item.quantity) <= 0 ? 'bad' : Number(item.quantity) <= LOW_STOCK_THRESHOLD ? 'warn' : 'neutral'}>
              {Number(item.quantity) <= 0 ? 'Out of stock' : `${item.quantity} left`}
            </Badge>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export default InventoryHealth;
