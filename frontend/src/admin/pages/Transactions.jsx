import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { adminApi as api } from "../services/adminApi";
import { formatServiceName, serviceUnitSummary } from "../../utils/servicePricing";
import ServicePriceBreakdown from "../../components/ServicePriceBreakdown";
import { getServicePaymentSummary, getServiceBookingStatus } from "../../utils/servicePayment";
import { AdminDialog, AdminPageFrame } from "./ManagementPageComponents";
import TransactionsPageActions from "./TransactionsPageActions";
import { getItemsPageData, getItemsRequest, itemFilterOptions } from "./itemsTransactionView";
import TransactionCards from "./TransactionCards";
import { formatTransactionMoney as formatMoney } from "./transactionCardData";
import { getPartsSourceExportValue, getPartsSourceQuery, SERVICE_TRANSACTION_EXPORT_HEADERS } from "./transactionPartsSource";

const reservationItemName = (item) => item.variantLabel && !String(item.name || "").includes(item.variantLabel)
  ? `${item.name || item.productName || "Product"} - ${item.variantLabel}`
  : item.name || item.productName || "Product";

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
      ? record.items.map((item) => `${reservationItemName(item)} × ${item.qty}`).join(", ")
      : record.itemName || "N/A",
    reservationItems: record.isReservation && Array.isArray(record.items)
      ? record.items.map((item) => ({ ...item, displayName: reservationItemName(item) }))
      : [],
    amount: Number(record.amount || 0),
    status: record.status || "completed",
    partsSource: record.recordType === "service" ? (record.partsSource === "customer" ? "customer" : "shop") : null,
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
  serviceDownPaymentPercent: 30,
  pendingPaymentHours: 24,
  holdDays: 3,
  paymentInstructions: { methodName: "", accountName: "", accountNumber: "", qrImageUrl: "", qrImagePublicId: "" },
  pickupAddress: "",
  pickupHours: "",
  contactNumber: "",
};

const defaultGcashSettings = {
  gcashQrUrl: "",
  gcashQrPublicId: "",
  gcashAccountName: "",
  gcashAccountNumber: "",
  paymentInstructions: "",
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
    items: (reservation.items || []).map((item) => `${reservationItemName(item)} × ${item.qty}`).join(", ") || "N/A",
    reservationItems: (reservation.items || []).map((item) => ({ ...item, displayName: reservationItemName(item) })),
    amount: Number(reservation.total || 0),
    paid: Number(reservation.amountPaid || 0),
    balance: Number(reservation.balanceDue || 0),
    mechanic: "N/A",
  };
}

