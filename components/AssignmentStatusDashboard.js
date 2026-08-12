"use client";

import { useEffect, useMemo, useState } from "react";
import PortalNav from "@/components/PortalNav";
import { readJsonResponse } from "@/components/registryUtils";

const SERVICES_CACHE_KEY = "skjvcc_services_cache";
const REGISTRATIONS_CACHE_KEY = "skjvcc_registrations_cache";

export default function AssignmentStatusDashboard() {
  const [services, setServices] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;

    async function loadData() {
      try {
        const cachedServices = readCachedJson(SERVICES_CACHE_KEY);
        const cachedRegistrations = readCachedJson(REGISTRATIONS_CACHE_KEY);
        if (cachedServices.length || cachedRegistrations.length) {
          setServices(cachedServices);
          setRegistrations(cachedRegistrations);
        }

        const nextServices = await fetchServicesFresh();
        const nextRegistrations = await fetchRegistrationsFresh();
        if (!alive) return;
        setServices(nextServices);
        setRegistrations(nextRegistrations);
        writeCachedJson(SERVICES_CACHE_KEY, nextServices);
        writeCachedJson(REGISTRATIONS_CACHE_KEY, nextRegistrations);
        setMessage("");
      } catch (error) {
        if (alive) {
          setServices([]);
          setRegistrations([]);
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

  async function refreshNow() {
    setRefreshing(true);
    setMessage("");
    try {
      const [nextServices, nextRegistrations] = await Promise.all([
        fetchServicesFresh(),
        fetchRegistrationsFresh()
      ]);
      setServices(nextServices);
      setRegistrations(nextRegistrations);
      writeCachedJson(SERVICES_CACHE_KEY, nextServices);
      writeCachedJson(REGISTRATIONS_CACHE_KEY, nextRegistrations);
      setMessage("Assignment status refreshed.");
    } catch (error) {
      setMessage(error.message || "Could not refresh assignment status");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }

  const rows = useMemo(() => {
    const assignedCounts = buildAssignedCounts(registrations);
    const serviceRows = services.map((service, index) => {
      const serviceName = String(service.serviceName || "").trim();
      const required = {
        FOLK: Number(service.requiredFolkCount || 0),
        Congregation: Number(service.requiredCongCount || 0),
        Employee: Number(service.requiredEmpCount || 0)
      };
      const allocated = assignedCounts[serviceName] || emptyCategoryCounts();
      return {
        id: serviceName || `service-${index}`,
        serialNo: index + 1,
        serviceName: serviceName || "-",
        required,
        allocated,
        pending: {
          FOLK: Math.max(required.FOLK - allocated.FOLK, 0),
          Congregation: Math.max(required.Congregation - allocated.Congregation, 0),
          Employee: Math.max(required.Employee - allocated.Employee, 0)
        }
      };
    });

    const seenNames = new Set(serviceRows.map((service) => service.serviceName));
    for (const serviceName of Object.keys(assignedCounts)) {
      if (seenNames.has(serviceName)) continue;
      const allocated = assignedCounts[serviceName] || emptyCategoryCounts();
      serviceRows.push({
        id: serviceName,
        serialNo: serviceRows.length + 1,
        serviceName,
        required: emptyCategoryCounts(),
        allocated,
        pending: emptyCategoryCounts()
      });
    }
    return serviceRows;
  }, [services, registrations]);

  return (
    <main className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SKJVCC Volunteer Portal</p>
          <h1>Status of Assignment</h1>
          <p className="subtle">Required counts come from the Service Master category columns.</p>
        </div>
        <PortalNav />
      </header>

      {message ? <section className="notice">{message}</section> : null}

      <section className="panel table-panel assignment-status-panel">
        <div className="panel-head assignment-status-head">
          <div className="panel-head-row">
            <div>
              <h2>Assignment status by service</h2>
              <p className="subtle-dark">Required, allocated, and pending counts are calculated category wise from the service master and registration data.</p>
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
                  <th>Service Name</th>
                  <th>Req FOLK</th>
                  <th>Alloc FOLK</th>
                  <th>Pending FOLK</th>
                  <th>Req Congregation</th>
                  <th>Alloc Congregation</th>
                  <th>Pending Congregation</th>
                  <th>Req Employee</th>
                  <th>Alloc Employee</th>
                  <th>Pending Employee</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.serviceName}</strong></td>
                    <td>{row.required.FOLK}</td>
                    <td>{row.allocated.FOLK}</td>
                    <td><strong>{row.pending.FOLK}</strong></td>
                    <td>{row.required.Congregation}</td>
                    <td>{row.allocated.Congregation}</td>
                    <td><strong>{row.pending.Congregation}</strong></td>
                    <td>{row.required.Employee}</td>
                    <td>{row.allocated.Employee}</td>
                    <td><strong>{row.pending.Employee}</strong></td>
                  </tr>
                ))}
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

async function fetchRegistrationsFresh() {
  const response = await fetch("/api/bridge?action=registrations.list", { cache: "no-store" });
  const payload = await readJsonResponse(response);
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || "Could not load registrations");
  }
  return Array.isArray(payload.data) ? payload.data : [];
}

function buildAssignedCounts(registrations) {
  return registrations.reduce((counts, row) => {
    const serviceName = String(row?.assignedService || "").trim();
    const category = normalizeCategory(row?.assignedCategory);
    if (!serviceName || !category) return counts;
    if (!counts[serviceName]) counts[serviceName] = emptyCategoryCounts();
    counts[serviceName][category] = (counts[serviceName][category] || 0) + 1;
    return counts;
  }, {});
}

function emptyCategoryCounts() {
  return {
    FOLK: 0,
    Congregation: 0,
    Employee: 0
  };
}

function normalizeCategory(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "folk") return "FOLK";
  if (text === "congregation" || text === "congregational") return "Congregation";
  if (text === "employee") return "Employee";
  return "";
}
