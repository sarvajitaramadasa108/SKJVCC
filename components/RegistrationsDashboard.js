"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { AVAILABILITY_COLUMNS, buildImageUrl, readJsonResponse } from "@/components/registryUtils";
import PortalNav from "@/components/PortalNav";

const REQUEST_TIMEOUT_MS = 30000;

function emptyImage() {
  return { open: false, loading: false, src: "", title: "", error: "" };
}

function ServiceDropdown({ value, options, placeholder, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useLayoutEffect(() => {
    if (!open || typeof window === "undefined") return;

    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const menuWidth = 320;
      const estimatedHeight = Math.min(options.length + 1, 8) * 44 + 20;
      const left = Math.max(12, Math.min(rect.right - menuWidth, viewportWidth - menuWidth - 12));
      const shouldOpenAbove = rect.bottom + estimatedHeight > viewportHeight - 12 && rect.top > estimatedHeight;
      const top = shouldOpenAbove ? Math.max(12, rect.top - estimatedHeight - 8) : Math.min(viewportHeight - 12, rect.bottom + 8);
      setMenuStyle({ top, left });
    }

    function handlePointerDown(event) {
      if (triggerRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    }

    function handleEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }

    updatePosition();
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, options.length]);

  return (
    <div className="service-dropdown-wrap">
      <button
        type="button"
        ref={triggerRef}
        className="service-dropdown-trigger"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (disabled) return;
          setOpen((current) => !current);
        }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={value ? "service-dropdown-value" : "service-dropdown-placeholder"}>{value || placeholder}</span>
        <span className="service-dropdown-caret" aria-hidden="true">▾</span>
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              className="service-dropdown-menu"
              style={{ top: `${menuStyle.top}px`, left: `${menuStyle.left}px`, width: "320px" }}
              role="listbox"
            >
              <div className="service-dropdown-menu-head">
                <strong>{placeholder}</strong>
                <span>{options.length} services</span>
              </div>
              <div className="service-dropdown-options">
                <button
                  type="button"
                  className={`service-dropdown-option ${!value ? "is-selected" : ""}`}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onChange("");
                    setOpen(false);
                  }}
                >
                  {placeholder}
                </button>
                {options.map((serviceName) => (
                  <button
                    type="button"
                    key={serviceName}
                    className={`service-dropdown-option ${serviceName === value ? "is-selected" : ""}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onChange(serviceName);
                      setOpen(false);
                    }}
                  >
                    {serviceName}
                  </button>
                ))}
              </div>
              {options.length > 8 ? <div className="service-dropdown-scroll-indicator" aria-hidden="true" /> : null}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

export default function RegistrationsDashboard() {
  const [registrations, setRegistrations] = useState([]);
  const [services, setServices] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [editingRow, setEditingRow] = useState(null);
  const [savingRow, setSavingRow] = useState(null);
  const [viewer, setViewer] = useState(emptyImage());
  const [assignmentDrafts, setAssignmentDrafts] = useState({});
  const categoryOptions = useMemo(() => ["FOLK", "Congregation", "Employee"], []);

  useEffect(() => {
    let alive = true;
    const cachedRegistrations = readCachedJson("skjvcc_registrations_cache");
    const cachedServices = readCachedJson("skjvcc_services_cache");
    if (Array.isArray(cachedRegistrations)) setRegistrations(cachedRegistrations);
    if (Array.isArray(cachedServices)) setServices(cachedServices);

    async function loadRegistrations(silent = false) {
      if (!silent) setRefreshing(true);
      try {
        const registrationsPayload = await fetchBridge("registrations.list");
        if (!alive) return;
        const next = Array.isArray(registrationsPayload) ? registrationsPayload : [];
        setRegistrations(next);
        cacheJson("skjvcc_registrations_cache", next);
      } catch (error) {
        if (alive) {
          if (!silent && (!String(error?.message || "").toLowerCase().includes("timed out") || !registrations.length)) {
            setMessage(error.message || "Could not load registrations");
          }
        }
      } finally {
        if (alive && !silent) setRefreshing(false);
      }
    }

    async function loadServices() {
      try {
        const servicesPayload = await fetchBridge("services.list");
        if (!alive) return;
        const next = Array.isArray(servicesPayload) ? servicesPayload : [];
        setServices(next);
        cacheJson("skjvcc_services_cache", next);
      } catch {
        if (alive) setServices([]);
      }
    }

    loadRegistrations(false);
    loadServices();
    const timer = window.setInterval(() => {
      loadRegistrations(true);
    }, 15000);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const filteredRegistrations = useMemo(() => {
    const term = String(search || "").trim().toLowerCase();
    if (!term) return registrations;
    return registrations.filter((row) => {
      const haystack = [
        row.fullName,
        row.mobileNumber,
        row.areaOfStay,
        row.assignedService,
        row.assignedCategory,
        row.devoteeInTouch
      ]
        .map((item) => String(item || "").toLowerCase())
        .join(" ");
      return haystack.includes(term);
    });
  }, [registrations, search]);

  const liveRegistrations = useMemo(
    () => filteredRegistrations.filter((row) => !String(row.assignedService || "").trim()),
    [filteredRegistrations]
  );

  const totals = useMemo(() => {
    const assigned = registrations.filter((row) => String(row.assignedService || "").trim()).length;
    return {
      total: registrations.length,
      assigned,
      unassigned: registrations.length - assigned
    };
  }, [registrations]);

  async function handleAssignService(row, nextService) {
    const draft = assignmentDrafts[row.sourceRow] || {};
    const serviceName = String(nextService || "").trim();
    const category = String(draft.category || "").trim();
    setAssignmentDrafts((current) => ({
      ...current,
      [row.sourceRow]: {
        ...(current[row.sourceRow] || {}),
        serviceName
      }
    }));
    if (serviceName && category) {
      void saveAssignment(row, serviceName, category);
    }
  }

  async function handleAssignCategory(row, nextCategory) {
    const draft = assignmentDrafts[row.sourceRow] || {};
    const serviceName = String(draft.serviceName || "").trim();
    const category = String(nextCategory || "").trim();
    setAssignmentDrafts((current) => ({
      ...current,
      [row.sourceRow]: {
        ...(current[row.sourceRow] || {}),
        category
      }
    }));
    if (serviceName && category) {
      void saveAssignment(row, serviceName, category);
    }
  }

  async function saveAssignment(row, serviceName, category) {
    setSavingRow(row.sourceRow);
    setMessage("");
    try {
      const payload = await fetchBridge("registrations.assignService", {
        sourceRow: row.sourceRow,
        mobileNumber: row.mobileNumber,
        serviceName,
        category
      });
      const updated = payload?.registration || null;
      if (updated) {
        setRegistrations((current) =>
          current.map((item) => (item.sourceRow === row.sourceRow ? updated : item))
        );
      } else {
        setRegistrations((current) =>
          current.map((item) =>
            item.sourceRow === row.sourceRow
              ? { ...item, assignedService: serviceName, assignedCategory: category }
              : item
          )
        );
      }
      setEditingRow(null);
      setAssignmentDrafts((current) => {
        const next = { ...current };
        delete next[row.sourceRow];
        return next;
      });
      setMessage(`Assigned ${serviceName} to ${row.fullName || row.mobileNumber || "registration"}`);
    } catch (error) {
      setMessage(error.message || "Could not update service");
    } finally {
      setSavingRow(null);
    }
  }

  async function openPhotoPreview(row) {
    const directImageUrl = buildImageUrl(row.photoUpload, "preview");
    setViewer({
      open: true,
      loading: true,
      src: "",
      title: row.fullName || row.mobileNumber || "Volunteer photo",
      error: ""
    });

    setViewer((current) => ({ ...current, loading: false, src: directImageUrl || "", error: directImageUrl ? "" : "No image available." }));
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SKJVCC Volunteer Portal</p>
          <h1>Live registrations</h1>
          <p className="subtle">
            Google Form responses flow into the master sheet and refresh here automatically.
          </p>
        </div>
        <PortalNav />
      </header>

      <section className="panel panel-hero">
        <div className="summary-strip">
          <div>
            <span>Total registrations</span>
            <strong>{totals.total}</strong>
          </div>
          <div>
            <span>Assigned</span>
            <strong>{totals.assigned}</strong>
          </div>
          <div>
            <span>Unassigned</span>
            <strong>{totals.unassigned}</strong>
          </div>
        </div>
        <div className="form-grid compact-form">
          <label className="field wide">
            <span>Search</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, mobile, service, or area"
            />
          </label>
          <div className="actions">
            <button type="button" onClick={refreshNow} disabled={refreshing}>
              {refreshing ? "Refreshing..." : "Refresh now"}
            </button>
          </div>
        </div>
      </section>

      {message ? <section className="notice">{message}</section> : null}

      <section className="panel table-panel">
        <div className="panel-head">
          <div>
            <h2>Live registrations</h2>
            <p className="subtle-dark">These volunteers do not have a service assigned yet.</p>
          </div>
        </div>

        {liveRegistrations.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>S No</th>
                  <th>Full Name</th>
                  <th>Age</th>
                  <th>Mobile Number</th>
                  <th>Devotee in Touch</th>
                  <th>Area of Staying in Vizag</th>
                  {AVAILABILITY_COLUMNS.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                  <th>Photo</th>
                  <th>Service</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {liveRegistrations.map((row) => {
                  const isEditing = editingRow === row.sourceRow;
                  const serviceOptions = services.map((service) => service.serviceName).filter(Boolean);
                  const draft = assignmentDrafts[row.sourceRow] || {};
                  return (
                    <tr key={row.sourceRow}>
                      <td>{row.serialNo || row.sourceRow || "-"}</td>
                      <td>{row.fullName || "-"}</td>
                      <td>{row.age || "-"}</td>
                      <td>{row.mobileNumber || "-"}</td>
                      <td>{row.devoteeInTouch || "-"}</td>
                      <td>{row.areaOfStay || "-"}</td>
                      {row.availabilityFlags?.length ? (
                        row.availabilityFlags.map((flag) => (
                          <td key={`${row.sourceRow}-${flag.label}`}>
                            <span className={flag.available ? "badge badge-yes" : "badge badge-no"}>
                              {flag.available ? "Available" : "Not available"}
                            </span>
                          </td>
                        ))
                      ) : (
                        AVAILABILITY_COLUMNS.map((column) => (
                          <td key={`${row.sourceRow}-${column}`}>
                            <span className="badge badge-no">Not available</span>
                          </td>
                        ))
                      )}
                      <td>
                        <button
                          type="button"
                          className="secondary tiny-button"
                          onClick={() => openPhotoPreview(row)}
                          disabled={!row.photoUpload}
                        >
                          View Image
                        </button>
                      </td>
                      <td>
                        <div className="service-cell">
                          {savingRow === row.sourceRow ? (
                            <div className="saving-pill">
                              <span className="loading-spinner" aria-hidden="true" />
                              <span>Saving...</span>
                            </div>
                          ) : (
                            <ServiceDropdown
                              value={draft.serviceName || row.assignedService || ""}
                              options={serviceOptions}
                              placeholder={serviceOptions.length ? "Assign service" : "No services yet"}
                              onChange={(nextService) => handleAssignService(row, nextService)}
                              disabled={savingRow === row.sourceRow || !serviceOptions.length}
                            />
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="service-cell">
                          {savingRow === row.sourceRow ? (
                            <div className="saving-pill">
                              <span className="loading-spinner" aria-hidden="true" />
                              <span>Saving...</span>
                            </div>
                          ) : (
                            <select
                              value={draft.category || row.assignedCategory || ""}
                              onChange={(event) => handleAssignCategory(row, event.target.value)}
                              disabled={savingRow === row.sourceRow}
                            >
                              <option value="">Select category</option>
                              {categoryOptions.map((category) => (
                                <option key={category} value={category}>
                                  {category}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            {refreshing ? "Loading latest registrations..." : "No registrations found yet."}
          </div>
        )}
      </section>

      {viewer.open ? (
        <div
          className="image-modal"
          role="button"
          tabIndex={0}
          onClick={() => setViewer(emptyImage())}
          onKeyDown={(event) => {
            if (event.key === "Escape") setViewer(emptyImage());
          }}
        >
          <div className="image-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="image-modal-head">
              <strong>{viewer.title}</strong>
              <button type="button" className="secondary tiny-button" onClick={() => setViewer(emptyImage())}>
                Close
              </button>
            </div>
            {viewer.loading ? (
              <div className="empty-state">Loading image...</div>
            ) : viewer.src ? (
              <img className="image-modal-img" src={viewer.src} alt={viewer.title} />
            ) : (
              <div className="empty-state">{viewer.error || "No image available."}</div>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );

  async function refreshNow() {
    setRefreshing(true);
    setMessage("");
    try {
      const registrationsPayload = await fetchBridge("registrations.list");
      setRegistrations(Array.isArray(registrationsPayload) ? registrationsPayload : []);
      cacheJson("skjvcc_registrations_cache", Array.isArray(registrationsPayload) ? registrationsPayload : []);
      fetchBridge("services.list")
        .then((servicesPayload) => {
          setServices(Array.isArray(servicesPayload) ? servicesPayload : []);
          cacheJson("skjvcc_services_cache", Array.isArray(servicesPayload) ? servicesPayload : []);
      })
        .catch(() => setServices([]));
      setMessage("Data refreshed");
    } catch (error) {
      if (!String(error?.message || "").toLowerCase().includes("timed out") || !registrations.length) {
        setMessage(error.message || "Could not refresh data");
      }
    } finally {
      setRefreshing(false);
    }
  }
}

async function fetchBridge(action, payload = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch("/api/bridge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
      cache: "no-store",
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Request timed out. Showing cached data when available.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
  const data = await readJsonResponse(response);
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || "Request failed");
  }
  return data.data;
}

function cacheJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore cache failures
  }
}

function readCachedJson(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
