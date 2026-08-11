"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { readJsonResponse } from "@/components/registryUtils";

const SERVICES_CACHE_KEY = "skjvcc_services_cache";

export default function AssignmentStatusDashboard() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;

    async function loadServices() {
      const cached = readCachedServices();
      if (cached.length) {
        setServices(cached);
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
        const serviceRows = Array.isArray(servicesPayload.data) ? servicesPayload.data : [];
        const assignedCounts = buildAssignedCounts(Array.isArray(registrationsPayload.data) ? registrationsPayload.data : []);
        const nextServices = serviceRows.map((service, index) => {
          const serviceName = String(service.serviceName || "").trim();
          const required = Number(service.requiredCount || 0);
          const allocated = assignedCounts[serviceName] || 0;
          return {
            id: serviceName || `service-${index}`,
            serialNo: index + 1,
            serviceName: serviceName || "-",
            required,
            allocated,
            pending: Math.max(required - allocated, 0)
          };
        });
        const seenNames = new Set(nextServices.map((service) => service.serviceName));
        for (const serviceName of Object.keys(assignedCounts)) {
          if (seenNames.has(serviceName)) continue;
          const allocated = assignedCounts[serviceName] || 0;
          nextServices.push({
            id: serviceName,
            serialNo: nextServices.length + 1,
            serviceName,
            required: 0,
            allocated,
            pending: 0
          });
        }
        setServices(nextServices);
        writeCachedServices(nextServices);
        setMessage("");
      } catch (error) {
        if (alive && !cached.length) {
          setServices([]);
          setMessage(error.message || "Could not load assignment status");
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

  const rows = useMemo(
    () => services,
    [services]
  );

  return (
    <main className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SKJVCC Volunteer Portal</p>
          <h1>Status of Assignment</h1>
          <p className="subtle">Required counts come from Service Master sheet column G.</p>
        </div>
        <nav className="topnav">
          <Link href="/">Home</Link>
          <Link href="/dashboard/registrations">Live Registrations</Link>
          <Link href="/dashboard/assigned-volunteers">Assigned Volunteers</Link>
          <Link href="/dashboard/service-wise">Service Wise View</Link>
        </nav>
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

function buildAssignedCounts(registrations) {
  return registrations.reduce((counts, row) => {
    const serviceName = String(row?.assignedService || "").trim();
    if (!serviceName) return counts;
    counts[serviceName] = (counts[serviceName] || 0) + 1;
    return counts;
  }, {});
}
