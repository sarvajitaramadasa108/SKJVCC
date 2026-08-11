"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AVAILABILITY_COLUMNS, buildExcelDownload, fetchPhotoDataUrl, readJsonResponse } from "@/components/registryUtils";

function emptyImage() {
  return { open: false, loading: false, src: "", title: "", error: "" };
}

export default function ServiceWiseDashboard() {
  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [viewer, setViewer] = useState(emptyImage());

  useEffect(() => {
    let alive = true;

    async function loadServices() {
      try {
        const payload = await fetchBridge("services.list");
        if (!alive) return;
        setServices(Array.isArray(payload) ? payload : []);
      } catch (error) {
        if (alive) {
          setServices([]);
          setMessage(error.message || "Could not load services");
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadServices();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedService) {
      setRows([]);
      return;
    }

    let alive = true;

    async function loadRows() {
      try {
        setWorking(true);
        const payload = await fetchBridge("registrations.byService", { serviceName: selectedService });
        if (!alive) return;
        setRows(Array.isArray(payload) ? payload : []);
      } catch (error) {
        if (alive) {
          setRows([]);
          setMessage(error.message || "Could not load service volunteers");
        }
      } finally {
        if (alive) setWorking(false);
      }
    }

    loadRows();

    return () => {
      alive = false;
    };
  }, [selectedService]);

  const selectedMeta = useMemo(
    () => services.find((service) => service.serviceName === selectedService) || null,
    [services, selectedService]
  );

  function downloadExcel() {
    const headers = [
      "S No",
      "Full Name",
      "Age",
      "Gender",
      "Mobile Number",
      "Devotee in Touch",
      "Area of Staying in Vizag",
      ...AVAILABILITY_COLUMNS,
      "Assigned Service"
    ];
    const excelRows = rows.map((row, index) => [
      index + 1,
      row.fullName || "",
      row.age || "",
      row.gender || "",
      row.mobileNumber || "",
      row.devoteeInTouch || "",
      row.areaOfStay || "",
      ...AVAILABILITY_COLUMNS.map((column) => (row.availabilityMap?.[column] ? "Available" : "Not available")),
      row.assignedService || ""
    ]);
    buildExcelDownload(`${selectedService || "service"}-volunteers.xls`, headers, excelRows);
  }

  async function openPhotoPreview(row) {
    setViewer({
      open: true,
      loading: true,
      src: "",
      title: row.fullName || row.mobileNumber || "Volunteer photo",
      error: ""
    });

    try {
      const src = await fetchPhotoDataUrl(row.photoUpload);
      setViewer((current) => ({ ...current, loading: false, src }));
    } catch (error) {
      setViewer((current) => ({
        ...current,
        loading: false,
        error: error.message || "Could not load photo"
      }));
    }
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
        <nav className="topnav">
          <Link href="/">Home</Link>
          <Link href="/dashboard/registrations">Live Registrations</Link>
        </nav>
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
            <button type="button" onClick={downloadExcel} disabled={!rows.length || working || !selectedService}>
              Download as Excel
            </button>
          </div>
        </div>

        {selectedMeta ? (
          <div className="service-meta">
            <div><span>Coordinator</span><strong>{selectedMeta.coordinatorName || "-"}</strong></div>
            <div><span>Contact</span><strong>{selectedMeta.contactNumber || "-"}</strong></div>
            <div><span>Reporting time</span><strong>{selectedMeta.reportingTime || "-"}</strong></div>
            <div><span>Required</span><strong>{selectedMeta.requiredCount || 0}</strong></div>
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
        ) : loading || working ? (
          <div className="empty-state">Loading service volunteers...</div>
        ) : rows.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>S No</th>
                  <th>Full Name</th>
                  <th>Mobile Number</th>
                  <th>Gender</th>
                  <th>Age</th>
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
                    <td>{index + 1}</td>
                    <td>{row.fullName || "-"}</td>
                    <td>{row.mobileNumber || "-"}</td>
                    <td>{row.gender || "-"}</td>
                    <td>{row.age || "-"}</td>
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
