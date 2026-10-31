import { useEffect, useState } from "react";
import { adminApi as api } from "../services/adminApi";
import { AdminDialog, AdminPageFrame } from "./ManagementPageComponents";
import { getMechanicFormError } from "./mechanicFormValidation";

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
  const [showPassword, setShowPassword] = useState(false);
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
    setShowPassword(false);
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
            phoneNumber: mechanic.phoneNumber || "",
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
    return statuses[status] || status;
  };

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
                    <div className="mechanic-name">
                      {`${mechanic.firstName || ""} ${mechanic.lastName || ""}`.trim() ||
                        "Unknown"}
                    </div>
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
                    {mechanic.averageRating || 0}
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
                <span className="mechanic-password-control">
                  <input
                    required={!editingMechanic}
                    minLength="8"
                    autoComplete="new-password"
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(event) =>
                      setForm({ ...form, password: event.target.value })
                    }
                  />
                  <button
                    className="mechanic-password-toggle"
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </span>
              </label>
              <label className="mechanic-form-field">
                Phone number
                <input
                  required
                  type="tel"
                  value={form.phoneNumber}
                  onChange={(event) =>
                    setForm({ ...form, phoneNumber: event.target.value })
                  }
                />
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
