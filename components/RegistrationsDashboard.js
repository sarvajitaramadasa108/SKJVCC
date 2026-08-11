"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AVAILABILITY_COLUMNS, buildImageUrl, readJsonResponse } from "@/components/registryUtils";

function emptyImage() {
  return { open: false, loading: false, src: "", title: "", error: "" };
}

export default function RegistrationsDashboard() {
  const [registrations, setRegistrations] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [editingRow, setEditingRow] = useState(null);
  const [savingRow, setSavingRow] = useState(null);
  const [viewer, setViewer] = useState(emptyImage());

  useEffect(() => {
    let alive = true;

    async function loadRegistrations() {
      try {
        const registrationsPayload = await fetchBridge("registrations.list");
        if (!alive) return;
        setRegistrations(Array.isArray(registrationsPayload) ? registrationsPayload : []);
      } catch (error) {
        if (alive) {
          setMessage(error.message || "Could not load registrations");
          setRegistrations([]);
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    async function loadServices() {
      try {
        const servicesPayload = await fetchBridge("services.list");
        if (!alive) return;
        setServices(Array.isArray(servicesPayload) ? servicesPayload : []);
      } catch {
        if (alive) setServices([]);
      }
    }

    loadRegistrations();
    loadServices();

    return () => {
      alive = false;
    };
  }, []);

  const filteredRegistrations = useMemo(() => {
    const term = String(search || "").trim().toLowerCase();
    if (!term) return registrations;
    return registrations.filter((row) => {
      const haystack = [
        row.fullName,
        row.mobileNumber,
        row.gender,
        row.areaOfStay,
        row.assignedService,
        row.devoteeInTouch
      ]
        .map((item) => String(item || "").toLowerCase())
        .join(" ");
      return haystack.includes(term);
    });
  }, [registrations, search]);

  const totals = useMemo(() => {
    const assigned = registrations.filter((row) => String(row.assignedService || "").trim()).length;
    return {
      total: registrations.length,
      assigned,
      unassigned: registrations.length - assigned
    };
  }, [registrations]);

  async function handleAssignService(row, nextService) {
    if (!nextService) return;
    setSavingRow(row.sourceRow);
    setMessage("");
    try {
      const payload = await fetchBridge("registrations.assignService", {
        sourceRow: row.sourceRow,
        mobileNumber: row.mobileNumber,
        serviceName: nextService
      });
      const updated = payload?.registration || null;
      if (updated) {
        setRegistrations((current) =>
          current.map((item) => (item.sourceRow === row.sourceRow ? updated : item))
        );
      } else {
        setRegistrations((current) =>
          current.map((item) =>
            item.sourceRow === row.sourceRow ? { ...item, assignedService: nextService } : item
          )
        );
      }
      setEditingRow(null);
      setMessage(`Assigned ${nextService} to ${row.fullName || row.mobileNumber || "registration"}`);
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
        <nav className="topnav">
          <Link href="/">Home</Link>
          <Link href="/dashboard/service-wise">Service Wise View</Link>
        </nav>
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
            <h2>Volunteer table</h2>
            <p className="subtle-dark">Use the action column to preview photos and assign services inline.</p>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">Loading registrations...</div>
        ) : filteredRegistrations.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>S No</th>
                  <th>Full Name</th>
                  <th>Age</th>
                  <th>Gender</th>
                  <th>Mobile Number</th>
                  <th>Devotee in Touch</th>
                  <th>Area of Staying in Vizag</th>
                  {AVAILABILITY_COLUMNS.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                  <th>Photo</th>
                  <th>Service</th>
                </tr>
              </thead>
              <tbody>
                {filteredRegistrations.map((row) => {
                  const isEditing = editingRow === row.sourceRow;
                  const serviceOptions = services.map((service) => service.serviceName).filter(Boolean);
                  return (
                    <tr key={row.sourceRow}>
                      <td>{row.serialNo || row.sourceRow || "-"}</td>
                      <td>{row.fullName || "-"}</td>
                      <td>{row.age || "-"}</td>
                      <td>{row.gender || "-"}</td>
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
                          {row.assignedService && !isEditing ? (
                            <>
                              <strong>{row.assignedService}</strong>
                              <button
                                type="button"
                                className="link-button"
                                onClick={() => setEditingRow(row.sourceRow)}
                              >
                                Change service
                              </button>
                            </>
                          ) : (
                            <>
                              <select
                                value={row.assignedService || ""}
                                onChange={(event) => handleAssignService(row, event.target.value)}
                                disabled={savingRow === row.sourceRow || !serviceOptions.length}
                              >
                                <option value="">{serviceOptions.length ? "Assign service" : "No services yet"}</option>
                                {serviceOptions.map((serviceName) => (
                                  <option key={serviceName} value={serviceName}>
                                    {serviceName}
                                  </option>
                                ))}
                              </select>
                              {row.assignedService ? (
                                <button type="button" className="link-button" onClick={() => setEditingRow(null)}>
                                  Cancel
                                </button>
                              ) : null}
                            </>
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
          <div className="empty-state">No registrations found yet.</div>
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
      fetchBridge("services.list")
        .then((servicesPayload) => {
          setServices(Array.isArray(servicesPayload) ? servicesPayload : []);
        })
        .catch(() => setServices([]));
      setMessage("Data refreshed");
    } catch (error) {
      setMessage(error.message || "Could not refresh data");
    } finally {
      setRefreshing(false);
    }
  }
}

async function fetchBridge(action, payload = {}) {
  const response = await fetch("/api/bridge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
    cache: "no-store"
  });
  const data = await readJsonResponse(response);
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || "Request failed");
  }
  return data.data;
}
