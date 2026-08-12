"use client";

import { useEffect, useMemo, useState } from "react";
import PortalNav from "@/components/PortalNav";
import { buildImageUrl, readJsonResponse } from "@/components/registryUtils";

const SERVICES_CACHE_KEY = "skjvcc_services_cache";

function emptyImage() {
  return { open: false, loading: false, src: "", title: "", error: "" };
}

export default function ServiceMasterDashboard() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [viewer, setViewer] = useState(emptyImage());

  useEffect(() => {
    let alive = true;

    async function loadServices() {
      try {
        const cached = readCachedJson(SERVICES_CACHE_KEY);
        if (cached.length) setServices(cached);

        const payload = await fetchServicesFresh();
        if (!alive) return;
        setServices(payload);
        writeCachedJson(SERVICES_CACHE_KEY, payload);
        setMessage("");
      } catch (error) {
        if (alive) {
          if (!readCachedJson(SERVICES_CACHE_KEY).length) setServices([]);
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

  const rows = useMemo(() => {
    return services.map((service, index) => ({
      id: service.rowNumber || service.serviceName || `service-${index}`,
      serialNo: index + 1,
      serviceName: service.serviceName || "-",
      coordinatorName: service.coordinatorName || "-",
      contactNumber: service.contactNumber || "-",
      reportingTime: service.reportingTime || "-",
      photoUrl: service.photoUrl || "",
      requiredCongCount: Number(service.requiredCongCount || 0),
      requiredFolkCount: Number(service.requiredFolkCount || 0),
      requiredEmpCount: Number(service.requiredEmpCount || 0)
    }));
  }, [services]);

  async function refreshNow() {
    setRefreshing(true);
    setMessage("");
    try {
      const payload = await fetchServicesFresh();
      setServices(payload);
      writeCachedJson(SERVICES_CACHE_KEY, payload);
      setMessage("Service Master refreshed.");
    } catch (error) {
      setMessage(error.message || "Could not refresh services");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }

  async function openPhotoPreview(row) {
    const directImageUrl = buildImageUrl(row.photoUrl, "preview");
    setViewer({
      open: true,
      loading: true,
      src: "",
      title: row.serviceName || "Service photo",
      error: ""
    });

    setViewer((current) => ({
      ...current,
      loading: false,
      src: directImageUrl || "",
      error: directImageUrl ? "" : "No image available."
    }));
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SKJVCC Volunteer Portal</p>
          <h1>Services Master</h1>
          <p className="subtle">All Service Master rows with coordinator details, photo preview, and volunteer requirements.</p>
        </div>
        <PortalNav />
      </header>

      {message ? <section className="notice">{message}</section> : null}

      <section className="panel table-panel assignment-status-panel service-master-panel">
        <div className="panel-head assignment-status-head">
          <div className="panel-head-row">
            <div>
              <h2>Service master table</h2>
              <p className="subtle-dark">Values are read from the Service Master sheet and refreshed from the live bridge.</p>
            </div>
            <div className="actions">
              <button type="button" onClick={refreshNow} disabled={loading || refreshing}>
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
        </div>

        {loading && !rows.length ? (
          <div className="empty-state">Loading services...</div>
        ) : rows.length ? (
          <div className="table-wrap assignment-table-wrap service-master-table-wrap">
            <table className="summary-table assignment-table service-master-table">
              <thead>
                <tr>
                  <th>Service Name</th>
                  <th>Service Coordinator</th>
                  <th>Contact Number</th>
                  <th>Reporting Time</th>
                  <th>Photo</th>
                  <th>No. of Req Cong Volunteers</th>
                  <th>No. of Req FOLK Volunteers</th>
                  <th>No. of Req Emp Volunteers</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.serviceName}</strong></td>
                    <td>{row.coordinatorName}</td>
                    <td>{row.contactNumber}</td>
                    <td>{row.reportingTime}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary tiny-button"
                        onClick={() => openPhotoPreview(row)}
                        disabled={!row.photoUrl}
                      >
                        View Image
                      </button>
                    </td>
                    <td>{row.requiredCongCount}</td>
                    <td>{row.requiredFolkCount}</td>
                    <td>{row.requiredEmpCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">No services found in Service Master.</div>
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

function readCachedJson(key) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCachedJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : []));
  } catch {
    // Ignore cache failures.
  }
}

async function fetchServicesFresh() {
  const response = await fetch("/api/bridge?action=services.list", { cache: "no-store" });
  const payload = await readJsonResponse(response);
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || "Could not load services");
  }
  return Array.isArray(payload.data) ? payload.data : [];
}
