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
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;

    async function loadData() {
      const cachedServices = readCachedJson(SERVICES_CACHE_KEY);
      const cachedRegistrations = readCachedJson(REGISTRATIONS_CACHE_KEY);
      if (cachedServices.length || cachedRegistrations.length) {
        setServices(cachedServices);
        setRegistrations(cachedRegistrations);
        setLoading(false);
      }

      try {
        const [servicesResponse, registrationsResponse] = await Promise.all([
          fetch("/api/bridge?action=services.list", { cache: "no-store" }),
          fetch("/api/bridge?action=registrations.list", { cache: "no-store" })
        ]);
        const [servicesPayload, registrationsPayload] = await Promise.all([
          readJsonResponse(servicesResponse),
          readJsonResponse(registrationsResponse)
        ]);
        if (!alive) return;
        const nextServices = Array.isArray(servicesPayload.data) ? servicesPayload.data : [];
        const nextRegistrations = Array.isArray(registrationsPayload.data) ? registrationsPayload.data : [];
        setServices(nextServices);
        setRegistrations(nextRegistrations);
        writeCachedJson(SERVICES_CACHE_KEY, nextServices);
        writeCachedJson(REGISTRATIONS_CACHE_KEY, nextRegistrations);
        setMessage("");
      } catch (error) {
        if (alive && !cachedServices.length && !cachedRegistrations.length) {
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

  const rows = useMemo(() => {
    const assignedCounts = buildAssignedCounts(registrations);
    const serviceRows = services.map((service, index) => {
      const serviceName = String(service.serviceName || "").trim();
      const required = Number(service.requiredCount || 0);
      const allocated = assignedCounts[serviceName] || Number(service.allocatedCount || 0) || 0;
      return {
        id: serviceName || `service-${index}`,
        serialNo: index + 1,
        serviceName: serviceName || "-",
        required,
        allocated,
        pending: Math.max(required - allocated, 0)
      };
    });

    const seenNames = new Set(serviceRows.map((service) => service.serviceName));
    for (const serviceName of Object.keys(assignedCounts)) {
      if (seenNames.has(serviceName)) continue;
      const allocated = assignedCounts[serviceName] || 0;
      serviceRows.push({
        id: serviceName,
        serialNo: serviceRows.length + 1,
        serviceName,
        required: 0,
        allocated,
        pending: 0
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
          <p className="subtle">Required counts come from Service Master sheet column G.</p>
        </div>
        <PortalNav />
      </header>

      {message ? <section className="notice">{message}</section> : null}

      <section className="panel table-panel">
        <div className="panel-head">
          <h2>Assignment status by service</h2>
          <p className="subtle-dark">Required, allocated, and pending counts are calculated from the same service master data.</p>
        </div>

        {loading && !rows.length ? (
          <div className="empty-state">Loading assignment status...</div>
        ) : rows.length ? (
          <div className="table-wrap assignment-table-wrap">
            <table className="summary-table assignment-table">
              <thead>
                <tr>
                  <th>S No</th>
                  <th>Service Name</th>
                  <th>No of Volunteers Required</th>
                  <th>No of Volunteers Allocated</th>
                  <th>No of Pending Allocations</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.serialNo}</td>
                    <td><strong>{row.serviceName}</strong></td>
                    <td>{row.required}</td>
                    <td>{row.allocated}</td>
                    <td><strong>{row.pending}</strong></td>
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

function buildAssignedCounts(registrations) {
  return registrations.reduce((counts, row) => {
    const serviceName = String(row?.assignedService || "").trim();
    if (!serviceName) return counts;
    counts[serviceName] = (counts[serviceName] || 0) + 1;
    return counts;
  }, {});
}
