export default function TransactionsPageActions({ activeTab, onOpenSettings, onExport, isExporting }) {
  return <div className="transactions-page-actions" data-active-tab={activeTab}>
    <button className="btn-small" type="button" onClick={onOpenSettings}>
      Payment &amp; reservation settings
    </button>
    <button className="btn-small" type="button" disabled={isExporting} onClick={onExport}>
      {isExporting ? "Exporting..." : "Export"}
    </button>
  </div>;
}
