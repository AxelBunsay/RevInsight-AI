import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { adminApi as api } from "../services/adminApi";
import { AdminDialog, AdminPageFrame } from "./ManagementPageComponents";

function formatBusinessRecord(record) {
  return {
    ...record,
    id: record.isReservation ? record.code : record._id,
    customer: record.customer || "Unknown",
    customerPhone: record.customer === "Deleted customer" ? "" : record.customerPhone,
    date: new Date(record.completedAt || record.createdAt).toLocaleDateString(
      "en-PH",
    ),
    items: record.isReservation && Array.isArray(record.items)
      ? record.items.map((item) => `${item.name} × ${item.qty}`).join(", ")
      : record.itemName || "N/A",
    reservationItems: record.isReservation && Array.isArray(record.items) ? record.items : [],
    amount: Number(record.amount || 0),
    status: record.status || "completed",
    mechanic:
      record.mechanicName ||
      (record.recordType === "service" ? "Unassigned" : "N/A"),
    recordLabel: record.recordType === "service" ? "Service" : "Item",
    quantity: record.quantity,
    paid: Number(record.paid ?? record.amountPaid ?? (record.recordType === "product" ? record.amount : 0)),
    balance: Number(record.balance ?? record.balanceDue ?? 0),
  };
}

const defaultReservationSettings = {
  downPaymentPercent: 30,
  pendingPaymentHours: 24,
  holdDays: 3,
  paymentInstructions: { methodName: "", accountName: "", accountNumber: "", qrImageUrl: "", qrImagePublicId: "" },
  pickupAddress: "",
  pickupHours: "",
};

const reservationStatuses = [
  "Pending Down Payment",
  "Payment Submitted",
  "Reserved",
  "Completed",
  "Cancelled",
  "Expired",
];

const transactionStatuses = ["completed", "pending", "cancelled", "Paid", "Payment Submitted", "Payment Pending", "Confirmed", "Paid at shop"];