function formatServiceRequestRecord(request) {
  const customer = request.user || {};
  const customerName = `${customer.firstName || ""} ${customer.lastName || ""}`.trim();
  const paymentSummary = getServicePaymentSummary(request);
  const status = getServiceBookingStatus(request);
  return {
    ...request,
    id: request.code || request._id,
    isServiceRequest: true,
    recordType: "service",
    recordLabel: "Service",
    partsSource: request.partsSource === "customer" ? "customer" : "shop",
    customer: customer.isDeleted ? "Deleted customer" : customerName || customer.email || "Unknown",
    date: request.scheduledDate
      ? new Date(request.scheduledDate).toLocaleDateString("en-PH")
      : new Date(request.createdAt).toLocaleDateString("en-PH"),
    items: formatServiceName(request.serviceType || "Service booking", request.units, request.unitLabel),
    amount: paymentSummary.totalAmount,
    totalAmount: paymentSummary.totalAmount,
    paid: paymentSummary.amountPaid,
    balance: Math.max(0, paymentSummary.totalAmount - paymentSummary.amountPaid),
    downPaymentAmount: paymentSummary.downPaymentAmount,
    downPaymentPercent: paymentSummary.downPaymentPercent,
    amountPaid: paymentSummary.amountPaid,
    status,
    bookingStatus: request.status || "pending",
    mechanic: request.mechanic?.firstName
      ? `${request.mechanic.firstName} ${request.mechanic.lastName || ""}`.trim()
      : "Unassigned",
    paymentStatus: request.paymentStatus || "Payment Pending",
    refundDecision: request.refundDecision || null,
    paymentReference: request.paymentReference || "",
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
  const [partsSourceFilter, setPartsSourceFilter] = useState("All");
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
  const [settingsFieldErrors, setSettingsFieldErrors] = useState({});
  const [settingsToast, setSettingsToast] = useState("");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [gcashSettings, setGcashSettings] = useState(defaultGcashSettings);
  const [gcashQrFile, setGcashQrFile] = useState(null);
  const [gcashQrPreview, setGcashQrPreview] = useState("");
  const [gcashError, setGcashError] = useState("");
  const [gcashToast, setGcashToast] = useState("");
  const [isSavingGcash, setIsSavingGcash] = useState(false);
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

  useEffect(() => () => {
    if (gcashQrPreview.startsWith("blob:")) URL.revokeObjectURL(gcashQrPreview);
  }, [gcashQrPreview]);

  useEffect(() => {
    let isMounted = true;

    const loadTransactions = async ({ background = false } = {}) => {
      if (!background) setIsLoading(true);
      try {
        if (activeTab === "items") {
          const [response, requestResponse] = await Promise.all([
            api.getTransactions(getItemsRequest({
              page,
              limit: 10,
              statusFilter,
              search
            })),
            api.getAdminServiceRequests({
              page: 1,
              limit: 10,
              activeOnly: true,
              search: search.trim(),
              status: statusFilter === "All" ? "" : statusFilter,
            })
          ]);
          if (!isMounted) return;
          const { rows, totalRecords, totalAmount: amount, totalPages: pages } = getItemsPageData(response, formatBusinessRecord);
          setTransactions(rows);
          setError("");
          setRecordCount(totalRecords);
          const serviceCount = Number(response.counts?.services || 0)
            + Number(requestResponse.pagination?.totalRecords || requestResponse.requests?.length || 0);
          setCounts({
            all: totalRecords + serviceCount,
            items: totalRecords,
            services: serviceCount,
            paymentSubmitted: Number(response.counts?.paymentSubmitted || 0) + Number(requestResponse.paymentSubmittedCount || 0)
          });
          setPaymentSubmittedCount(Number(response.counts?.paymentSubmitted || 0) + Number(requestResponse.paymentSubmittedCount || 0));
          setTotalAmount(amount);
          setTotalPages(pages);
          if (page > pages) setPage(pages);
        } else if (activeTab === "services") {
          const candidateLimit = page * 10;
          const partsSource = getPartsSourceQuery(partsSourceFilter);
          const [response, requestResponse] = await Promise.all([
            api.getTransactions({
              page: 1,
              limit: candidateLimit,
              type: "service",
              search: search.trim(),
              status: statusFilter === "All" ? "" : statusFilter,
              partsSource,
            }),
            api.getAdminServiceRequests({
              page: 1,
              limit: candidateLimit,
              activeOnly: true,
              search: search.trim(),
              status: statusFilter === "All" ? "" : statusFilter,
              partsSource,
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
          setTotalAmount(Number(response.totalAmount || 0) + Number(requestResponse.totalAmount || 0));
          setPaymentSubmittedCount(Number(requestResponse.paymentSubmittedCount ?? submittedPaymentCount));
          const itemCount = Number(response.counts?.items || 0);
          setCounts({
            all: itemCount + totalRecords,
            items: itemCount,
            services: totalRecords,
            paymentSubmitted: Number(response.counts?.paymentSubmitted || 0) + Number(requestResponse.paymentSubmittedCount || 0)
          });
          setTotalPages(Math.max(1, Math.ceil(totalRecords / 10)));
          if (page > Math.max(1, Math.ceil(totalRecords / 10))) setPage(Math.max(1, Math.ceil(totalRecords / 10)));
        } else {
          const candidateLimit = page * 10;
          const [response, requestResponse] = await Promise.all([
            api.getTransactions({
            page: 1,
            limit: candidateLimit,
            type: activeTab === "services" ? "service" : "",
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
          const completedRecords = (response.data || []).map(formatBusinessRecord);
          const activeServiceRequests = (requestResponse.requests || []).map(formatServiceRequestRecord);
          const combined = [...activeServiceRequests, ...completedRecords].sort((left, right) => {
            const leftNeedsReview = left.status === "Payment Submitted" ? 0 : 1;
            const rightNeedsReview = right.status === "Payment Submitted" ? 0 : 1;
            return leftNeedsReview - rightNeedsReview
              || new Date(right.completedAt || right.createdAt || 0) - new Date(left.completedAt || left.createdAt || 0);
          });
          const totalItems = Number(response.counts?.items || 0);
          const totalServices = Number(response.counts?.services || 0) + Number(requestResponse.pagination?.totalRecords || activeServiceRequests.length);
          const pages = Math.max(1, Math.ceil((totalItems + totalServices) / 10));
          setTransactions(combined.slice((page - 1) * 10, page * 10));
          setError("");
          setTotalAmount(Number(response.totalAmount || 0) + Number(requestResponse.totalAmount || 0));
          setRecordCount(totalItems + totalServices);
          setCounts({
            all: totalItems + totalServices,
            items: totalItems,
            services: totalServices,
            paymentSubmitted: Number(response.counts?.paymentSubmitted || 0) + Number(requestResponse.paymentSubmittedCount || 0)
          });
          if (!search.trim() && statusFilter === "All") {
            setPaymentSubmittedCount(Number(response.counts?.paymentSubmitted || 0) + Number(requestResponse.paymentSubmittedCount || 0));
          }
          setTotalPages(pages);
          if (page > pages) setPage(pages);
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
  }, [activeTab, page, partsSourceFilter, refreshKey, search, statusFilter]);

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
    ? itemFilterOptions
    : activeTab === "services"
      ? transactionStatuses
      : [...reservationStatuses, ...transactionStatuses.filter((status) => !reservationStatuses.includes(status))];
  const changeTab = (tab) => {
    setPage(1);
    setStatusFilter("All");
    setPartsSourceFilter("All");
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
    ? "No item transactions match these filters."
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

  const renderTransactionActions = (transaction, includeView = true) => {
    if (transaction.isServiceRequest && ["pending", "assigned", "confirmed", "accepted", "in-progress"].includes(transaction.bookingStatus)) {
      return <>
        {transaction.paymentStatus === "Payment Submitted" && (
          <button className="btn-small btn-edit" type="button" onClick={() => beginReservationAction(transaction, "review")}>Review payment</button>
        )}
        {["Payment Pending", "Confirmed"].includes(transaction.paymentStatus) && transaction.balance > 0 && (
          <button className="btn-small btn-edit" type="button" disabled={markingPaidAtShopId === transaction._id} onClick={() => markServicePaidAtShop(transaction)}>{markingPaidAtShopId === transaction._id ? "Saving..." : transaction.paid > 0 ? "Mark balance paid at shop" : "Mark paid at shop"}</button>
        )}
        <button className="btn-small btn-delete" type="button" onClick={() => beginReservationAction(transaction, "cancel-service")}>Cancel booking</button>
        {["assigned", "confirmed"].includes(transaction.bookingStatus) && (
          <button className="btn-small btn-delete" type="button" onClick={() => beginReservationAction(transaction, "decline-service")}>Decline</button>
        )}
      </>;
    }
    if (transaction.isServiceRequest && transaction.status === "Payment Submitted") {
      return <button className="btn-small btn-edit" type="button" onClick={() => beginReservationAction(transaction, "review")}>Review payment</button>;
    }
    if (transaction.isReservation && transaction.status === "Payment Submitted") {
      return <>
        <button className="btn-small btn-edit" type="button" onClick={() => beginReservationAction(transaction, "review")}>Review payment</button>
        <button className="btn-small btn-delete" type="button" onClick={() => beginReservationAction(transaction, "cancel")}>Cancel</button>
      </>;
    }
    if (transaction.isReservation && transaction.status === "Reserved") {
      return <>
        <button className="btn-small btn-edit" type="button" onClick={() => beginReservationAction(transaction, "complete")}>Complete pickup</button>
        <button className="btn-small btn-delete" type="button" onClick={() => beginReservationAction(transaction, "cancel")}>Cancel</button>
      </>;
    }
    if (transaction.isReservation && transaction.status === "Pending Down Payment") {
      return <button className="btn-small btn-delete" type="button" onClick={() => beginReservationAction(transaction, "cancel")}>Cancel</button>;
    }
    if (transaction.isReservation && transaction.status === "Expired") {
      return <>
        {transaction.amountPaid > 0 && !transaction.refundDecision && <button className="btn-small btn-edit" type="button" onClick={() => beginReservationAction(transaction, "refund")}>Record refund decision</button>}
        <button className="btn-small btn-delete" type="button" onClick={() => beginReservationAction(transaction, "cancel")}>Close expired reservation</button>
      </>;
    }
    return includeView
      ? <button className="btn-small btn-edit" type="button" onClick={() => viewTransaction(transaction)}>View</button>
      : null;
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
    setSettingsFieldErrors({});
    setGcashError("");
    setGcashToast("");
    setSettingsOpen(true);
    try {
      const [response, paymentResponse] = await Promise.all([
        api.getReservationSettings(),
        api.getPaymentSettings(),
      ]);
      setSettings({
        ...defaultReservationSettings,
        ...response.settings,
        serviceDownPaymentPercent: response.settings?.serviceDownPaymentPercent ?? response.settings?.downPaymentPercent ?? defaultReservationSettings.serviceDownPaymentPercent,
        paymentInstructions: {
          ...defaultReservationSettings.paymentInstructions,
          ...response.settings?.paymentInstructions,
        },
      });
      setGcashSettings({ ...defaultGcashSettings, ...paymentResponse.settings });
      setGcashQrFile(null);
      setGcashQrPreview(paymentResponse.settings?.gcashQrUrl || "");
    } catch (settingsLoadError) {
      setSettingsError(settingsLoadError.message || "Reservation settings could not be loaded.");
    }
  };

  const selectGcashQr = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setGcashError("Choose a PNG, JPG or WEBP QR image no larger than 2 MB.");
      return;
    }
    setGcashError("");
    setGcashToast("");
    if (gcashQrPreview.startsWith("blob:")) URL.revokeObjectURL(gcashQrPreview);
    setGcashQrFile(file);
    setGcashQrPreview(URL.createObjectURL(file));
  };

  const saveGcashSettings = async () => {
    setGcashError("");
    setGcashToast("");
    const accountName = gcashSettings.gcashAccountName.trim();
    const accountNumber = gcashSettings.gcashAccountNumber.trim();
    const normalizedNumber = accountNumber.replace(/[ +]/g, "");
    if (accountName.length < 2 || accountName.length > 80) {
      setGcashError("Account name must be 2 to 80 characters.");
      return;
    }
    if (!/^\+?[\d ]+$/.test(accountNumber) || !/^\d{10,13}$/.test(normalizedNumber)) {
      setGcashError("Account number must contain 10 to 13 digits, with optional spaces or a leading +.");
      return;
    }
    if (/<[^>]*>/.test(accountName) || /<[^>]*>/.test(gcashSettings.paymentInstructions)) {
      setGcashError("Payment text must not contain HTML tags.");
      return;
    }
    if (gcashSettings.paymentInstructions.trim().length > 300) {
      setGcashError("Payment instructions must be 300 characters or fewer.");
      return;
    }

    setIsSavingGcash(true);
    try {
      const response = await api.updatePaymentSettings({
        ...gcashSettings,
        gcashAccountName: accountName,
        gcashAccountNumber: accountNumber,
        paymentInstructions: gcashSettings.paymentInstructions.trim(),
      }, gcashQrFile);
      setGcashSettings({ ...defaultGcashSettings, ...response.settings });
      setGcashQrFile(null);
      if (gcashQrPreview.startsWith("blob:")) URL.revokeObjectURL(gcashQrPreview);
      setGcashQrPreview(response.settings?.gcashQrUrl || "");
      setSettings((current) => ({
        ...current,
        paymentInstructions: {
          ...current.paymentInstructions,
          methodName: current.paymentInstructions.methodName || "GCash",
          accountName: response.settings.gcashAccountName,
          accountNumber: response.settings.gcashAccountNumber,
          qrImageUrl: response.settings.gcashQrUrl,
        },
      }));
      setGcashToast("GCash payment settings saved.");
    } catch (saveError) {
      setGcashError(saveError.message || "GCash payment settings could not be saved.");
    } finally {
      setIsSavingGcash(false);
    }
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    setSettingsError("");
    setSettingsFieldErrors({});
    setIsSavingSettings(true);
    try {
      const response = await api.updateReservationSettings(settings);
      setSettings({
        ...defaultReservationSettings,
        ...response.settings,
        serviceDownPaymentPercent: response.settings?.serviceDownPaymentPercent ?? response.settings?.downPaymentPercent ?? defaultReservationSettings.serviceDownPaymentPercent,
        paymentInstructions: {
          ...defaultReservationSettings.paymentInstructions,
          ...response.settings?.paymentInstructions,
        },
      });
      setSettingsOpen(false);
      setSettingsToast("Reservation settings saved.");
    } catch (settingsSaveError) {
      setSettingsError(settingsSaveError.message || "Reservation settings could not be saved.");
      setSettingsFieldErrors(settingsSaveError.fieldErrors || {});
    } finally {
      setIsSavingSettings(false);
    }
  };

  const updateReservationSetting = (field, value) => {
    setSettings((current) => ({ ...current, [field]: value }));
    setSettingsFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const exportTransactions = async () => {
    setIsExporting(true);
    setError("");
    try {
      let allRows;
      if (activeTab === "items") {
        const firstPage = await api.getTransactions(getItemsRequest({
          page: 1,
          limit: 100,
          statusFilter,
          search
        }));
        allRows = [...(firstPage.data || [])];
        const pages = Number(firstPage.pagination?.totalPages || 1);
        for (let nextPage = 2; nextPage <= pages; nextPage += 1) {
          const response = await api.getTransactions(getItemsRequest({
            page: nextPage,
            limit: 100,
            statusFilter,
            search
          }));
          allRows.push(...(response.data || []));
        }
      } else {
        const type = activeTab === "services" ? "service" : "";
        const partsSource = activeTab === "services" ? getPartsSourceQuery(partsSourceFilter) : "";
        const firstPage = await api.getTransactions({
          page: 1,
          limit: 100,
          type,
          search: search.trim(),
          status: statusFilter === "All" ? "" : statusFilter,
          partsSource,
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
            partsSource,
          });
          allRows.push(...(response.data || []));
        }
        if (activeTab !== "items") {
          const firstRequests = await api.getAdminServiceRequests({
            page: 1,
            limit: 100,
            activeOnly: true,
            search: search.trim(),
            status: statusFilter === "All" ? "" : statusFilter,
            partsSource
          });
          allRows.push(...(firstRequests.requests || []).map(formatServiceRequestRecord));
          const requestPages = Number(firstRequests.pagination?.totalPages || 1);
          for (let nextPage = 2; nextPage <= requestPages; nextPage += 1) {
            const response = await api.getAdminServiceRequests({
              page: nextPage,
              limit: 100,
              activeOnly: true,
              search: search.trim(),
              status: statusFilter === "All" ? "" : statusFilter,
              partsSource
            });
            allRows.push(...(response.requests || []).map(formatServiceRequestRecord));
          }
        }
      }
      const headers = activeTab === "services"
        ? SERVICE_TRANSACTION_EXPORT_HEADERS
        : activeTab === "items"
          ? ["Record/Reservation ID", "Date", "Customer", "Item(s)", "Total", "Paid", "Balance", "Payment reference", "Status"]
          : ["Record ID", "Date", "Type", "Customer", "Item / Service", "Amount", "Paid", "Balance", "Status", "Mechanic", "Parts source"];
      const exportRows = allRows.map((row) => {
        const transaction = row.isServiceRequest ? row : formatBusinessRecord(row);
        if (activeTab === "services") {
          return [transaction.id, transaction.date, transaction.customer, transaction.items, getPartsSourceExportValue(transaction), transaction.mechanic, transaction.amount, transaction.paid, transaction.balance, transaction.status];
        }
        if (activeTab === "items") {
          return [transaction.code || transaction.id, transaction.date, transaction.customer, transaction.items, transaction.amount, transaction.paid, transaction.balance, transaction.paymentReference || "", transaction.status];
        }
        return [transaction.id, transaction.date, transaction.recordLabel, transaction.customer, transaction.items, transaction.amount, transaction.recordType === "product" ? transaction.paid : "", transaction.recordType === "product" ? transaction.balance : "", transaction.status, transaction.mechanic, getPartsSourceExportValue(transaction)];
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

  const selectedIsService = Boolean(selectedTransaction?.isServiceRequest || selectedTransaction?.recordType === "service");
  const selectedServicePrice = Number(selectedTransaction?.servicePriceTotal
    ?? (Number(selectedTransaction?.estimatedPrice ?? selectedTransaction?.amount ?? 0)
      - Number(selectedTransaction?.mechanicFeeTotal ?? selectedTransaction?.laborFee ?? 0)));
  const selectedMechanicFee = Number(selectedTransaction?.mechanicFeeTotal ?? selectedTransaction?.laborFee ?? 0);
  const selectedServiceTotal = Number(selectedTransaction?.estimatedPrice ?? selectedTransaction?.amount ?? 0);

  return (
    <AdminPageFrame>
      <section className="section-content active">
        <div className="transactions-container">
          {error && (
            <p className="dashboard-error" role="alert">
              {error}{" "}
              {activeTab === "services" && (
                <button type="button" onClick={() => setRefreshKey((key) => key + 1)}>
                  Retry
                </button>
              )}
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
            <TransactionsPageActions
              activeTab={activeTab}
              onOpenSettings={openSettings}
              onExport={exportTransactions}
              isExporting={isExporting}
            />
          </div>
          <div className="transactions-header">
            <div className="transactions-info">
              Total: ₱
              {Number(totalAmount).toLocaleString("en-PH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
              {" · "}
              {recordCount} records
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
              {statusOptions.map((status) => typeof status === "string"
                ? <option key={status} value={status}>{status}</option>
                : <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
            {activeTab === "services" && <select
              aria-label="Parts source"
              value={partsSourceFilter}
              onChange={(event) => {
                setPartsSourceFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="All">Parts: All</option>
              <option value="shop">With shop parts</option>
              <option value="customer">Own parts (labor only)</option>
            </select>}
          </div>
          <div id="transactions-panel" role="tabpanel" aria-labelledby={`transactions-tab-${activeTab}`}>
            <TransactionCards
              transactions={transactions}
              activeTab={activeTab}
              isLoading={isLoading}
              emptyMessage={emptyMessage}
              onView={viewTransaction}
              renderActions={(transaction) => renderTransactionActions(transaction, false)}
            />
            <div className="transactions-table-scroll">
            <table className="transactions-table">
              <thead>
                <tr>
                  <th className="transaction-col-id">{activeTab === "items" ? "RECORD / RESERVATION ID" : "RECORD ID"}</th>
                  <th className="transaction-col-date">DATE</th>
                  {activeTab === "all" && <th className="transaction-col-type">TYPE</th>}
                  <th className="transaction-col-customer">CUSTOMER</th>
                  <th className="transaction-col-items">{activeTab === "items" ? "ITEM(S)" : activeTab === "services" ? "SERVICE" : "ITEM / SERVICE"}</th>
                  {activeTab === "services" && <th className="transaction-col-mechanic">MECHANIC</th>}
                  <th className="transaction-col-total">{activeTab === "items" ? "TOTAL" : "AMOUNT"}</th>
                  <th className="transaction-col-paid">{activeTab === "services" ? "DOWN PAYMENT PAID" : "PAID"}</th>
                  <th className="transaction-col-balance">{activeTab === "services" ? "BALANCE TO COLLECT" : "BALANCE"}</th>
                  {activeTab === "items" && <th className="transaction-col-payment">PAYMENT</th>}
                  <th className="transaction-col-status">STATUS</th>
                  {activeTab === "all" && <th className="transaction-col-mechanic">MECHANIC</th>}
                  <th className="transaction-col-action">ACTION</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }, (_, index) => (
                    <tr className="transactions-skeleton-row" key={`skeleton-${index}`} aria-hidden="true">
                      <td colSpan={activeTab === "all" ? 11 : activeTab === "items" ? 10 : 10}>
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
                    <td className="transaction-col-id">{transaction.id}</td>
                    <td className="transaction-col-date">{transaction.date}</td>
                    {activeTab === "all" && (
                      <td className="transaction-col-type">
                        <span className={`transaction-type-badge ${transaction.recordType === "service" ? "is-service" : "is-item"}`}>
                          {transaction.recordLabel}
                        </span>
                      </td>
                    )}
                    <td className={`transaction-col-customer${activeTab === "items" ? " transaction-reservation-cell" : ""}`}>
                      <strong>{transaction.customer}</strong>
                      {activeTab === "items" && transaction.customerPhone && <small className="transaction-reservation-detail">{transaction.customerPhone}</small>}
                    </td>
                    <td className={`transaction-col-items${activeTab === "items" ? " transaction-reservation-cell" : ""}`}>
                      {activeTab === "items" && transaction.reservationItems.length
                        ? transaction.reservationItems.map((item) => (
                            <span className="transaction-reservation-item" key={item.variantId || item.productId || item.name}>
                              {item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />}
                              {item.displayName || reservationItemName(item)} × {item.qty} · {formatMoney(item.lineTotal)}
                            </span>
                          ))
                        : transaction.items}
                      {activeTab === "services" && transaction.isServiceRequest && transaction.pricePerUnit && (
                        <small className="transaction-reservation-detail">
                          {serviceUnitSummary(transaction.units || 1, transaction.unitLabel)} · {formatMoney(transaction.amount)} total
                        </small>
                      )}
                      {(transaction.isServiceRequest || transaction.recordType === "service") && transaction.partsSource === "customer" && <span className="transaction-parts-source-badge">Own parts</span>}
                    </td>
                    {activeTab === "services" && <td className="transaction-col-mechanic">{transaction.mechanic}</td>}
                    <td className="price-text transaction-col-total">
                      {activeTab === "services" && transaction.isServiceRequest ? null : formatMoney(transaction.amount)}
                      {activeTab === "services" && transaction.isServiceRequest && (
                        <ServicePriceBreakdown
                          servicePriceTotal={transaction.servicePriceTotal}
                          mechanicFeeTotal={transaction.mechanicFeeTotal}
                          estimatedPrice={transaction.estimatedPrice}
                        />
                      )}
                    </td>
                    <td className="transaction-col-paid">{activeTab === "all" && transaction.recordType === "service" ? "—" : formatMoney(transaction.paid)}</td>
                    <td className="transaction-col-balance">{activeTab === "all" && transaction.recordType === "service" ? "—" : formatMoney(transaction.balance)}</td>
                    {activeTab === "items" && (
                      <td className="transaction-col-payment transaction-reservation-cell">
                        {transaction.paymentMethod && <strong>{transaction.paymentMethod}</strong>}
                        {transaction.paymentReference && <small className="transaction-reservation-detail">Ref {transaction.paymentReference}</small>}
                        {!transaction.paymentMethod && !transaction.paymentReference && "—"}
                      </td>
                    )}
                    <td className="transaction-col-status">
                      <span className={`status-badge status-${transaction.status.toLowerCase().replaceAll(" ", "-")}`}>
                        {transaction.status}
                      </span>
                      {activeTab === "services" && transaction.isServiceRequest && (
                        <>
                          <small className="transaction-reservation-detail">Payment: {transaction.paymentStatus}</small>
                          {transaction.paymentReference && <small className="transaction-reservation-detail">Ref {transaction.paymentReference}</small>}
                        </>
                      )}
                      {transaction.status === "Payment Submitted" && <small className="transaction-needs-review">Needs review</small>}
                      {activeTab === "items" && transaction.reservedUntil && <small className="transaction-reservation-detail">Hold until {new Date(transaction.reservedUntil).toLocaleString("en-PH")}</small>}
                      {activeTab === "items" && transaction.rejectionReason && <small className="transaction-reservation-detail">Last rejection: {transaction.rejectionReason}</small>}
                      {transaction.refundDecision && <small className="transaction-reservation-detail">Refund decision: {transaction.refundDecision}</small>}
                    </td>
                    {activeTab === "all" && <td className="transaction-col-mechanic">{transaction.mechanic}</td>}
                    <td className="transaction-actions transaction-col-action">
                      {transaction.isServiceRequest && ["pending", "assigned", "confirmed", "accepted", "in-progress"].includes(transaction.bookingStatus) ? (
                        <>
                          {transaction.paymentStatus === "Payment Submitted" && (
                            <button className="btn-small btn-edit" type="button" onClick={() => beginReservationAction(transaction, "review")}>Review payment</button>
                          )}
                          {["Payment Pending", "Confirmed"].includes(transaction.paymentStatus) && transaction.balance > 0 && (
                            <button className="btn-small btn-edit" type="button" disabled={markingPaidAtShopId === transaction._id} onClick={() => markServicePaidAtShop(transaction)}>{markingPaidAtShopId === transaction._id ? "Saving..." : transaction.paid > 0 ? "Mark balance paid at shop" : "Mark paid at shop"}</button>
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
        <AdminDialog
          title="Payment & reservation settings"
          onClose={() => setSettingsOpen(false)}
          footer={<div className="admin-dialog-actions">
            <button className="btn-small" type="button" onClick={() => setSettingsOpen(false)}>Cancel</button>
            <button className="btn-primary admin-dialog-gcash-save-mobile" type="button" onClick={saveGcashSettings} disabled={isSavingGcash}>{isSavingGcash ? "Saving GCash settings..." : "Save GCash settings"}</button>
            <button className="btn-primary" type="submit" form="reservation-settings-form" disabled={isSavingSettings}>{isSavingSettings ? "Saving..." : "Save"}</button>
          </div>}
        >
          <form id="reservation-settings-form" className="admin-dialog-form reservation-settings-form" onSubmit={saveSettings}>
            {settingsError && <p className="admin-dialog-error" role="alert">{settingsError}</p>}
            <label>
              Down payment percent
              <input type="number" min="10" max="100" step="1" required aria-invalid={Boolean(settingsFieldErrors.downPaymentPercent)} value={settings.downPaymentPercent} onChange={(event) => updateReservationSetting("downPaymentPercent", Number(event.target.value))} />
              {settingsFieldErrors.downPaymentPercent && <small className="inventory-field-error" role="alert">{settingsFieldErrors.downPaymentPercent}</small>}
            </label>
            <label>
              Service down payment (%)
              <input type="number" min="0" max="100" step="1" required aria-invalid={Boolean(settingsFieldErrors.serviceDownPaymentPercent)} value={settings.serviceDownPaymentPercent} onChange={(event) => updateReservationSetting("serviceDownPaymentPercent", Number(event.target.value))} />
              {settingsFieldErrors.serviceDownPaymentPercent && <small className="inventory-field-error" role="alert">{settingsFieldErrors.serviceDownPaymentPercent}</small>}
            </label>
            <label>
              Payment deadline (hours)
              <input type="number" min="1" max="720" step="1" required aria-invalid={Boolean(settingsFieldErrors.pendingPaymentHours)} value={settings.pendingPaymentHours} onChange={(event) => updateReservationSetting("pendingPaymentHours", Number(event.target.value))} />
              {settingsFieldErrors.pendingPaymentHours && <small className="inventory-field-error" role="alert">{settingsFieldErrors.pendingPaymentHours}</small>}
            </label>
            <label>
              Pickup hold (days)
              <input type="number" min="1" max="30" step="1" required aria-invalid={Boolean(settingsFieldErrors.holdDays)} value={settings.holdDays} onChange={(event) => updateReservationSetting("holdDays", Number(event.target.value))} />
              {settingsFieldErrors.holdDays && <small className="inventory-field-error" role="alert">{settingsFieldErrors.holdDays}</small>}
            </label>
            <section className="gcash-admin-settings-card reservation-settings-wide" aria-labelledby="gcash-settings-heading">
              <div className="reservation-admin-section-heading">
                <div>
                  <h2 id="gcash-settings-heading">GCash payment</h2>
                  <p>These details and the QR code are shown to customers during payment.</p>
                </div>
              </div>
              {gcashError && <p className="admin-dialog-error" role="alert">{gcashError}</p>}
              {gcashToast && <p className="reservation-admin-toast" role="status">{gcashToast}</p>}
              <div className="gcash-admin-settings-grid">
                <div className="gcash-admin-fields">
                  <label>
                    Account name
                    <input
                      required
                      minLength="2"
                      maxLength="80"
                      value={gcashSettings.gcashAccountName}
                      onChange={(event) => setGcashSettings({ ...gcashSettings, gcashAccountName: event.target.value })}
                    />
                  </label>
                  <label>
                    Account number
                    <input
                      required
                      minLength="10"
                      maxLength="20"
                      value={gcashSettings.gcashAccountNumber}
                      onChange={(event) => setGcashSettings({ ...gcashSettings, gcashAccountNumber: event.target.value })}
                    />
                  </label>
                  <label className="gcash-admin-instructions">
                    Optional payment instructions
                    <textarea
                      maxLength="300"
                      value={gcashSettings.paymentInstructions}
                      onChange={(event) => setGcashSettings({ ...gcashSettings, paymentInstructions: event.target.value })}
                    />
                  </label>
                  <div className="gcash-admin-image-picker">
                    <input
                      className="gcash-admin-file-input"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                      onChange={selectGcashQr}
                      aria-label="Choose GCash QR image"
                    />
                    <button className="btn-small" type="button" onClick={(event) => event.currentTarget.previousElementSibling.click()}>
                      Choose image
                    </button>
                    <small>PNG, JPG or WEBP; up to 2 MB. Select a new image to replace the current QR.</small>
                  </div>
                  <button className="btn-primary admin-dialog-gcash-save-body" type="button" onClick={saveGcashSettings} disabled={isSavingGcash}>
                    {isSavingGcash ? "Saving GCash settings..." : "Save GCash settings"}
                  </button>
                </div>
                <div className="gcash-admin-preview" aria-live="polite">
                  <strong>This is what customers will see</strong>
                  {gcashQrPreview
                    ? <img src={gcashQrPreview} alt="GCash payment QR preview" />
                    : <p>No QR uploaded yet</p>}
                  <span>{gcashSettings.gcashAccountName || "Account name"}</span>
                  <span>{gcashSettings.gcashAccountNumber || "Account number"}</span>
                  {gcashSettings.paymentInstructions && <small>{gcashSettings.paymentInstructions}</small>}
                </div>
              </div>
            </section>
            <label>
              Pickup address
              <textarea maxLength="150" aria-invalid={Boolean(settingsFieldErrors.pickupAddress)} value={settings.pickupAddress} onChange={(event) => updateReservationSetting("pickupAddress", event.target.value)} />
              {settingsFieldErrors.pickupAddress && <small className="inventory-field-error" role="alert">{settingsFieldErrors.pickupAddress}</small>}
            </label>
            <label>
              Pickup hours
              <input maxLength="80" aria-invalid={Boolean(settingsFieldErrors.pickupHours)} value={settings.pickupHours} onChange={(event) => updateReservationSetting("pickupHours", event.target.value)} />
              {settingsFieldErrors.pickupHours && <small className="inventory-field-error" role="alert">{settingsFieldErrors.pickupHours}</small>}
            </label>
            <label>
              Shop contact number
              <input
                type="text"
                inputMode="tel"
                autoComplete="tel"
                maxLength="40"
                pattern="[0-9+() -]*"
                aria-invalid={Boolean(settingsFieldErrors.contactNumber)}
                value={settings.contactNumber}
                onChange={(event) => updateReservationSetting("contactNumber", event.target.value)}
              />
              {settingsFieldErrors.contactNumber && <small className="inventory-field-error" role="alert">{settingsFieldErrors.contactNumber}</small>}
            </label>
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
          footer={<div className="admin-dialog-actions">
            {reservationAction.action === "review" && (rejectingPayment ? <>
              <button className="btn-small" type="button" onClick={() => setRejectingPayment(false)}>Back</button>
              <button className="btn-small btn-delete" type="submit" form="reservation-action-form" disabled={isPerformingReservationAction}>{isPerformingReservationAction ? "Rejecting..." : "Reject payment"}</button>
            </> : <>
              <button className="btn-small btn-delete" type="button" onClick={() => setRejectingPayment(true)}>Reject</button>
              <button className="btn-primary" type="button" disabled={isPerformingReservationAction} onClick={(event) => performReservationAction(event, "confirm")}>{isPerformingReservationAction ? "Confirming..." : "Confirm payment"}</button>
            </>)}
            {reservationAction.action === "complete" && <>
              <button className="btn-small" type="button" onClick={() => setReservationAction(null)}>Cancel</button>
              <button className="btn-primary" type="submit" form="reservation-action-form" disabled={!balanceReceived || isPerformingReservationAction}>{isPerformingReservationAction ? "Completing..." : "Complete"}</button>
            </>}
            {reservationAction.action === "refund" && <>
              <button className="btn-small" type="button" onClick={() => setReservationAction(null)}>Cancel</button>
              <button className="btn-primary" type="submit" form="reservation-action-form" disabled={!refundDecision || isPerformingReservationAction}>{isPerformingReservationAction ? "Saving..." : "Save decision"}</button>
            </>}
            {reservationAction.action === "cancel" && <>
              <button className="btn-small" type="button" onClick={() => setReservationAction(null)}>Keep reservation</button>
              <button className="btn-small btn-delete" type="submit" form="reservation-action-form" disabled={isPerformingReservationAction || (reservationAction.transaction.amountPaid > 0 && (reservationAction.transaction.status === "Reserved" || !reservationAction.transaction.refundDecision) && !refundDecision)}>{isPerformingReservationAction ? "Cancelling..." : "Cancel reservation"}</button>
            </>}
            {["cancel-service", "decline-service"].includes(reservationAction.action) && <>
              <button className="btn-small" type="button" onClick={() => setReservationAction(null)}>Keep booking</button>
              <button className="btn-small btn-delete" type="submit" form="reservation-action-form" disabled={isPerformingReservationAction
                || (reservationAction.transaction.paid > 0 && ["Confirmed", "Paid at shop"].includes(reservationAction.transaction.paymentStatus) && !refundDecision)
                || (reservationAction.transaction.bookingStatus === "in-progress" && reservationAction.action === "cancel-service" && actionReason.trim().length < 3)}>
                {isPerformingReservationAction ? "Saving..." : "Confirm"}
              </button>
            </>}
          </div>}
        >
          <form id="reservation-action-form" className="admin-dialog-form reservation-transaction-action" onSubmit={(event) => performReservationAction(event, rejectingPayment ? "reject" : undefined)}>
            {reservationActionError && <p className="admin-dialog-error" role="alert">{reservationActionError}</p>}
            <p><strong>Customer:</strong> {reservationAction.transaction.customer}</p>
            <p><strong>{reservationAction.transaction.isServiceRequest ? "Booking" : "Reservation"}:</strong> {reservationAction.transaction.code || reservationAction.transaction.id}</p>
            <p><strong>{reservationAction.transaction.isServiceRequest ? "Service:" : "Items:"}</strong> {reservationAction.transaction.items}</p>
            {reservationAction.action === "review" && (
              <>
                <p><strong>Date and time:</strong> {reservationAction.transaction.isServiceRequest
                  ? `${reservationAction.transaction.date}${reservationAction.transaction.startTime ? ` · ${reservationAction.transaction.startTime} - ${reservationAction.transaction.endTime}` : ""}`
                  : reservationAction.transaction.date}</p>
                <p><strong>{reservationAction.transaction.isServiceRequest ? "Down payment expected:" : "Amount due:"}</strong> {formatMoney(reservationAction.transaction.isServiceRequest ? reservationAction.transaction.downPaymentAmount : reservationAction.transaction.downPaymentAmount || reservationAction.transaction.amount)}</p>
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
                    <strong>Receipt {index + 1} · {submission.status}{submission.amount !== undefined ? ` · ${formatMoney(submission.amount)}` : ""}{submission.rejectionReason ? ` · ${submission.rejectionReason}` : ""}:</strong>
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
                  </>
                ) : null}
              </>
            )}
            {reservationAction.action === "complete" && (
              <>
                <p><strong>Balance due:</strong> {formatMoney(reservationAction.transaction.balance)}</p>
                <label className="reservation-balance-confirm">
                  <input type="checkbox" checked={balanceReceived} onChange={(event) => setBalanceReceived(event.target.checked)} />
                  Balance received
                </label>
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
                {reservationAction.transaction.paid > 0 && ["Confirmed", "Paid at shop"].includes(reservationAction.transaction.paymentStatus) && (
                  <fieldset className="reservation-refund-choice">
                    <legend>Service payment decision</legend>
                    <label><input type="radio" name="service-refund-decision" value="refunded" checked={refundDecision === "refunded"} onChange={(event) => setRefundDecision(event.target.value)} /> Refund</label>
                    <label><input type="radio" name="service-refund-decision" value="forfeited" checked={refundDecision === "forfeited"} onChange={(event) => setRefundDecision(event.target.value)} /> Forfeit</label>
                  </fieldset>
                )}
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
              {selectedTransaction.date || new Date(
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
            {selectedTransaction.customerPhone && <p><strong>Customer phone:</strong> {selectedTransaction.customerPhone}</p>}
            {selectedTransaction.recordLabel && <p><strong>Type:</strong> {selectedTransaction.recordLabel}</p>}
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
            {!selectedIsService && <p>
              <strong>Total:</strong> ₱
              {Number(
                selectedTransaction.amount ??
                  selectedTransaction.totalPrice ??
                  selectedTransaction.totalAmount ??
                  0,
              ).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
            </p>}
            {selectedTransaction.recordType === "service" && <p><strong>Mechanic:</strong> {selectedTransaction.mechanicName || selectedTransaction.mechanic || "N/A"}</p>}
            {selectedTransaction.paymentMethod && <p><strong>Payment method:</strong> {selectedTransaction.paymentMethod}</p>}
            {selectedTransaction.paymentReference && <p><strong>Payment reference:</strong> {selectedTransaction.paymentReference}</p>}
            {selectedTransaction.reservedUntil && <p><strong>Hold until:</strong> {new Date(selectedTransaction.reservedUntil).toLocaleString("en-PH")}</p>}
            {selectedTransaction.rejectionReason && <p><strong>Last rejection:</strong> {selectedTransaction.rejectionReason}</p>}
            {selectedTransaction.refundDecision && <p><strong>Refund decision:</strong> {selectedTransaction.refundDecision}</p>}
            {selectedIsService && (
              <>
                <p><strong>Parts:</strong> {selectedTransaction.partsSource === "customer" ? "Customer brings own parts" : "From the shop"}</p>
                <p><strong>Service{selectedTransaction.partsSource === "customer" ? " (labor only)" : ""}:</strong> {formatMoney(selectedServicePrice)}</p>
                <p><strong>Mechanic fee:</strong> {formatMoney(selectedMechanicFee)}</p>
                <p><strong>Total:</strong> {formatMoney(selectedServiceTotal)}</p>
                <p><strong>Down payment ({selectedTransaction.downPaymentPercent}%):</strong> {formatMoney(selectedTransaction.downPaymentAmount)}</p>
                <p><strong>Down payment paid:</strong> {formatMoney(selectedTransaction.paid)}</p>
                <p><strong>Balance to collect:</strong> {formatMoney(selectedTransaction.balance)}</p>
                {selectedTransaction.balance > 0 && <p><strong>At service completion:</strong> Collect balance of {formatMoney(selectedTransaction.balance)} at the shop.</p>}
                <p><strong>Payment reference:</strong> {selectedTransaction.paymentReference || "Not provided"}</p>
                <p><strong>Payment status:</strong> {selectedTransaction.paymentStatus || "Payment Pending"}</p>
                {selectedTransaction.bookingStatus && <p><strong>Booking status:</strong> {selectedTransaction.bookingStatus}</p>}
                <p><strong>Mechanic:</strong> {selectedTransaction.mechanic || "Unassigned"}</p>
              </>
            )}
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
            {Array.isArray(selectedTransaction.items) && selectedTransaction.items.length > 0 && (
              <ul className="transaction-details__line-items">
                {selectedTransaction.items.map((item, index) => <li key={item._id || item.productId || item.variantId || index}>
                  <span>{reservationItemName(item)} × {item.qty}</span>
                  <strong>{formatMoney(item.lineTotal)}</strong>
                </li>)}
              </ul>
            )}
          </div>
        </AdminDialog>
      )}
    </AdminPageFrame>
  );
}

export default Transactions;
