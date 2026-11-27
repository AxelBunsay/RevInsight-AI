import AdminAuditHistory from "../components/AdminAuditHistory";
import { useEffect, useState } from "react";
import { adminApi as api } from "../services/adminApi";
import { AdminDialog, AdminPageFrame } from "./ManagementPageComponents";

function ServiceRequests() {
  const [queueView, setQueueView] = useState('waiting');
  const [requests, setRequests] = useState([]);
  const [mechanics, setMechanics] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState("");
  const [historyRequestId, setHistoryRequestId] = useState(null);
  const [transitionDraft, setTransitionDraft] = useState(null);
  const [transitionReason, setTransitionReason] = useState("");
  const [transitionRefund, setTransitionRefund] = useState("");

  const loadRequests = () =>
    Promise.all([api.getAdminServiceRequests(), api.getMechanics()]).then(
      ([requestResponse, mechanicResponse]) => {
        setRequests((requestResponse.requests || []).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));
        setMechanics(
          (mechanicResponse.mechanics || mechanicResponse.data || []).filter(
            (mechanic) => mechanic.isActive !== false,
          ),
        );
      },
    );

  useEffect(() => {
    loadRequests()
      .catch((loadError) =>
        setError(loadError.message || "Failed to load service requests"),
      )
      .finally(() => setIsLoading(false));
  }, []);

  const confirmAssignment = async (requestId, mechanicId) => {
    if (!mechanicId) return;
    setSavingId(requestId);
    setError("");
    try {
      await api.confirmServiceRequest(requestId, mechanicId);
      await loadRequests();
    } catch (saveError) {
      setError(saveError.message || "Failed to confirm assignment");
    } finally {
      setSavingId("");
    }
  };

  const updateStatus = async (request, status, details = {}) => {
    const requiresRefund = ["cancelled", "declined"].includes(status)
      && ["Confirmed", "Paid at shop"].includes(request.paymentStatus);
    const requiresReason = request.status === "in-progress" && status === "cancelled";
    if (requiresRefund || requiresReason) {
      setTransitionDraft({ request, status, requiresRefund, requiresReason });
      setTransitionReason("");
      setTransitionRefund("");
      return;
    }
    await saveStatus(request, status, details);
  };

  const saveStatus = async (request, status, details = {}) => {
    setSavingId(request._id);
    setError("");
    try {
      await api.updateAdminServiceRequestStatus(request._id, status, details);
      await loadRequests();
      return true;
    } catch (saveError) {
      setError(saveError.message || "Failed to update booking status");
      return false;
    } finally {
      setSavingId("");
    }
  };

  const markPaidAtShop = async (request) => {
    setSavingId(request._id);
    setError("");
    try {
      if (request.queueKey && request.paymentMethod === 'Cash') await api.collectServiceDeposit(request._id);
      else await api.markServicePaidAtShop(request._id);
      await loadRequests();
    } catch (saveError) {
      setError(saveError.message || "Failed to update booking payment");
    } finally {
      setSavingId("");
    }
  };

  const statusGroups = {
    waiting: ['pending','assigned','accepted','confirmed'],
    'in-progress': ['in-progress'], completed: ['completed'], cancelled: ['declined','cancelled']
  };
  const visibleRequests = requests.filter(request => statusGroups[queueView].includes(request.status));

  return (
    <AdminPageFrame>
      <section className="admin-management-section">
        <div className="mechanics-container">
          {error && (
            <p className="dashboard-error" role="alert">
              {error}
            </p>
          )}
          <div className="mechanics-header">
            <h2>Service queue</h2>
            <label>Show requests <select value={queueView} onChange={e => setQueueView(e.target.value)}><option value="waiting">Waiting</option><option value="in-progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Canceled</option></select></label>
          </div>
          {isLoading ? (
            <p>Loading service requests...</p>
          ) : !visibleRequests.length ? (
            <p>No service requests found.</p>
          ) : (
            visibleRequests.map((request) => (
              <article className="mechanic-card" key={request._id}>
                <div className="mechanic-header-row">
                  <div>
                    <div className="mechanic-name">
                      {request.serviceType.replaceAll("-", " ")}
                    </div>
                    <div className="mechanic-email">
                      {request.user
                        ? `${request.user.firstName || ""} ${request.user.lastName || ""}`.trim()
                        : request.walkInId ? "Walk-in Guest" : "Customer"}
                    </div>
                    <p>{request.description}</p>
                    <small>
                      {request.scheduledDate
                        ? `Scheduled ${new Date(request.scheduledDate).toLocaleDateString("en-PH")}`
                        : "Service queue"}{" "}
                      · Customer price: ₱
                      {Number(request.estimatedPrice || 0).toLocaleString(
                        "en-PH",
                      )}{" "}
                      · Labor fee: ₱{Number(request.laborFee || 0).toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                      })} · Payment: {request.paymentMethod === 'Cash' && request.paymentStatus === 'Payment Pending' ? 'Pending cash payment' : request.paymentStatus || 'Payment Pending'}
                      {request.queueKey && request.paymentStatus === 'Payment Pending' && request.paymentDueAt && ' - due ' + new Date(request.paymentDueAt).toLocaleString('en-PH')}
                    </small>
                    {request.refundDecision && <small>Refund decision: {request.refundDecision}</small>}
                  </div>
                  <span className={`status-badge status-${request.status}`}>
                    {request.status === 'pending' ? 'Waiting' : request.status.replaceAll("-", " ")}
                  </span>
                </div>
                <button type="button" className="btn-small" onClick={() => setHistoryRequestId(request._id)}>View change history</button>
                <div className="mechanic-actions">
                  <select
                    aria-label={`Assign mechanic for ${request.serviceType}`}
                    value={request.mechanic?._id || request.mechanic || request.mechanicId?._id || request.mechanicId || ""}
                    disabled={savingId === request._id || request.status !== "pending"}
                    onChange={(event) =>
                      confirmAssignment(request._id, event.target.value)
                    }
                  >
                    <option value="">Assign mechanic</option>
                    {mechanics.map((mechanic) => (
                      <option
                        key={mechanic.id || mechanic._id}
                        value={mechanic.id || mechanic._id}
                        disabled={['busy','on-leave'].includes(mechanic.availabilityStatus)}
                      >
                        {mechanic.firstName} {mechanic.lastName} ? {({ busy: "Busy", "on-leave": "On leave" })[mechanic.availabilityStatus] || "Available"}{mechanic.username ? ` (@${mechanic.username})` : ""}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`Update status for ${request.serviceType}`}
                    value={request.status}
                    disabled={savingId === request._id}
                    onChange={(event) =>
                      updateStatus(request, event.target.value)
                    }
                  >
                    <option value="pending">Pending</option>
                    <option value="assigned">Assigned</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="accepted">Accepted</option>
                    <option value="in-progress">In progress</option>
                    <option value="completed" disabled>Completed</option>
                    <option value="declined">Declined</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  {!request.walkInId && (!request.queueKey || request.paymentMethod === "Cash") && request.paymentStatus === "Payment Pending"
                    && !["completed", "declined", "cancelled"].includes(request.status)
                    && (
                      <button
                        className="btn-small btn-edit"
                        type="button"
                        disabled={savingId === request._id}
                        onClick={() => markPaidAtShop(request)}
                      >
                        {request.queueKey && request.paymentMethod === 'Cash' ? 'Record cash deposit received ? PHP ' + request.downPaymentAmount : 'Mark paid at shop'}
                      </button>
                    )}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
      {historyRequestId && <AdminDialog title="Service change history" onClose={() => setHistoryRequestId(null)}>
        <AdminAuditHistory key={historyRequestId} recordType="service" recordId={historyRequestId} />
      </AdminDialog>}
      {transitionDraft && (
        <AdminDialog
          title={transitionDraft.status === "declined" ? "Decline service booking" : "Cancel service booking"}
          onClose={() => setTransitionDraft(null)}
          footer={<div className="admin-dialog-actions">
            <button className="btn-small" type="button" onClick={() => setTransitionDraft(null)}>Cancel</button>
            <button
              className="btn-small btn-delete"
              type="submit"
              form="service-request-transition-form"
              disabled={savingId === transitionDraft.request._id
                || (transitionDraft.requiresRefund && !transitionRefund)
                || (transitionDraft.requiresReason && transitionReason.trim().length < 3)}
            >{savingId === transitionDraft.request._id ? "Saving..." : "Save"}</button>
          </div>}
        >
          <form
            id="service-request-transition-form"
            className="admin-dialog-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const saved = await saveStatus(transitionDraft.request, transitionDraft.status, {
                reason: transitionReason,
                refundDecision: transitionRefund
              });
              if (saved) setTransitionDraft(null);
            }}
          >
            {transitionDraft.requiresReason && (
              <label>
                Cancellation reason
                <textarea minLength="3" maxLength="300" required value={transitionReason} onChange={(event) => setTransitionReason(event.target.value)} />
              </label>
            )}
            {transitionDraft.requiresRefund && (
              <fieldset className="reservation-refund-choice">
                <legend>Service payment decision</legend>
                <label><input type="radio" name="service-refund-decision" value="refunded" checked={transitionRefund === "refunded"} onChange={(event) => setTransitionRefund(event.target.value)} /> Refund</label>
                <label><input type="radio" name="service-refund-decision" value="forfeited" checked={transitionRefund === "forfeited"} onChange={(event) => setTransitionRefund(event.target.value)} /> Forfeit</label>
              </fieldset>
            )}
          </form>
        </AdminDialog>
      )}
    </AdminPageFrame>
  );
}

export default ServiceRequests;
