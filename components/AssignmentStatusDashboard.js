"use client";

import { useEffect, useMemo, useState } from "react";
import PortalNav from "@/components/PortalNav";
import { readJsonResponse } from "@/components/registryUtils";

const SERVICES_CACHE_KEY = "skjvcc_services_cache";

export default function AssignmentStatusDashboard() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingService, setSavingService] = useState("");
  const [message, setMessage] = useState("");
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    let alive = true;

    async function loadData() {
      try {
        const cachedServices = readCachedJson(SERVICES_CACHE_KEY);
        if (cachedServices.length) {
          setServices(cachedServices);
          setDrafts(buildDraftMap(cachedServices));
        }

        const nextServices = await fetchServicesFresh();
        if (!alive) return;
        setServices(nextServices);
        setDrafts(buildDraftMap(nextServices));
        writeCachedJson(SERVICES_CACHE_KEY, nextServices);
        setMessage("");
      } catch (error) {
        if (alive) {
          if (!readCachedJson(SERVICES_CACHE_KEY).length) setServices([]);
          setMessage(error.message || "Could not load assignment status");
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
    return services.map((service, index) => {
      const required = {
        FOLK: Number(service.requiredFolkCount || 0),
        Congregation: Number(service.requiredCongCount || 0),
        Employee: Number(service.requiredEmpCount || 0)
      };
      const allocated = {
        FOLK: Number(service.allocatedFolkCount || 0),
        Congregation: Number(service.allocatedCongCount || 0),
        Employee: Number(service.allocatedEmpCount || 0)
      };

      return {
        id: service.serviceName || `service-${index}`,
        serialNo: index + 1,
        serviceName: service.serviceName || "-",
        required,
        allocated,
        pending: {
          FOLK: Math.max(required.FOLK - allocated.FOLK, 0),
          Congregation: Math.max(required.Congregation - allocated.Congregation, 0),
          Employee: Math.max(required.Employee - allocated.Employee, 0)
        },
        active: service.active !== false
      };
    });
  }, [services]);

  async function refreshNow() {
    setRefreshing(true);
    setMessage("");
    try {
      const nextServices = await fetchServicesFresh();
      setServices(nextServices);
      setDrafts((current) => ({
        ...current,
        ...buildDraftMap(nextServices)
      }));
      writeCachedJson(SERVICES_CACHE_KEY, nextServices);
      setMessage("Assignment status refreshed.");
    } catch (error) {
      setMessage(error.message || "Could not refresh assignment status");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }

  function handleDraftChange(serviceName, field, value) {
    setDrafts((current) => ({
      ...current,
      [serviceName]: {
        ...(current[serviceName] || {}),
        [field]: value
      }
    }));
  }

  async function saveRow(row) {
    const serviceName = row.serviceName;
    const draft = drafts[serviceName] || {};
    const payload = {
      serviceName,
      requiredCongCount: toNumber(draft.requiredCongCount ?? row.required.Congregation),
      requiredFolkCount: toNumber(draft.requiredFolkCount ?? row.required.FOLK),
      requiredEmpCount: toNumber(draft.requiredEmpCount ?? row.required.Employee),
      allocatedCongCount: toNumber(draft.allocatedCongCount ?? row.allocated.Congregation),
      allocatedFolkCount: toNumber(draft.allocatedFolkCount ?? row.allocated.FOLK),
      allocatedEmpCount: toNumber(draft.allocatedEmpCount ?? row.allocated.Employee)
    };

    setSavingService(serviceName);
    setMessage("");
    try {
      const updated = await updateServiceCounts(payload);
      setServices((current) =>
        current.map((item) =>
          String(item.serviceName || "").trim() === serviceName
            ? {
                ...item,
                requiredCongCount: updated.requiredCongCount,
                requiredFolkCount: updated.requiredFolkCount,
                requiredEmpCount: updated.requiredEmpCount,
                allocatedCongCount: updated.allocatedCongCount,
                allocatedFolkCount: updated.allocatedFolkCount,
                allocatedEmpCount: updated.allocatedEmpCount
              }
            : item
        )
      );
      setDrafts((current) => ({
        ...current,
        [serviceName]: {
          requiredCongCount: updated.requiredCongCount,
          requiredFolkCount: updated.requiredFolkCount,
          requiredEmpCount: updated.requiredEmpCount,
          allocatedCongCount: updated.allocatedCongCount,
          allocatedFolkCount: updated.allocatedFolkCount,
          allocatedEmpCount: updated.allocatedEmpCount
        }
      }));
      setMessage(`Saved counts for ${serviceName}`);
    } catch (error) {
      setMessage(error.message || "Could not save counts");
    } finally {
      setSavingService("");
    }
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SKJVCC Volunteer Portal</p>
          <h1>Status of Assignment</h1>
          <p className="subtle">Required and allotted counts are editable per category and saved to Service Master.</p>
        </div>
        <PortalNav />
      </header>

      {message ? <section className="notice">{message}</section> : null}

      <section className="panel table-panel assignment-status-panel">
        <div className="panel-head assignment-status-head">
          <div className="panel-head-row">
            <div>
              <h2>Assignment status by service</h2>
              <p className="subtle-dark">
                Edit required and allotted counts directly. New live assignments increment the stored allotted counts.
              </p>
            </div>
            <div className="actions">
              <button type="button" onClick={refreshNow} disabled={loading || refreshing}>
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
        </div>

        {loading && !rows.length ? (
          <div className="empty-state">Loading assignment status...</div>
        ) : rows.length ? (
          <div className="table-wrap assignment-table-wrap">
            <table className="summary-table assignment-table status-table">
              <thead>
                <tr>
                  <th rowSpan="2" className="status-service-head">Service Name</th>
                  <th colSpan="3" className="status-group status-group-folk">FOLK</th>
                  <th colSpan="3" className="status-group status-group-congregation">Congregation</th>
                  <th colSpan="3" className="status-group status-group-employee">Employee</th>
                  <th rowSpan="2" className="status-service-head status-actions-head">Action</th>
                </tr>
                <tr>
                  <th className="status-subhead status-subhead-folk">Req</th>
                  <th className="status-subhead status-subhead-folk">Alloc</th>
                  <th className="status-subhead status-subhead-folk">Rem</th>
                  <th className="status-subhead status-subhead-congregation">Req</th>
                  <th className="status-subhead status-subhead-congregation">Alloc</th>
                  <th className="status-subhead status-subhead-congregation">Rem</th>
                  <th className="status-subhead status-subhead-employee">Req</th>
                  <th className="status-subhead status-subhead-employee">Alloc</th>
                  <th className="status-subhead status-subhead-employee">Rem</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const draft = drafts[row.serviceName] || {};
                  const isSaving = savingService === row.serviceName;
                  return (
                    <tr key={row.id}>
                      <td className="status-service-cell"><strong>{row.serviceName}</strong></td>
                      <td className="status-cell status-cell-folk">
                        <input
                          type="number"
                          min="0"
                          className="status-input status-input-folk"
                          value={draft.requiredFolkCount ?? row.required.FOLK}
                          onChange={(event) => handleDraftChange(row.serviceName, "requiredFolkCount", event.target.value)}
                        />
                      </td>
                      <td className="status-cell status-cell-folk">
                        <input
                          type="number"
                          min="0"
                          className="status-input status-input-folk"
                          value={draft.allocatedFolkCount ?? row.allocated.FOLK}
                          onChange={(event) => handleDraftChange(row.serviceName, "allocatedFolkCount", event.target.value)}
                        />
                      </td>
                      <td className="status-cell status-cell-folk"><strong>{row.pending.FOLK}</strong></td>
                      <td className="status-cell status-cell-congregation">
                        <input
                          type="number"
                          min="0"
                          className="status-input status-input-congregation"
                          value={draft.requiredCongCount ?? row.required.Congregation}
                          onChange={(event) => handleDraftChange(row.serviceName, "requiredCongCount", event.target.value)}
                        />
                      </td>
                      <td className="status-cell status-cell-congregation">
                        <input
                          type="number"
                          min="0"
                          className="status-input status-input-congregation"
                          value={draft.allocatedCongCount ?? row.allocated.Congregation}
                          onChange={(event) => handleDraftChange(row.serviceName, "allocatedCongCount", event.target.value)}
                        />
                      </td>
                      <td className="status-cell status-cell-congregation"><strong>{row.pending.Congregation}</strong></td>
                      <td className="status-cell status-cell-employee">
                        <input
                          type="number"
                          min="0"
                          className="status-input status-input-employee"
                          value={draft.requiredEmpCount ?? row.required.Employee}
                          onChange={(event) => handleDraftChange(row.serviceName, "requiredEmpCount", event.target.value)}
                        />
                      </td>
                      <td className="status-cell status-cell-employee">
                        <input
                          type="number"
                          min="0"
                          className="status-input status-input-employee"
                          value={draft.allocatedEmpCount ?? row.allocated.Employee}
                          onChange={(event) => handleDraftChange(row.serviceName, "allocatedEmpCount", event.target.value)}
                        />
                      </td>
                      <td className="status-cell status-cell-employee"><strong>{row.pending.Employee}</strong></td>
                      <td className="status-action-cell">
                        <button type="button" className="secondary tiny-button" onClick={() => saveRow(row)} disabled={isSaving}>
                          {isSaving ? "Saving..." : "Save"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">No services found in Service Master.</div>
        )}
      </section>
    </main>
  );
}

function buildDraftMap(services) {
  return (Array.isArray(services) ? services : []).reduce((acc, service) => {
    const serviceName = String(service.serviceName || "").trim();
    if (!serviceName) return acc;
    acc[serviceName] = {
      requiredCongCount: Number(service.requiredCongCount || 0),
      requiredFolkCount: Number(service.requiredFolkCount || 0),
      requiredEmpCount: Number(service.requiredEmpCount || 0),
      allocatedCongCount: Number(service.allocatedCongCount || 0),
      allocatedFolkCount: Number(service.allocatedFolkCount || 0),
      allocatedEmpCount: Number(service.allocatedEmpCount || 0)
    };
    return acc;
  }, {});
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

async function updateServiceCounts(payload) {
  const response = await fetch("/api/bridge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "services.updateCounts", ...payload }),
    cache: "no-store"
  });
  const parsed = await readJsonResponse(response);
  if (!response.ok || parsed?.ok === false) {
    throw new Error(parsed?.error || "Could not save counts");
  }
  return parsed.data || {};
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
