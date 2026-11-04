import { useEffect, useState } from "react";
import { adminApi as api } from "../services/adminApi";
import { AdminDialog, AdminPageFrame } from "./ManagementPageComponents";
import { getMechanicFormError } from "./mechanicFormValidation";
import { cleanAndValidateMobileNumber, MOBILE_NUMBER_ERROR } from "../../../../shared/mobileNumber.mjs";
import PasswordInput from "../../components/PasswordInput";

function formatAvailabilityUpdatedAt(value) {
  if (!value) return "Update time unavailable";
  const updatedAt = new Date(value);
  if (Number.isNaN(updatedAt.getTime())) return "Update time unavailable";
  const minutes = Math.floor((Date.now() - updatedAt.getTime()) / 60000);
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Updated ${days} day${days === 1 ? "" : "s"} ago`;
  return `Updated ${new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(updatedAt)}`;
}

function Mechanics() {
  const [mechanics, setMechanics] = useState([]);
  const [totalMechanics, setTotalMechanics] = useState(0);
  const [totalJobs, setTotalJobs] = useState(0);
  const [totalLaborToday, setTotalLaborToday] = useState(0);
  const [mechanicRepairCounts, setMechanicRepairCounts] = useState({});
  const [completedJobs, setCompletedJobs] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingMechanic, setEditingMechanic] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [phoneNumberError, setPhoneNumberError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    password: "",
    phoneNumber: "",
    specialization: "general",
    yearsOfExperience: "",
  });

  useEffect(() => {
    let isMounted = true;

    Promise.all([api.getMechanics(), api.getMechanicsSummary()])
      .then(([response, summary]) => {
        if (isMounted) {
          const data = response.mechanics || response.data || [];
          setMechanics(data);
          setTotalMechanics(data.length);
          setTotalJobs(summary.totalRepairs || 0);
          setTotalLaborToday(summary.totalLaborToday || 0);
          setMechanicRepairCounts(
            Object.fromEntries((summary.mechanics || []).map((item) => [
              item.mechanicId,
              item.totalRepairs || 0,
            ])),
          );
          setCompletedJobs(data.filter((mechanic) => mechanic.isActive).length);
        }
      })
      .catch((fetchError) => {
        if (isMounted) {
          setError(fetchError.message || "Failed to load mechanics");
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [refreshKey]);

  const openMechanicDialog = (mechanic = null) => {
    setEditingMechanic(mechanic);
    setIsAdding(!mechanic);
    setForm(
      mechanic
        ? {
            firstName: mechanic.firstName || "",
            lastName: mechanic.lastName || "",
            username: mechanic.username || "",
            email: mechanic.email || "",
            password: "",
            phoneNumber: cleanAndValidateMobileNumber(mechanic.phoneNumber || "").canonicalDigits,
            specialization: mechanic.specialization || "general",
            yearsOfExperience: mechanic.yearsOfExperience || 0,
          }
        : {
            firstName: "",
            lastName: "",
            username: "",
            email: "",
            password: "",
            phoneNumber: "",
            specialization: "general",
            yearsOfExperience: "",
          },
    );
  };

  const saveMechanic = async (event) => {
    event.preventDefault();
    setError("");
    setPhoneNumberError("");
    const mobileNumber = cleanAndValidateMobileNumber(form.phoneNumber);
    if (!mobileNumber.isValid) {
      setPhoneNumberError(MOBILE_NUMBER_ERROR);
      return;
    }
    const formError = getMechanicFormError(form, Boolean(editingMechanic));
    if (formError) {
      setError(formError);
      return;
    }
    setIsSaving(true);

    try {
      const payload = {
        ...form,
        yearsOfExperience: Number(form.yearsOfExperience),
      };

      if (editingMechanic) {
        if (!payload.password) delete payload.password;
        delete payload.email;
        if (!payload.phoneNumber.trim()) delete payload.phoneNumber;
        await api.updateMechanic(editingMechanic.id, payload);
      } else {
        await api.createMechanic(payload);
      }

      setEditingMechanic(null);
      setIsAdding(false);
      setRefreshKey((key) => key + 1);
    } catch (saveError) {
      setError(saveError.message || "Failed to save mechanic");
    } finally {
      setIsSaving(false);
    }
  };

  const removeMechanic = async (mechanic) => {
    if (!window.confirm(`Delete ${mechanic.firstName} ${mechanic.lastName}?`)) {
      return;
    }

    try {
      await api.deleteMechanic(mechanic.id);
      setRefreshKey((key) => key + 1);
    } catch (deleteError) {
      setError(deleteError.message || "Failed to delete mechanic");
    }
  };

  const getMechanicInitial = (name) => (name || "U").charAt(0).toUpperCase();
  const getMechanicAvatarColor = (index) =>
    ["orange", "blue", "green", "purple"][index % 4];

  const getAvailabilityStatus = (status) => {
    const statuses = {
      available: "Available",
      busy: "Busy",
      "on-leave": "On leave",
    };
    return statuses[status] || statuses.available;
  };
  const availabilityCounts = mechanics.reduce((counts, mechanic) => {
    const status = ["busy", "on-leave"].includes(mechanic.availabilityStatus)
      ? mechanic.availabilityStatus
      : "available";
    counts[status] += 1;
    return counts;
  }, { available: 0, busy: 0, "on-leave": 0 });

  const closeMechanicDialog = () => {
    setEditingMechanic(null);
    setIsAdding(false);
  };

  return (
    <AdminPageFrame>
      <section className="section-content active">
        <div className="mechanics-container">
          {error && !isAdding && !editingMechanic && (
            <p className="dashboard-error" role="alert">
              {error}
            </p>
          )}
          <div className="mechanics-header">
            <h2>MECHANICS</h2>
            <button
              className="btn-primary"
              type="button"
              onClick={() => openMechanicDialog()}
            >
              + Add Mechanic
            </button>
          </div>
          <div className="mechanics-stats">
            <div className="stat-box">
              <div className="stat-number">
                {isLoading ? "..." : totalMechanics}
              </div>
              <div className="stat-label">Total Mechanics</div>
            </div>
            <div className="stat-box">
              <div className="stat-number">{isLoading ? "..." : totalJobs}</div>
              <div className="stat-label">Total Repairs</div>
            </div>
            <div className="stat-box">
              <div className="stat-number">
                {isLoading ? "..." : completedJobs}
              </div>
              <div className="stat-label">Active Mechanics</div>
            </div>
            <div className="stat-box">
              <div className="stat-number">
                {isLoading
                  ? "..."
                  : `₱${Number(totalLaborToday).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`}
              </div>
              <div className="stat-label">Total Labor Today</div>
            </div>
          </div>
          <p className="mechanic-availability-summary" role="status">
            {isLoading ? "Loading availability..." : `${availabilityCounts.available} Available - ${availabilityCounts.busy} Busy - ${availabilityCounts["on-leave"]} On leave`}
          </p>
          {mechanics.map((mechanic, index) => (
            <div key={mechanic.id} className="mechanic-card">
              <div className="mechanic-header-row">
                <div className="mechanic-info">
                  <div
                    className={`mechanic-avatar ${getMechanicAvatarColor(index)}`}
                  >
                    {getMechanicInitial(mechanic.firstName)}
                  </div>
                  <div>
                    <div className="mechanic-name-row">
                      <div className="mechanic-name">
                        {`${mechanic.firstName || ""} ${mechanic.lastName || ""}`.trim() ||
                          "Unknown"}
                      </div>
                      <span className={`mechanic-availability-pill is-${mechanic.availabilityStatus || "available"}`}>
                        {getAvailabilityStatus(mechanic.availabilityStatus)}
                      </span>
                    </div>
                    <small className="mechanic-availability-updated">{formatAvailabilityUpdatedAt(mechanic.availabilityUpdatedAt)}</small>
                    <div className="mechanic-specialty">
                      {mechanic.specialization || "General Service"}
                    </div>
                    <div className="mechanic-email">@{mechanic.username || "No username"}</div>
                    <div className="mechanic-email">
                      {mechanic.email || "N/A"}
                    </div>
                  </div>
                </div>
                <div className="mechanic-actions">
                  <button
                    className="btn-small btn-edit"
                    type="button"
                    onClick={() => openMechanicDialog(mechanic)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn-small btn-delete"
                    type="button"
                    onClick={() => removeMechanic(mechanic)}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="mechanic-stats">
                <div className="mechanic-stat">
                  <div className="mechanic-stat-number">
                    {mechanicRepairCounts[String(mechanic.id)] || 0}
                  </div>
                  <div className="mechanic-stat-label">Total Repairs</div>
                </div>
                <div className="mechanic-stat">
                  <div className="mechanic-stat-number">
                    {mechanic.ratingCount
                      ? `${Number(mechanic.averageRating || 0).toFixed(1)} (${mechanic.ratingCount})`
                      : "- (0)"}
                  </div>
                  <div className="mechanic-stat-label">Average Rating</div>
                </div>
                <div className="mechanic-stat">
                  <div className="mechanic-stat-number">
                    {getAvailabilityStatus(mechanic.availabilityStatus)}
                  </div>
                  <div className="mechanic-stat-label">Status</div>
                </div>
                <div className="mechanic-stat">
                  <div className="mechanic-stat-number">
                    {mechanic.yearsOfExperience || 0}
                  </div>
                  <div className="mechanic-stat-label">Years Experience</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
      {(isAdding || editingMechanic) && (
        <AdminDialog
          title={editingMechanic ? "Edit Mechanic" : "Add Mechanic"}
          onClose={closeMechanicDialog}
          dialogClassName="mechanic-form-dialog"
          footer={<div className="admin-dialog-actions">
            <button className="btn-small" type="button" onClick={closeMechanicDialog}>Cancel</button>
            <button className="btn-primary" type="submit" form="mechanic-form" disabled={isSaving}>{isSaving ? "Saving..." : "Save Mechanic"}</button>
          </div>}
        >
            <form id="mechanic-form" className="admin-dialog-form" onSubmit={saveMechanic}>
              <div className="mechanic-form-grid">
                <label className="mechanic-form-field">
                  First name
                <input
                  required
                  value={form.firstName}
                  onChange={(event) =>
                    setForm({ ...form, firstName: event.target.value })
                  }
                />
              </label>
              <label className="mechanic-form-field">
                Last name
                <input
                  required
                  value={form.lastName}
                  onChange={(event) =>
                    setForm({ ...form, lastName: event.target.value })
                  }
                />
              </label>
              <label className="mechanic-form-field">
                Username
                <input
                  required
                  autoCapitalize="none"
                  autoComplete="off"
                  minLength="4"
                  maxLength="20"
                  pattern="[A-Za-z0-9][A-Za-z0-9._-]{3,19}"
                  value={form.username}
                  onChange={(event) =>
                    setForm({ ...form, username: event.target.value })
                  }
                />
                <small className="mechanic-username-hint">4-20 characters: letters, numbers, . _ -</small>
              </label>
              <label className="mechanic-form-field mechanic-password-field">
                {editingMechanic ? "New password (optional)" : "Password"}
                <PasswordInput
                  className="mechanic-password-control"
                  required={!editingMechanic}
                  minLength="8"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) =>
                    setForm({ ...form, password: event.target.value })
                  }
                />
              </label>
              <label className="mechanic-form-field">
                Phone number
                <input
                  required
                  type="tel"
                  inputMode="numeric"
                  maxLength={11}
                  autoComplete="tel"
                  value={form.phoneNumber}
                  aria-invalid={Boolean(phoneNumberError)}
                  onChange={(event) => {
                    const phoneNumber = cleanAndValidateMobileNumber(event.target.value).digits.slice(0, 11);
                    setForm({ ...form, phoneNumber });
                    setPhoneNumberError(cleanAndValidateMobileNumber(phoneNumber).isValid ? "" : MOBILE_NUMBER_ERROR);
                  }}
                  onPaste={(event) => {
                    event.preventDefault();
                    const phoneNumber = cleanAndValidateMobileNumber(event.clipboardData.getData("text")).digits.slice(0, 11);
                    setForm({ ...form, phoneNumber });
                    setPhoneNumberError(cleanAndValidateMobileNumber(phoneNumber).isValid ? "" : MOBILE_NUMBER_ERROR);
                  }}
                />
                {phoneNumberError && <small className="inventory-field-error" role="alert">{phoneNumberError}</small>}
              </label>
              <label className="mechanic-form-field">
                Email (optional)
                <input
                  type="email"
                  readOnly={Boolean(editingMechanic)}
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                />
              </label>
              <label className="mechanic-form-field">
                Specialization
                <select
                  value={form.specialization}
                  onChange={(event) =>
                    setForm({ ...form, specialization: event.target.value })
                  }
                >
                  <option value="general">General</option>
                  <option value="engine">Engine</option>
                  <option value="transmission">Transmission</option>
                  <option value="electrical">Electrical</option>
                  <option value="suspension">Suspension</option>
                  <option value="brakes">Brakes</option>
                </select>
              </label>
              <label className="mechanic-form-field">
                Years of experience
                <input
                  required
                  min="0"
                  type="number"
                  value={form.yearsOfExperience}
                  onChange={(event) =>
                    setForm({ ...form, yearsOfExperience: event.target.value })
                  }
                />
              </label>
            </div>
            {error && <p className="dashboard-error" role="alert">{error}</p>}
          </form>
        </AdminDialog>
      )}
    </AdminPageFrame>
  );
}

export default Mechanics;
