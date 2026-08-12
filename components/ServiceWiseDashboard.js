"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AVAILABILITY_COLUMNS, buildExcelDownload, buildImageUrl, dedupeRegistrations, readJsonResponse } from "@/components/registryUtils";
import PortalNav from "@/components/PortalNav";

const REQUEST_TIMEOUT_MS = 120000;
const SERVICES_CACHE_KEY = "skjvcc_services_cache";
const SERVICE_ROWS_CACHE_KEY = "skjvcc_service_rows_cache";

function emptyImage() {
  return { open: false, loading: false, src: "", title: "", error: "" };
}

export default function ServiceWiseDashboard() {
  const [services, setServices] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [selectedService, setSelectedService] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [viewer, setViewer] = useState(emptyImage());

  useEffect(() => {
    let alive = true;

    async function loadData() {
      const cachedServices = readCachedServices();
      if (cachedServices.length) {
        setServices(cachedServices);
      }
      const cachedRows = readCachedRows();
      if (cachedRows.length) {
        setRegistrations(dedupeRegistrations(cachedRows));
      }

      try {
        const [servicesPayload, registrationsPayload] = await Promise.all([
          fetchBridge("services.list"),
          fetchBridge("registrations.list")
        ]);
        if (!alive) return;
        const nextServices = Array.isArray(servicesPayload) ? servicesPayload : [];
        const nextRegistrations = dedupeRegistrations(Array.isArray(registrationsPayload) ? registrationsPayload : []);
        setServices(nextServices);
        setRegistrations(nextRegistrations);
        writeCachedServices(nextServices);
        writeCachedRows(nextRegistrations);
      } catch (error) {
        if (alive) {
          if (!cachedServices.length) {
            setServices([]);
            setMessage(error.message || "Could not load services");
          }
          if (!cachedRows.length) {
            setRegistrations([]);
          }
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadData();
    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(() => {
    if (!selectedService) return [];
    return registrations.filter((row) => String(row.assignedService || "").trim() === selectedService);
  }, [registrations, selectedService]);

  const selectedMeta = useMemo(
    () => services.find((service) => service.serviceName === selectedService) || null,
    [services, selectedService]
  );

  const serviceStats = useMemo(() => {
    const required = Number(selectedMeta?.requiredCount || 0);
    const allocated = rows.length;
    return {
      required,
      allocated,
      remaining: Math.max(required - allocated, 0)
    };
  }, [selectedMeta, rows.length]);

  function downloadExcel() {
    const headers = [
      "Full Name",
      "Age",
      "Category",
      "Mobile Number",
      "Devotee in Touch",
      "Area of Staying in Vizag",
      ...AVAILABILITY_COLUMNS,
      "Assigned Service"
    ];
    const excelRows = rows.map((row, index) => [
      row.fullName || "",
      row.age || "",
      row.assignedCategory || "",
      row.mobileNumber || "",
      row.devoteeInTouch || "",
      row.areaOfStay || "",
      ...AVAILABILITY_COLUMNS.map((column) => (row.availabilityMap?.[column] ? "Available" : "Not available")),
      row.assignedService || ""
    ]);
    buildExcelDownload(`${selectedService || "service"}-volunteers.xls`, headers, excelRows);
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
          <h1>Service wise view</h1>
          <p className="subtle">
            Pick a service, review the assigned volunteers, and export the list as Excel.
          </p>
        </div>
        <PortalNav />
      </header>

      <section className="panel">
        <div className="form-grid compact-form">
          <label className="field wide">
            <span>Service</span>
            <select value={selectedService} onChange={(event) => setSelectedService(event.target.value)}>
              <option value="">Select a service</option>
              {services.map((service) => (
                <option key={service.serviceName} value={service.serviceName}>
                  {service.serviceName}
                </option>
              ))}
            </select>
          </label>
          <div className="actions">
            <button type="button" onClick={downloadExcel} disabled={!rows.length || !selectedService}>
              Download as Excel
            </button>
          </div>
        </div>

        {selectedMeta ? (
          <div className="stack">
            <div className="service-meta">
            <div><span>Coordinator</span><strong>{selectedMeta.coordinatorName || "-"}</strong></div>
            <div><span>Contact</span><strong>{selectedMeta.contactNumber || "-"}</strong></div>
            <div><span>Reporting time</span><strong>{selectedMeta.reportingTime || "-"}</strong></div>
            <div><span>Required</span><strong>{selectedMeta.requiredCount || 0}</strong></div>
            </div>
            <div className="summary-strip service-summary-strip">
              <div>
                <span>Required</span>
                <strong>{serviceStats.required}</strong>
              </div>
              <div>
                <span>Allocated</span>
                <strong>{serviceStats.allocated}</strong>
              </div>
              <div>
                <span>Remaining</span>
                <strong>{serviceStats.remaining}</strong>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {message ? <section className="notice">{message}</section> : null}

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Assigned volunteers</h2>
            <p className="subtle-dark">This view is filtered by the selected service.</p>
          </div>
        </div>

        {!selectedService ? (
          <div className="empty-state">Choose a service to load the assigned volunteers.</div>
        ) : rows.length ? (
          <div className="stack">
            <div className="table-wrap">
              <table className="data-table service-wise-table">
                <thead>
                <tr>
                  <th>Full Name</th>
                  <th>Mobile Number</th>
                  <th>Age</th>
                  <th>Category</th>
                  <th>Area of Staying in Vizag</th>
                  {AVAILABILITY_COLUMNS.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                  <th>Photo</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                  <tr key={row.sourceRow || `${row.mobileNumber}-${index}`}>
                    <td>{row.fullName || "-"}</td>
                    <td>{row.mobileNumber || "-"}</td>
                    <td>{row.age || "-"}</td>
                    <td>{row.assignedCategory || "-"}</td>
                    <td>{row.areaOfStay || "-"}</td>
                    {AVAILABILITY_COLUMNS.map((column) => (
                      <td key={`${row.sourceRow}-${column}`}>
                          <span className={row.availabilityMap?.[column] ? "badge badge-yes" : "badge badge-no"}>
                            {row.availabilityMap?.[column] ? "Available" : "Not available"}
                          </span>
                        </td>
                      ))}
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : loading ? (
          <div className="empty-state">Loading service volunteers...</div>
        ) : (
          <div className="empty-state">No volunteers are assigned to this service yet.</div>
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

function readCachedServices() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SERVICES_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCachedServices(services) {
  try {
    window.localStorage.setItem(SERVICES_CACHE_KEY, JSON.stringify(Array.isArray(services) ? services : []));
  } catch {
    // Ignore cache failures.
  }
}

function readCachedRows() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SERVICE_ROWS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCachedRows(rows) {
  try {
    window.localStorage.setItem(SERVICE_ROWS_CACHE_KEY, JSON.stringify(Array.isArray(rows) ? rows : []));
  } catch {
    // Ignore cache failures.
  }
}