const formatMoney = (value) => `₱${Number(value || 0).toLocaleString("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

function formatReservationRecord(reservation) {
  const customer = reservation.customerId;
  const isDeletedCustomer = Boolean(customer && typeof customer === "object" && customer.isDeleted);
  const customerName = customer && typeof customer === "object" && !customer.isDeleted
    ? `${customer.firstName || ""} ${customer.lastName || ""}`.trim()
    : "";

  return {
    ...reservation,
    id: reservation.code || reservation._id,
    isReservation: true,
    recordType: "product",
    recordLabel: "Item",
    customer: isDeletedCustomer ? "Deleted customer" : customerName || reservation.customerName || "Unknown",
    customerPhone: isDeletedCustomer ? "" : (customer && typeof customer === "object" ? customer.phoneNumber : "") || reservation.customerPhone || "",
    date: new Date(reservation.createdAt).toLocaleString("en-PH"),
    items: (reservation.items || []).map((item) => `${item.name} × ${item.qty}`).join(", ") || "N/A",
    reservationItems: reservation.items || [],
    amount: Number(reservation.total || 0),
    paid: Number(reservation.amountPaid || 0),
    balance: Number(reservation.balanceDue || 0),
    mechanic: "N/A",
  };
}

function formatServiceRequestRecord(request) {
  const customer = request.user || {};
  const customerName = `${customer.firstName || ""} ${customer.lastName || ""}`.trim();
  const status = request.paymentStatus === "Payment Submitted"
    ? "Payment Submitted"
    : request.paymentStatus === "Payment Pending" && request.paymentRejectionReason
      ? "Payment Pending"
      : request.paymentStatus === "Confirmed" && request.status === "pending"
        ? "Confirmed"
        : request.paymentStatus === "Paid at shop" && request.status === "pending"
          ? "Paid at shop"
        : request.status || "pending";
  return {
    ...request,
    id: request.code || request._id,
    isServiceRequest: true,
    recordType: "service",
    recordLabel: "Service",
    customer: customer.isDeleted ? "Deleted customer" : customerName || customer.email || "Unknown",
    date: request.scheduledDate
      ? new Date(request.scheduledDate).toLocaleDateString("en-PH")
      : new Date(request.createdAt).toLocaleDateString("en-PH"),
    items: request.serviceType || "Service booking",
    amount: Number(request.estimatedPrice || 0),
    status,
    bookingStatus: request.status || "pending",
    mechanic: request.mechanic?.firstName
      ? `${request.mechanic.firstName} ${request.mechanic.lastName || ""}`.trim()
      : "Unassigned",
    paymentStatus: request.paymentStatus || "Payment Pending",
    refundDecision: request.refundDecision || null,
    paymentReference: request.paymentReference || "",
    downPaymentAmount: Number(request.estimatedPrice || 0)
  };
}

function Transactions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("type");
  const activeTab = requestedTab === "items" || requestedTab === "services"
    ? requestedTab
    : "all";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [transactions, setTransactions] = useState([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [recordCount, setRecordCount] = useState(0);
  const [counts, setCounts] = useState({ all: 0, items: 0, services: 0 });
  const [paymentSubmittedCount, setPaymentSubmittedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [statusBeingSaved, setStatusBeingSaved] = useState(false);
  const [markingPaidAtShopId, setMarkingPaidAtShopId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [reservationAction, setReservationAction] = useState(null);
  const [reservationActionError, setReservationActionError] = useState("");
  const [rejectingPayment, setRejectingPayment] = useState(false);
  const [actionReason, setActionReason] = useState("");
  const [refundDecision, setRefundDecision] = useState("");
  const [balanceReceived, setBalanceReceived] = useState(false);
  const [isPerformingReservationAction, setIsPerformingReservationAction] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(defaultReservationSettings);
  const [settingsError, setSettingsError] = useState("");
  const [settingsToast, setSettingsToast] = useState("");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isUploadingQr, setIsUploadingQr] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const beginReservationAction = useCallback(async (transaction, action) => {
    if (action === "review") {
      try {
        const recordId = transaction._id || transaction.sourceId;
        const response = transaction.isServiceRequest
          ? await api.getServiceRequestReceipts(recordId)
          : await api.getReservationReceipts(recordId);
        transaction = { ...transaction, paymentSubmissions: response.paymentSubmissions || [] };
      } catch (receiptError) {
        setError(receiptError.message || "Payment receipts could not be loaded.");
        return;
      }
    }
    setReservationAction({ transaction, action });
    setReservationActionError("");
    setRejectingPayment(false);
    setActionReason("");
    setRefundDecision("");
    setBalanceReceived(false);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadTransactions = async ({ background = false } = {}) => {
      if (!background) setIsLoading(true);
      try {
        if (activeTab === "items") {
          const [reservationResponse, summaryResponse] = await Promise.all([
            api.getReservations({
              status: statusFilter === "All" ? "" : statusFilter,
              search: search.trim(),
            }),
            api.getTransactions({ page: 1, limit: 1, type: "item" }),
          ]);
          if (!isMounted) return;
          const reservations = (reservationResponse.reservations || []).map(formatReservationRecord);
          const pages = Math.max(1, Math.ceil(reservations.length / 10));
          setTransactions(reservations.slice((page - 1) * 10, page * 10));
          setError("");
          setRecordCount(reservations.length);
          setCounts({ ...(summaryResponse.counts || {}), items: reservations.length });
          setPaymentSubmittedCount(Number(summaryResponse.counts?.paymentSubmitted || 0));
          setTotalPages(pages);
          if (page > pages) setPage(pages);
        } else if (activeTab === "services") {
          const candidateLimit = page * 10;
          const [response, requestResponse] = await Promise.all([
            api.getTransactions({
              page: 1,
              limit: candidateLimit,
              type: "service",
              search: search.trim(),
              status: statusFilter === "All" ? "" : statusFilter,
            }),
            api.getAdminServiceRequests({
              page: 1,
              limit: candidateLimit,
              activeOnly: true,
              search: search.trim(),
              status: statusFilter === "All" ? "" : statusFilter,
            })
          ]);
          if (!isMounted) return;
          const businessRecords = (response.data || []).map(formatBusinessRecord);
          const serviceRequests = (requestResponse.requests || []).map(formatServiceRequestRecord);
          const submittedPaymentCount = serviceRequests.filter((record) => record.paymentStatus === "Payment Submitted").length;
          let combined = [...serviceRequests, ...businessRecords];
          if (statusFilter !== "All") combined = combined.filter((record) => record.status === statusFilter);
          if (search.trim()) {
            const term = search.trim().toLowerCase();
            combined = combined.filter((record) => [record.customer, record.items, record.mechanic, record.id, record.paymentReference]
              .some((value) => String(value || "").toLowerCase().includes(term)));
          }
          combined.sort((left, right) => {
            const leftNeedsReview = left.status === "Payment Submitted" ? 0 : 1;
            const rightNeedsReview = right.status === "Payment Submitted" ? 0 : 1;
            const leftDate = left.completedAt || left.createdAt || 0;
            const rightDate = right.completedAt || right.createdAt || 0;
            return leftNeedsReview - rightNeedsReview || new Date(rightDate) - new Date(leftDate);
          });
          const totalRecords = Number(response.pagination?.totalRecords || 0)
            + Number(requestResponse.pagination?.totalRecords || serviceRequests.length);
          setTransactions(combined.slice((page - 1) * 10, page * 10));
          setError("");
          setRecordCount(totalRecords);
          setTotalAmount(Number(response.totalAmount || 0));
          setPaymentSubmittedCount(Number(requestResponse.paymentSubmittedCount ?? submittedPaymentCount));
          setCounts((current) => ({ ...current, services: totalRecords }));
          setTotalPages(Math.max(1, Math.ceil(totalRecords / 10)));
          if (page > Math.max(1, Math.ceil(totalRecords / 10))) setPage(Math.max(1, Math.ceil(totalRecords / 10)));
        } else {
          const response = await api.getTransactions({
            page,
            limit: 10,
            type: activeTab === "services" ? "service" : "",
            search: search.trim(),
            status: statusFilter === "All" ? "" : statusFilter,
          });
          if (!isMounted) return;
          const data = (response.data || []).map(formatBusinessRecord);
          setTransactions(data);
          setError("");
          setTotalAmount(Number(response.totalAmount || 0));
          setRecordCount(Number(response.pagination?.totalRecords || 0));
          setCounts(response.counts || { all: 0, items: 0, services: 0 });
          if (!search.trim() && statusFilter === "All") {
            setPaymentSubmittedCount(Number(response.counts?.paymentSubmitted || 0));
          }
          setTotalPages(response.pagination?.totalPages || 1);
          if (page > (response.pagination?.totalPages || 1)) {
            setPage(response.pagination?.totalPages || 1);
          }
        }
      } catch (fetchError) {
        if (isMounted) {
          setError(fetchError.message || "Failed to load transactions");
        }
      } finally {
        if (isMounted && !background) setIsLoading(false);
      }
    };

    loadTransactions();
    const refreshInterval = window.setInterval(() => loadTransactions({ background: true }), 30000);

    return () => {
      isMounted = false;
      window.clearInterval(refreshInterval);
    };
  }, [activeTab, page, refreshKey, search, statusFilter]);

  useEffect(() => {
    const reviewId = searchParams.get("review");
    if (!reviewId) return undefined;
    let active = true;
    const openReview = async () => {
      try {
        let transaction = transactions.find((record) => (
          String(record._id || "") === reviewId
          || String(record.sourceId || "") === reviewId
        ));
        if (!transaction && activeTab === "items") {
          const response = await api.getReservations({ status: "Payment Submitted" });
          const reservation = (response.reservations || []).find((record) => String(record._id) === reviewId);
          if (reservation) transaction = formatReservationRecord(reservation);
        }
        if (!transaction && activeTab === "services") {
          const response = await api.getAdminServiceRequests();
          const request = (response.requests || []).find((record) => String(record._id) === reviewId);
          if (request) transaction = formatServiceRequestRecord(request);
        }
        if (!active || !transaction) return;
        await beginReservationAction(transaction, "review");
        if (!active) return;
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("review");
        setSearchParams(nextParams, { replace: true });
      } catch (reviewError) {
        if (active) setError(reviewError.message || "Payment review could not be opened.");
      }
    };
    openReview();
    return () => { active = false; };
  }, [activeTab, beginReservationAction, searchParams, setSearchParams, transactions]);

  const tabOptions = [
    { id: "all", label: "All", count: counts.all },
    { id: "items", label: "Items", count: counts.items },
    { id: "services", label: "Services", count: counts.services },
  ];
  const statusOptions = activeTab === "items"
    ? reservationStatuses
    : activeTab === "services"
      ? transactionStatuses
      : [...reservationStatuses, ...transactionStatuses.filter((status) => !reservationStatuses.includes(status))];
  const changeTab = (tab) => {
    setPage(1);
    setStatusFilter("All");
    const nextParams = new URLSearchParams(searchParams);
    if (tab === "all") nextParams.delete("type");
    else nextParams.set("type", tab);
    setSearchParams(nextParams);
  };
  const handleTabKeyDown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = tabOptions.findIndex((tab) => tab.id === activeTab);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabOptions.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : tabOptions.length - 1)) % tabOptions.length;
    const nextTab = tabOptions[nextIndex].id;
    changeTab(nextTab);
    window.requestAnimationFrame(() => document.getElementById(`transactions-tab-${nextTab}`)?.focus());
  };
  const searchPlaceholder = activeTab === "items"
    ? "Search code, customer, phone, or payment reference..."
    : activeTab === "services"
      ? "Search by customer, service or mechanic..."
      : "Search by customer, item, mechanic...";
  const emptyMessage = activeTab === "items"
    ? "No reservations match these filters."
    : activeTab === "services"
      ? "No service transactions yet."
      : "No transactions yet.";

  const viewTransaction = async (transaction) => {
    if (transaction.recordType !== "product" || transaction.isReservation) {
      setSelectedTransaction(transaction);
      return;
    }

    try {
      const response = await api.getTransaction(transaction.sourceId);
      setSelectedTransaction(response.data || transaction);
    } catch (detailError) {
      setError(detailError.message || "Failed to load transaction details");
    }
  };

  const markServicePaidAtShop = async (transaction) => {
    setMarkingPaidAtShopId(transaction._id);
    setError("");
    try {
      await api.markServicePaidAtShop(transaction._id);
      setSettingsToast("Service payment marked paid at the shop.");
      setRefreshKey((key) => key + 1);
    } catch (paymentError) {
      setError(paymentError.message || "Service payment could not be updated.");
    } finally {
      setMarkingPaidAtShopId("");
    }
  };

  const performReservationAction = async (event, actionOverride) => {
    event?.preventDefault();
    if (!reservationAction) return;
    const { transaction } = reservationAction;
    const action = actionOverride || reservationAction.action;
    setReservationActionError("");
    setIsPerformingReservationAction(true);
    try {
      if (transaction.isServiceRequest && action === "confirm") await api.confirmServicePayment(transaction._id);
      if (transaction.isServiceRequest && action === "reject") await api.rejectServicePayment(transaction._id, actionReason);
      if (transaction.isServiceRequest && ["cancel-service", "decline-service"].includes(action)) {
        await api.updateAdminServiceRequestStatus(
          transaction._id,
          action === "cancel-service" ? "cancelled" : "declined",
          { reason: actionReason, refundDecision },
        );
      }
      if (action === "confirm" && !transaction.isServiceRequest) await api.confirmReservation(transaction._id);
      if (action === "reject" && !transaction.isServiceRequest) await api.rejectReservation(transaction._id, actionReason);
      if (action === "complete") await api.completeReservation(transaction._id);
      if (action === "refund") await api.decideExpiredReservationRefund(transaction._id, refundDecision);
      if (action === "cancel") {
        await api.cancelReservation(
          transaction._id,
          actionReason,
          transaction.amountPaid > 0 ? refundDecision || transaction.refundDecision : undefined,
        );
      }
      setReservationAction(null);
      setRefreshKey((key) => key + 1);
      setSettingsToast(action === "confirm" ? (transaction.isServiceRequest ? "Service payment confirmed." : "Down payment confirmed.") : action === "complete" ? "Pickup completed." : action === "reject" ? "Payment rejected." : action === "refund" ? "Refund decision recorded." : action === "cancel-service" || action === "decline-service" ? "Service booking updated." : "Reservation cancelled.");
    } catch (actionError) {
      setReservationActionError(actionError.message || "Reservation action could not be completed.");
    } finally {
      setIsPerformingReservationAction(false);
    }
  };

  const openSettings = async () => {
    setSettingsError("");
    setSettingsToast("");
    setSettingsOpen(true);
    try {
      const response = await api.getReservationSettings();
      setSettings({
        ...defaultReservationSettings,
        ...response.settings,
        paymentInstructions: {
          ...defaultReservationSettings.paymentInstructions,
          ...response.settings?.paymentInstructions,
        },
      });
    } catch (settingsLoadError) {
      setSettingsError(settingsLoadError.message || "Reservation settings could not be loaded.");
    }
  };

  const updatePaymentInstruction = (field, value) => {
    setSettings((current) => ({
      ...current,
      paymentInstructions: { ...current.paymentInstructions, [field]: value },
    }));
  };

  const uploadGcashQr = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setSettingsError("Choose a PNG or JPG QR image no larger than 2 MB.");
      return;
    }
    setSettingsError("");
    setIsUploadingQr(true);
    try {
      const response = await api.uploadGcashQr(file);
      setSettings((current) => ({
        ...current,
        paymentInstructions: {
          ...current.paymentInstructions,
          qrImageUrl: response.qrImageUrl
        }
      }));
    } catch (uploadError) {
      setSettingsError(uploadError.message || "GCash QR image could not be uploaded.");
    } finally {
      setIsUploadingQr(false);
    }
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    setSettingsError("");
    setIsSavingSettings(true);
    try {
      const response = await api.updateReservationSettings(settings);
      setSettings({
        ...defaultReservationSettings,
        ...response.settings,
        paymentInstructions: {
          ...defaultReservationSettings.paymentInstructions,
          ...response.settings?.paymentInstructions,
        },
      });
      setSettingsOpen(false);
      setSettingsToast("Reservation settings saved.");
    } catch (settingsSaveError) {
      setSettingsError(settingsSaveError.message || "Reservation settings could not be saved.");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const exportTransactions = async () => {
    setIsExporting(true);
    setError("");
    try {
      let allRows;
      if (activeTab === "items") {
        const response = await api.getReservations({
          status: statusFilter === "All" ? "" : statusFilter,
          search: search.trim(),
        });
        allRows = response.reservations || [];
      } else {
        const type = activeTab === "services" ? "service" : "";
        const firstPage = await api.getTransactions({
          page: 1,
          limit: 100,
          type,
          search: search.trim(),
          status: statusFilter === "All" ? "" : statusFilter,
        });
        allRows = [...(firstPage.data || [])];
        const pages = Number(firstPage.pagination?.totalPages || 1);
        for (let nextPage = 2; nextPage <= pages; nextPage += 1) {
          const response = await api.getTransactions({
            page: nextPage,
            limit: 100,
            type,
            search: search.trim(),
            status: statusFilter === "All" ? "" : statusFilter,
          });
          allRows.push(...(response.data || []));
        }
      }
      const headers = activeTab === "services"
        ? ["Record ID", "Date", "Customer", "Service", "Mechanic", "Amount", "Status"]
        : activeTab === "items"
          ? ["Reservation ID", "Date", "Customer", "Item(s)", "Total", "Paid", "Balance", "Status"]
          : ["Record ID", "Date", "Type", "Customer", "Item / Service", "Amount", "Paid", "Balance", "Status", "Mechanic"];
      const exportRows = allRows.map((row) => {
        const transaction = activeTab === "items"
          ? formatReservationRecord(row)
          : formatBusinessRecord(row);
        if (activeTab === "services") {
          return [transaction.id, transaction.date, transaction.customer, transaction.items, transaction.mechanic, transaction.amount, transaction.status];
        }
        if (activeTab === "items") {
          return [transaction.code || transaction.id, transaction.date, transaction.customer, transaction.items, transaction.amount, transaction.paid, transaction.balance, transaction.status];
        }
        return [transaction.id, transaction.date, transaction.recordLabel, transaction.customer, transaction.items, transaction.amount, transaction.recordType === "product" ? transaction.paid : "", transaction.recordType === "product" ? transaction.balance : "", transaction.status, transaction.mechanic];
      });
      const csvCell = (value) => {
        let cell = String(value ?? "");
        if (/^[=+\-@]/.test(cell)) cell = `'${cell}`;
        return `"${cell.replaceAll('"', '""')}"`;
      };
      const csv = [[`${activeTab[0].toUpperCase()}${activeTab.slice(1)} Transactions`], headers, ...exportRows]
        .map((row) => row.map(csvCell).join(","))
        .join("\r\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${activeTab}-transactions.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError.message || "Transactions could not be exported.");
    } finally {
      setIsExporting(false);
    }
  };

  const updateTransactionStatus = async (status) => {
    if (!selectedTransaction) return;

    setStatusBeingSaved(true);
    try {
      const response = await api.updateTransaction(
        selectedTransaction._id || selectedTransaction.id,
        { status },
      );
      setSelectedTransaction(
        response.data || { ...selectedTransaction, status },
      );
      setRefreshKey((key) => key + 1);
    } catch (updateError) {
      setError(updateError.message || "Failed to update transaction status");
    } finally {
      setStatusBeingSaved(false);
    }
  };

  return (
    <AdminPageFrame>
      <section className="section-content active">
        <div className="transactions-container">
          {error && (
            <p className="dashboard-error" role="alert">
              {error}
            </p>
          )}
          {settingsToast && <p className="reservation-admin-toast" role="status">{settingsToast}</p>}
          <div className="transactions-tabs-row">
            <div className="transactions-tabs" role="tablist" aria-label="Transaction type" onKeyDown={handleTabKeyDown}>
              {tabOptions.map((tab) => (
                <button
                  id={`transactions-tab-${tab.id}`}
                  key={tab.id}
                  className={activeTab === tab.id ? "is-active" : ""}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls="transactions-panel"
                  tabIndex={activeTab === tab.id ? 0 : -1}
                  onClick={() => changeTab(tab.id)}
                >
                  {tab.label} ({tab.count})
                  {(tab.id === "items" || tab.id === "services") && (
                    <span className="transaction-review-count" aria-label={`${paymentSubmittedCount} payments to review`}>
                      {paymentSubmittedCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="transactions-page-actions">
              {activeTab === "items" && (
                <button className="btn-small" type="button" onClick={openSettings}>
                  Reservation settings
                </button>
              )}
              <button className="btn-small" type="button" disabled={isExporting} onClick={exportTransactions}>
                {isExporting ? "Exporting..." : "Export"}
              </button>
            </div>
          </div>
          <div className="transactions-header">
            <div className="transactions-info">
              {activeTab === "items"
                ? `${recordCount} shown · latest 200 matching reservations`
                : <>
                    Total: ₱
                    {Number(totalAmount).toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    {" · "}
                    {recordCount} records
                  </>}
            </div>
          </div>
          <div className="search-filter">
            <input
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
              placeholder={searchPlaceholder}
            />
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="All">All</option>
              {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
          <div id="transactions-panel" role="tabpanel" aria-labelledby={`transactions-tab-${activeTab}`}>
            <table className="transactions-table">
              <thead>
                <tr>
                  <th>{activeTab === "items" ? "RESERVATION ID" : "RECORD ID"}</th>
                  <th>DATE</th>
                  {activeTab === "all" && <th>TYPE</th>}
                  <th>CUSTOMER</th>
                  <th>{activeTab === "items" ? "ITEM(S)" : activeTab === "services" ? "SERVICE" : "ITEM / SERVICE"}</th>
                  {activeTab === "services" && <th>MECHANIC</th>}
                  <th>{activeTab === "items" ? "TOTAL" : "AMOUNT"}</th>
                  {activeTab !== "services" && <><th>PAID</th><th>BALANCE</th></>}
                  {activeTab === "items" && <th>PAYMENT</th>}
                  <th>STATUS</th>
                  {activeTab === "all" && <th>MECHANIC</th>}
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }, (_, index) => (
                    <tr className="transactions-skeleton-row" key={`skeleton-${index}`} aria-hidden="true">
                      <td colSpan={activeTab === "all" ? 11 : activeTab === "items" ? 10 : 8}>
                        <span className="transactions-skeleton" />
                      </td>
                    </tr>
                  ))
                ) : transactions.length === 0 ? (
                  <tr>
                    <td className="transactions-empty" colSpan={activeTab === "all" ? 11 : activeTab === "items" ? 10 : 8}>
                      {emptyMessage}
                    </td>
                  </tr>
                ) : transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{transaction.id}</td>
                    <td>{transaction.date}</td>
                    {activeTab === "all" && (
                      <td>
                        <span className={`transaction-type-badge ${transaction.recordType === "service" ? "is-service" : "is-item"}`}>
                          {transaction.recordLabel}
                        </span>
                      </td>
                    )}
                    <td className={activeTab === "items" ? "transaction-reservation-cell" : undefined}>
                      <strong>{transaction.customer}</strong>
                      {activeTab === "items" && transaction.customerPhone && <small className="transaction-reservation-detail">{transaction.customerPhone}</small>}
                    </td>
                    <td className={activeTab === "items" ? "transaction-reservation-cell" : undefined}>
                      {activeTab === "items" && transaction.reservationItems.length
                        ? transaction.reservationItems.map((item) => (
                            <span className="transaction-reservation-item" key={item.productId || item.name}>
                              {item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />}
                              {item.name} × {item.qty} · {formatMoney(item.lineTotal)}
                            </span>
                          ))
                        : transaction.items}
                    </td>
                    {activeTab === "services" && <td>{transaction.mechanic}</td>}
                    <td className="price-text">
                      {formatMoney(transaction.amount)}
                    </td>
                    {activeTab !== "services" && (
                      <>
                        <td>{transaction.recordType === "service" ? "—" : formatMoney(transaction.paid)}</td>
                        <td>{transaction.recordType === "service" ? "—" : formatMoney(transaction.balance)}</td>
                      </>
                    )}
                    {activeTab === "items" && (
                      <td className="transaction-reservation-cell">
                        {transaction.paymentMethod && <strong>{transaction.paymentMethod}</strong>}
                        {transaction.paymentReference && <small className="transaction-reservation-detail">Ref {transaction.paymentReference}</small>}
                        {!transaction.paymentMethod && !transaction.paymentReference && "—"}
                      </td>
                    )}
                    <td>
                      <span className={`status-badge status-${transaction.status.toLowerCase().replaceAll(" ", "-")}`}>
                        {transaction.status}
                      </span>
                      {activeTab === "services" && transaction.isServiceRequest && (
                        <small className="transaction-reservation-detail">Payment: {transaction.paymentStatus}</small>
                      )}
                      {transaction.status === "Payment Submitted" && <small className="transaction-needs-review">Needs review</small>}
                      {activeTab === "items" && transaction.reservedUntil && <small className="transaction-reservation-detail">Hold until {new Date(transaction.reservedUntil).toLocaleString("en-PH")}</small>}
                      {activeTab === "items" && transaction.rejectionReason && <small className="transaction-reservation-detail">Last rejection: {transaction.rejectionReason}</small>}
                      {transaction.refundDecision && <small className="transaction-reservation-detail">Refund decision: {transaction.refundDecision}</small>}
                    </td>
                    {activeTab === "all" && <td>{transaction.mechanic}</td>}
                    <td className="transaction-actions">
                      {transaction.isServiceRequest && ["pending", "assigned", "confirmed", "accepted", "in-progress"].includes(transaction.bookingStatus) ? (
                        <>
                          {transaction.paymentStatus === "Payment Submitted" && (
                            <button className="btn-small btn-edit" type="button" onClick={() => beginReservationAction(transaction, "review")}>Review payment</button>
                          )}
                          {transaction.paymentStatus === "Payment Pending" && (
                            <button className="btn-small btn-edit" type="button" disabled={markingPaidAtShopId === transaction._id} onClick={() => markServicePaidAtShop(transaction)}>{markingPaidAtShopId === transaction._id ? "Saving..." : "Mark paid at shop"}</button>
                          )}
                          <button className="btn-small btn-delete" type="button" onClick={() => beginReservationAction(transaction, "cancel-service")}>Cancel booking</button>
                          {["assigned", "confirmed"].includes(transaction.bookingStatus) && (
                            <button className="btn-small btn-delete" type="button" onClick={() => beginReservationAction(transaction, "decline-service")}>Decline</button>
                          )}
                        </>
                      ) : transaction.isServiceRequest && transaction.status === "Payment Submitted" ? (
                        <button className="btn-small btn-edit" type="button" onClick={() => beginReservationAction(transaction, "review")}>Review payment</button>
                      ) : transaction.isReservation && transaction.status === "Payment Submitted" ? (
                        <>
                          <button className="btn-small btn-edit" type="button" onClick={() => beginReservationAction(transaction, "review")}>Review payment</button>
                          <button className="btn-small btn-delete" type="button" onClick={() => beginReservationAction(transaction, "cancel")}>Cancel</button>
                        </>
                      ) : transaction.isReservation && transaction.status === "Reserved" ? (
                        <>
                          <button className="btn-small btn-edit" type="button" onClick={() => beginReservationAction(transaction, "complete")}>Complete pickup</button>
                          <button className="btn-small btn-delete" type="button" onClick={() => beginReservationAction(transaction, "cancel")}>Cancel</button>
                        </>
                      ) : transaction.isReservation && transaction.status === "Pending Down Payment" ? (
                        <button className="btn-small btn-delete" type="button" onClick={() => beginReservationAction(transaction, "cancel")}>Cancel</button>
                      ) : transaction.isReservation && transaction.status === "Expired" ? (
                        <>
                          {transaction.amountPaid > 0 && !transaction.refundDecision && <button className="btn-small btn-edit" type="button" onClick={() => beginReservationAction(transaction, "refund")}>Record refund decision</button>}
                          <button className="btn-small btn-delete" type="button" onClick={() => beginReservationAction(transaction, "cancel")}>Close expired reservation</button>
                        </>
                      ) : (
                        <button className="btn-small btn-edit" type="button" onClick={() => viewTransaction(transaction)}>View</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div
            className="pagination-container"
            aria-label="Transaction pagination"
          >
            <button
              className={`pagination-button${page === 1 ? " disabled" : ""}`}
              type="button"
              disabled={page === 1}
              onClick={() => setPage((currentPage) => currentPage - 1)}
            >
              Previous
            </button>
            <span className="pagination-page">
              Page {page} of {totalPages}
            </span>
            <button
              className={`pagination-button${page >= totalPages ? " disabled" : ""}`}
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((currentPage) => currentPage + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
      {settingsOpen && (
        <AdminDialog title="Reservation settings" onClose={() => setSettingsOpen(false)}>
          <form className="admin-dialog-form reservation-settings-form" onSubmit={saveSettings}>
            {settingsError && <p className="admin-dialog-error" role="alert">{settingsError}</p>}
            <label>
              Down payment percent
              <input type="number" min="10" max="100" step="1" required value={settings.downPaymentPercent} onChange={(event) => setSettings({ ...settings, downPaymentPercent: Number(event.target.value) })} />
            </label>
            <label>
              Payment deadline (hours)
              <input type="number" min="1" max="720" step="1" required value={settings.pendingPaymentHours} onChange={(event) => setSettings({ ...settings, pendingPaymentHours: Number(event.target.value) })} />
            </label>
            <label>
              Pickup hold (days)
              <input type="number" min="1" max="30" step="1" required value={settings.holdDays} onChange={(event) => setSettings({ ...settings, holdDays: Number(event.target.value) })} />
            </label>
            <label>
              Payment method name
              <input maxLength="120" value={settings.paymentInstructions.methodName} onChange={(event) => updatePaymentInstruction("methodName", event.target.value)} />
            </label>
            <label>
              Account name
              <input maxLength="120" value={settings.paymentInstructions.accountName} onChange={(event) => updatePaymentInstruction("accountName", event.target.value)} />
            </label>
            <label>
              Account number
              <input maxLength="120" value={settings.paymentInstructions.accountNumber} onChange={(event) => updatePaymentInstruction("accountNumber", event.target.value)} />
            </label>
            <label>
              GCash QR code
              <input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" disabled={isUploadingQr} onChange={uploadGcashQr} />
              {isUploadingQr && <small>Uploading QR image...</small>}
              {settings.paymentInstructions.qrImageUrl && <img className="reservation-gcash-qr-preview" src={settings.paymentInstructions.qrImageUrl} alt="Configured GCash QR code" />}
            </label>
            <label>
              Pickup address
              <textarea maxLength="500" value={settings.pickupAddress} onChange={(event) => setSettings({ ...settings, pickupAddress: event.target.value })} />
            </label>
            <label>
              Pickup hours
              <input maxLength="200" value={settings.pickupHours} onChange={(event) => setSettings({ ...settings, pickupHours: event.target.value })} />
            </label>
            <div className="admin-dialog-actions">
              <button className="btn-small" type="button" onClick={() => setSettingsOpen(false)}>Cancel</button>
              <button className="btn-primary" type="submit" disabled={isSavingSettings}>{isSavingSettings ? "Saving..." : "Save"}</button>
            </div>
          </form>
        </AdminDialog>
      )}
      {reservationAction && (
        <AdminDialog
          title={reservationAction.action === "review" ? "Review payment" : reservationAction.action === "complete" ? "Complete pickup" : reservationAction.action === "refund" ? "Record refund decision" : reservationAction.action === "cancel-service" ? "Cancel service booking" : reservationAction.action === "decline-service" ? "Decline service booking" : "Cancel reservation"}
          onClose={() => {
            if (!isPerformingReservationAction) {
              setReservationAction(null);
              setReservationActionError("");
            }
          }}
        >
          <form className="admin-dialog-form reservation-transaction-action" onSubmit={(event) => performReservationAction(event, rejectingPayment ? "reject" : undefined)}>
            {reservationActionError && <p className="admin-dialog-error" role="alert">{reservationActionError}</p>}
            <p><strong>Customer:</strong> {reservationAction.transaction.customer}</p>
            <p><strong>{reservationAction.transaction.isServiceRequest ? "Booking" : "Reservation"}:</strong> {reservationAction.transaction.code || reservationAction.transaction.id}</p>
            <p><strong>{reservationAction.transaction.isServiceRequest ? "Service:" : "Items:"}</strong> {reservationAction.transaction.items}</p>
            {reservationAction.action === "review" && (
              <>
                <p><strong>Date and time:</strong> {reservationAction.transaction.isServiceRequest
                  ? `${reservationAction.transaction.date}${reservationAction.transaction.startTime ? ` · ${reservationAction.transaction.startTime} - ${reservationAction.transaction.endTime}` : ""}`
                  : reservationAction.transaction.date}</p>
                <p><strong>Amount due:</strong> {formatMoney(reservationAction.transaction.downPaymentAmount || reservationAction.transaction.amount)}</p>
                <p><strong>Reference number:</strong> {reservationAction.transaction.paymentReference || "Not provided"}</p>
                {reservationAction.transaction.isServiceRequest && (
                  <>
                    <p><strong>Payment status:</strong> {reservationAction.transaction.paymentStatus}</p>
                    {reservationAction.transaction.refundDecision && (
                      <p><strong>Refund decision:</strong> {reservationAction.transaction.refundDecision}</p>
                    )}
                  </>
                )}
                {(reservationAction.transaction.paymentSubmissions || []).map((submission, index) => submission.receiptUrl && (
                  <div key={`${submission.paymentProofPublicId || submission.receiptUrl || "receipt"}-${index}`}>
                    <strong>Receipt {index + 1} · {submission.status}{submission.rejectionReason ? ` · ${submission.rejectionReason}` : ""}:</strong>
                    <a href={submission.receiptUrl} target="_blank" rel="noreferrer">
                      <img className="reservation-payment-proof" src={submission.receiptUrl} alt={`Customer payment receipt ${index + 1}`} />
                    </a>
                  </div>
                ))}
                {rejectingPayment ? (
                  <>
                    <label>
                      Rejection reason
                      <textarea minLength="3" maxLength="300" required value={actionReason} onChange={(event) => setActionReason(event.target.value)} />
                    </label>
                    <div className="admin-dialog-actions">
                      <button className="btn-small" type="button" onClick={() => setRejectingPayment(false)}>Back</button>
                      <button className="btn-small btn-delete" type="submit" disabled={isPerformingReservationAction}>{isPerformingReservationAction ? "Rejecting..." : "Reject payment"}</button>
                    </div>
                  </>
                ) : (
                  <div className="admin-dialog-actions">
                    <button className="btn-small btn-delete" type="button" onClick={() => setRejectingPayment(true)}>Reject</button>
                    <button className="btn-primary" type="button" disabled={isPerformingReservationAction} onClick={(event) => performReservationAction(event, "confirm")}>
                      {isPerformingReservationAction ? "Confirming..." : "Confirm payment"}
                    </button>
                  </div>
                )}
              </>
            )}
            {reservationAction.action === "complete" && (
              <>
                <p><strong>Balance due:</strong> {formatMoney(reservationAction.transaction.balance)}</p>
                <label className="reservation-balance-confirm">
                  <input type="checkbox" checked={balanceReceived} onChange={(event) => setBalanceReceived(event.target.checked)} />
                  Balance received
                </label>
                <div className="admin-dialog-actions">
                  <button className="btn-small" type="button" onClick={() => setReservationAction(null)}>Cancel</button>
                  <button className="btn-primary" type="submit" disabled={!balanceReceived || isPerformingReservationAction}>{isPerformingReservationAction ? "Completing..." : "Complete"}</button>
                </div>
              </>
            )}
            {reservationAction.action === "refund" && (
              <>
                <p>Choose how the submitted down payment was resolved.</p>
                <fieldset className="reservation-refund-choice">
                  <legend>Down payment decision</legend>
                  <label><input type="radio" name="refund-decision" value="refunded" checked={refundDecision === "refunded"} onChange={(event) => setRefundDecision(event.target.value)} /> Refund</label>
                  <label><input type="radio" name="refund-decision" value="forfeited" checked={refundDecision === "forfeited"} onChange={(event) => setRefundDecision(event.target.value)} /> Forfeit</label>
                </fieldset>
                <div className="admin-dialog-actions">
                  <button className="btn-small" type="button" onClick={() => setReservationAction(null)}>Cancel</button>
                  <button className="btn-primary" type="submit" disabled={!refundDecision || isPerformingReservationAction}>{isPerformingReservationAction ? "Saving..." : "Save decision"}</button>
                </div>
              </>
            )}
            {reservationAction.action === "cancel" && (
              <>
                <label>
                  Cancellation reason
                  <textarea minLength="3" maxLength="300" required value={actionReason} onChange={(event) => setActionReason(event.target.value)} />
                </label>
                {reservationAction.transaction.amountPaid > 0 && (reservationAction.transaction.status === "Reserved" || !reservationAction.transaction.refundDecision) && (
                  <fieldset className="reservation-refund-choice">
                    <legend>Down payment decision</legend>
                    <label><input type="radio" name="refund-decision" value="refunded" checked={refundDecision === "refunded"} onChange={(event) => setRefundDecision(event.target.value)} /> Refund</label>
                    <label><input type="radio" name="refund-decision" value="forfeited" checked={refundDecision === "forfeited"} onChange={(event) => setRefundDecision(event.target.value)} /> Forfeit</label>
                  </fieldset>
                )}
                <div className="admin-dialog-actions">
                  <button className="btn-small" type="button" onClick={() => setReservationAction(null)}>Keep reservation</button>
                  <button className="btn-small btn-delete" type="submit" disabled={isPerformingReservationAction || (reservationAction.transaction.amountPaid > 0 && (reservationAction.transaction.status === "Reserved" || !reservationAction.transaction.refundDecision) && !refundDecision)}>{isPerformingReservationAction ? "Cancelling..." : "Cancel reservation"}</button>
                </div>
              </>
            )}
            {["cancel-service", "decline-service"].includes(reservationAction.action) && (
              <>
                <p><strong>Payment status:</strong> {reservationAction.transaction.paymentStatus}</p>
                {reservationAction.transaction.refundDecision && (
                  <p><strong>Recorded refund decision:</strong> {reservationAction.transaction.refundDecision}</p>
                )}
                {reservationAction.transaction.bookingStatus === "in-progress" && reservationAction.action === "cancel-service" && (
                  <label>
                    Cancellation reason
                    <textarea minLength="3" maxLength="300" required value={actionReason} onChange={(event) => setActionReason(event.target.value)} />
                  </label>
                )}
                {["Confirmed", "Paid at shop"].includes(reservationAction.transaction.paymentStatus) && (
                  <fieldset className="reservation-refund-choice">
                    <legend>Service payment decision</legend>
                    <label><input type="radio" name="service-refund-decision" value="refunded" checked={refundDecision === "refunded"} onChange={(event) => setRefundDecision(event.target.value)} /> Refund</label>
                    <label><input type="radio" name="service-refund-decision" value="forfeited" checked={refundDecision === "forfeited"} onChange={(event) => setRefundDecision(event.target.value)} /> Forfeit</label>
                  </fieldset>
                )}
                <div className="admin-dialog-actions">
                  <button className="btn-small" type="button" onClick={() => setReservationAction(null)}>Keep booking</button>
                  <button
                    className="btn-small btn-delete"
                    type="submit"
                    disabled={isPerformingReservationAction
                      || (["Confirmed", "Paid at shop"].includes(reservationAction.transaction.paymentStatus) && !refundDecision)
                      || (reservationAction.transaction.bookingStatus === "in-progress" && reservationAction.action === "cancel-service" && actionReason.trim().length < 3)}
                  >
                    {isPerformingReservationAction ? "Saving..." : "Confirm"}
                  </button>
                </div>
              </>
            )}
          </form>
        </AdminDialog>
      )}
      {selectedTransaction && (
        <AdminDialog
          title="Transaction Details"
          onClose={() => setSelectedTransaction(null)}
        >
          <div className="transaction-details">
            <p>
              <strong>Record ID:</strong>{" "}
              {selectedTransaction._id || selectedTransaction.id}
            </p>
            <p>
              <strong>Date:</strong>{" "}
              {new Date(
                selectedTransaction.completedAt ||
                  selectedTransaction.createdAt,
              ).toLocaleString("en-PH")}
            </p>
            <p>
              <strong>Customer:</strong>{" "}
              {selectedTransaction.userId?.name ||
                selectedTransaction.customer ||
                "Unknown"}
            </p>
            {selectedTransaction.recordType === "service" || selectedTransaction.code ? (
              <p>
                <strong>Status:</strong>{" "}
                {selectedTransaction.status || "completed"}
              </p>
            ) : (
              <label>
                <strong>Status:</strong>
                <select
                  value={selectedTransaction.status || "pending"}
                  disabled={statusBeingSaved}
                  onChange={(event) =>
                    updateTransactionStatus(event.target.value)
                  }
                >
                  <option value="completed">Completed</option>
                  <option value="pending">Pending</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="Paid">Legacy Paid</option>
                </select>
              </label>
            )}
            <p>
              <strong>Total:</strong> ₱
              {Number(
                selectedTransaction.amount ??
                  selectedTransaction.totalPrice ??
                  selectedTransaction.totalAmount ??
                  0,
              ).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
            </p>
            <p>
              <strong>Items:</strong>{" "}
              {Array.isArray(selectedTransaction.items)
                ? selectedTransaction.items
                    .map(
                      (item) =>
                        item.name ||
                        item.productName ||
                        item.productId?.name ||
                        "Item",
                    )
                    .join(", ")
                : selectedTransaction.itemName ||
                  selectedTransaction.items ||
                  "N/A"}
            </p>
          </div>
        </AdminDialog>
      )}
    </AdminPageFrame>
  );
}

export default Transactions;
