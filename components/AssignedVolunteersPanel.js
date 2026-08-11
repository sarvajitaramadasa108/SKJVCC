"use client";

import { useEffect, useMemo, useState } from "react";
import { AVAILABILITY_COLUMNS, buildImageUrl, readJsonResponse } from "@/components/registryUtils";

const REQUEST_TIMEOUT_MS = 30000;

function emptyImage() {
  return { open: false, loading: false, src: "", title: "", error: "" };
}

export default function AssignedVolunteersPanel() {
  const [registrations, setRegistrations] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingRow, setSavingRow] = useState(null);
  const [message, setMessage] = useState("");
  const [viewer, setViewer] = useState(emptyImage());
  const [editingRow, setEditingRow] = useState(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const [registrationsPayload, servicesPayload] = await Promise.all([
          fetchBridge("registrations.list"),
          fetchBridge("services.list")
        ]);
        if (!alive) return;
        setRegistrations(Array.isArray(registrationsPayload) ? registrationsPayload : []);
        setServices(Array.isArray(servicesPayload) ? servicesPayload : []);
      } catch (error) {
        if (alive) {
          setMessage(error.message || "Could not load assigned volunteers");
          setRegistrations([]);
          setServices([]);
        }
      } finally {
        if (alive) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  const assignedRegistrations = useMemo(
    () => registrations.filter((row) => String(row.assignedService || "").trim()),
    [registrations]
  );

  async function refreshNow() {
    setRefreshing(true);
    setMessage("");
    try {
      const [registrationsPayload, servicesPayload] = await Promise.all([
        fetchBridge("registrations.list"),
        fetchBridge("services.list")
      ]);
      setRegistrations(Array.isArray(registrationsPayload) ? registrationsPayload : []);
      setServices(Array.isArray(servicesPayload) ? servicesPayload : []);
    } catch (error) {
      setMessage(error.message || "Could not refresh assigned volunteers");
    } finally {
      setRefreshing(false);
    }
  }

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
      loading: false,
      src: directImageUrl || "",
      title: row.fullName || row.mobileNumber || "Volunteer photo",
      error: directImageUrl ? "" : "No image available."
    });
  }

  return (
    <section className="panel table-panel">
      <div className="panel-head">
        <div>
          <h2>Assigned volunteers</h2>
          <p className="subtle-dark">These volunteers already have a service and can be edited here.</p>
        </div>
        <div className="actions">
          <button type="button" onClick={refreshNow} disabled={refreshing}>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {message ? <section className="notice">{message}</section> : null}

      {loading ? (
        <div className="empty-state">Loading assigned volunteers...</div>
      ) : assignedRegistrations.length ? (
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
              {assignedRegistrations.map((row) => {
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
                        {savingRow === row.sourceRow ? (
                          <div className="saving-pill">
                            <span className="loading-spinner" aria-hidden="true" />
                            <span>Saving...</span>
                          </div>
                        ) : row.assignedService && !isEditing ? (
                          <>
                            <strong className="service-name-large">{row.assignedService}</strong>
                            <button
                              type="button"
                              className="link-button link-button-small"
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
                              <button
                                type="button"
                                className="link-button link-button-small"
                                onClick={() => setEditingRow(null)}
                              >
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
        <div className="empty-state">No assigned volunteers yet.</div>
      )}

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
            {viewer.src ? (
              <img className="image-modal-img" src={viewer.src} alt={viewer.title} />
            ) : (
              <div className="empty-state">{viewer.error || "No image available."}</div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

async function fetchBridge(action, payload = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch("/api/bridge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
      cache: "no-store",
      signal: controller.signal
    });
    const data = await readJsonResponse(response);
    if (!response.ok || data?.ok === false) {
      throw new Error(data?.error || "Request failed");
    }
    return data.data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
