"use client";

import { useEffect, useMemo, useState } from "react";
import { AVAILABILITY_COLUMNS, annotateDuplicateRegistrations, buildImageUrl, isAssignedRegistration, mergeRegistrationRecord, readJsonResponse } from "@/components/registryUtils";
import ServiceDropdown from "@/components/ServiceDropdown";
import PortalNav from "@/components/PortalNav";

const REQUEST_TIMEOUT_MS = 120000;

function emptyImage() {
  return { open: false, loading: false, src: "", title: "", error: "" };
}

export default function RegistrationsDashboard() {
  const [registrations, setRegistrations] = useState([]);
  const [services, setServices] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState({});
  const [savingRow, setSavingRow] = useState(null);
  const [deletingRow, setDeletingRow] = useState(null);
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
          const message = String(error?.message || "");
          if (!silent && (!message.toLowerCase().includes("timed out") || !registrations.length)) {
            setMessage(message && !message.toLowerCase().includes("timed out") ? message : "Could not load registrations");
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

  const annotatedRegistrations = useMemo(() => annotateDuplicateRegistrations(registrations), [registrations]);

  const filteredRegistrations = useMemo(() => {
    const terms = String(search || "")
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (!terms.length) return annotatedRegistrations;
    return annotatedRegistrations.filter((row) => {
      const fields = [row.fullName, row.mobileNumber]
        .map((item) => String(item || "").toLowerCase())
        .filter(Boolean);

      return terms.every((term) =>
        fields.some((field) => {
          if (!term) return false;
          if (field.includes(term)) return true;
          return field.split(/\s+/).some((part) => part === term);
        })
      );
    });
  }, [annotatedRegistrations, search]);

  const liveRegistrations = useMemo(
    () => filteredRegistrations.filter((row) => !isAssignedRegistration(row)),
    [filteredRegistrations]
  );

  const liveFilteredRegistrations = useMemo(() => {
    const filters = columnFilters;
    const textFilterFields = [
      { key: "fullName", value: (row) => row.fullName },
      { key: "age", value: (row) => row.age },
      { key: "mobileNumber", value: (row) => row.mobileNumber },
      { key: "devoteeInTouch", value: (row) => row.devoteeInTouch },
      { key: "areaOfStay", value: (row) => row.areaOfStay },
      { key: "service", value: (row) => row.assignedService || "" },
      { key: "category", value: (row) => row.assignedCategory || "" }
    ];

    return liveRegistrations.filter((row) => {
      for (const field of textFilterFields) {
        const filterValue = normalizeFilterValue(filters[field.key]);
        if (!filterValue) continue;
        const rowValue = String(field.value(row) || "").toLowerCase();
        if (!rowValue.includes(filterValue)) return false;
      }

      for (let i = 0; i < AVAILABILITY_COLUMNS.length; i++) {
        const column = AVAILABILITY_COLUMNS[i];
        const filterValue = normalizeFilterValue(filters[`availability-${i}`]);
        if (!filterValue) continue;
        const available = Boolean(row.availabilityFlags?.[i]?.available);
        if (filterValue === "available" && !available) return false;
        if (filterValue === "not available" && available) return false;
      }

      const photoFilter = normalizeFilterValue(filters.photo);
      if (photoFilter) {
        const hasPhoto = Boolean(row.photoUpload);
        if (photoFilter === "has photo" && !hasPhoto) return false;
        if (photoFilter === "no photo" && hasPhoto) return false;
      }

      return true;
    });
  }, [columnFilters, liveRegistrations]);

  const totals = useMemo(() => {
    const assigned = registrations.filter((row) => isAssignedRegistration(row)).length;
    return {
      total: registrations.length,
      assigned,
      unassigned: registrations.length - assigned
    };
  }, [registrations]);

  const activeFilterCount = useMemo(
    () =>
      Object.values(columnFilters).filter((value) => String(value || "").trim() !== "").length,
    [columnFilters]
  );

  const serviceOptions = useMemo(() => {
    const seen = new Set();
    const next = [];
    for (const service of services) {
      const serviceName = String(service?.serviceName || "").trim();
      if (!serviceName) continue;
      const key = serviceName.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      next.push(serviceName);
    }
    next.sort((left, right) =>
      left.localeCompare(right, undefined, {
        sensitivity: "base",
        numeric: true
      })
    );
    return next;
  }, [services]);

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
      const response = await fetchBridge("registrations.assignService", {
        sourceRow: row.sourceRow,
        mobileNumber: row.mobileNumber,
        serviceName,
        category
      });
      const savedRegistration = response?.registration || {
        ...row,
        assignedService: serviceName,
        assignedCategory: category || row.assignedCategory || "",
        assignmentFlag: "Yes"
      };
      const nextRegistrations = mergeRegistrationRecord(registrations, savedRegistration);
      setRegistrations(nextRegistrations);
      cacheJson("skjvcc_registrations_cache", nextRegistrations);
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

  async function deleteDuplicateRegistration(row) {
    if (!row?.isDuplicate) return;
    const label = row.fullName || row.mobileNumber || "this duplicate registration";
    if (!window.confirm(`Delete duplicate registration for ${label}?`)) return;

    setDeletingRow(row.sourceRow);
    setMessage("");
    try {
      await fetchBridge("registrations.delete", {
        sourceRow: row.sourceRow,
        responseKey: row.responseKey,
        fullName: row.fullName,
        mobileNumber: row.mobileNumber,
        age: row.age
      });
      const registrationsPayload = await fetchBridge("registrations.list");
      const next = Array.isArray(registrationsPayload) ? registrationsPayload : [];
      setRegistrations(next);
      cacheJson("skjvcc_registrations_cache", next);
      setMessage("Duplicate registration deleted.");
    } catch (error) {
      setMessage(error.message || "Could not delete registration");
    } finally {
      setDeletingRow(null);
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
          {activeFilterCount ? (
            <button
              type="button"
              className="secondary tiny-button"
              onClick={() => setColumnFilters({})}
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {liveFilteredRegistrations.length ? (
          <div className="table-wrap">
              <table className="data-table live-registrations-table">
              <thead>
                <tr>
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
                <tr className="table-filter-row">
                  <th>
                    <input
                      className="table-filter-input"
                      value={columnFilters.fullName || ""}
                      onChange={(event) =>
                        setColumnFilters((current) => ({ ...current, fullName: event.target.value }))
                      }
                      placeholder="Filter"
                    />
                  </th>
                  <th>
                    <input
                      className="table-filter-input"
                      value={columnFilters.age || ""}
                      onChange={(event) =>
                        setColumnFilters((current) => ({ ...current, age: event.target.value }))
                      }
                      placeholder="Filter"
                    />
                  </th>
                  <th>
                    <input
                      className="table-filter-input"
                      value={columnFilters.mobileNumber || ""}
                      onChange={(event) =>
                        setColumnFilters((current) => ({ ...current, mobileNumber: event.target.value }))
                      }
                      placeholder="Filter"
                    />
                  </th>
                  <th>
                    <input
                      className="table-filter-input"
                      value={columnFilters.devoteeInTouch || ""}
                      onChange={(event) =>
                        setColumnFilters((current) => ({ ...current, devoteeInTouch: event.target.value }))
                      }
                      placeholder="Filter"
                    />
                  </th>
                  <th>
                    <input
                      className="table-filter-input"
                      value={columnFilters.areaOfStay || ""}
                      onChange={(event) =>
                        setColumnFilters((current) => ({ ...current, areaOfStay: event.target.value }))
                      }
                      placeholder="Filter"
                    />
                  </th>
                  {AVAILABILITY_COLUMNS.map((column, index) => (
                    <th key={`filter-${column}`}>
                      <select
                        className="table-filter-select"
                        value={columnFilters[`availability-${index}`] || ""}
                        onChange={(event) =>
                          setColumnFilters((current) => ({
                            ...current,
                            [`availability-${index}`]: event.target.value
                          }))
                        }
                      >
                        <option value="">All</option>
                        <option value="available">Available</option>
                        <option value="not available">Not available</option>
                      </select>
                    </th>
                  ))}
                  <th>
                    <select
                      className="table-filter-select"
                      value={columnFilters.photo || ""}
                      onChange={(event) =>
                        setColumnFilters((current) => ({ ...current, photo: event.target.value }))
                      }
                    >
                      <option value="">All</option>
                      <option value="has photo">Has photo</option>
                      <option value="no photo">No photo</option>
                    </select>
                  </th>
                  <th>
                    <input
                      className="table-filter-input"
                      value={columnFilters.service || ""}
                      onChange={(event) =>
                        setColumnFilters((current) => ({ ...current, service: event.target.value }))
                      }
                      placeholder="Filter"
                    />
                  </th>
                  <th>
                    <input
                      className="table-filter-input"
                      value={columnFilters.category || ""}
                      onChange={(event) =>
                        setColumnFilters((current) => ({ ...current, category: event.target.value }))
                      }
                      placeholder="Filter"
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {liveFilteredRegistrations.map((row) => {
                  const draft = assignmentDrafts[row.sourceRow] || {};
                  return (
                    <tr key={row.sourceRow} className={row.isDuplicate ? "duplicate-registration-row" : ""}>
                      <td className="registration-name-cell">
                        <div className="registration-name-stack">
                          {row.isDuplicate ? (
                            <div className="duplicate-row-tools">
                              <span className="duplicate-badge">Duplicate</span>
                              <button
                                type="button"
                                className="secondary tiny-button duplicate-delete-button"
                                onClick={() => deleteDuplicateRegistration(row)}
                                disabled={deletingRow === row.sourceRow}
                              >
                                {deletingRow === row.sourceRow ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                          ) : null}
                          <span>{row.fullName || "-"}</span>
                        </div>
                      </td>
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
                              className="category-select"
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
            {refreshing
              ? "Loading latest registrations..."
              : liveRegistrations.length
                ? "No registrations match the current filters."
                : "No registrations found yet."}
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
      const nextRegistrations = Array.isArray(registrationsPayload) ? registrationsPayload : [];
      setRegistrations(nextRegistrations);
      cacheJson("skjvcc_registrations_cache", nextRegistrations);
      fetchBridge("services.list")
        .then((servicesPayload) => {
          setServices(Array.isArray(servicesPayload) ? servicesPayload : []);
          cacheJson("skjvcc_services_cache", Array.isArray(servicesPayload) ? servicesPayload : []);
      })
        .catch(() => setServices([]));
      setMessage("Data refreshed");
    } catch (error) {
      const message = String(error?.message || "");
      if (!message.toLowerCase().includes("timed out") || !registrations.length) {
        setMessage(message && !message.toLowerCase().includes("timed out") ? message : "Could not refresh data");
      }
    } finally {
      setRefreshing(false);
    }
  }

  function normalizeFilterValue(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
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
      throw new Error("Could not load data right now. Please try again.");
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
