import Link from "next/link";

export default function HomePage() {
  return (
    <main className="home-shell">
      <section className="hero hero-home">
        <p className="eyebrow">Volunteer Registration Control Room</p>
        <h1>Live Google Sheet dashboard for volunteer registrations</h1>
        <p className="hero-copy">
          Watch registrations update in real time, preview uploaded photos, assign services inline, and export service-wise volunteer lists when you need them.
        </p>
      </section>

      <section className="card-grid">
        <Link className="card-link" href="/dashboard/registrations">
          <h2>Live Registrations</h2>
          <p>View every registered volunteer, see availability flags, preview images, and assign services from the table.</p>
        </Link>
        <Link className="card-link" href="/dashboard/assigned-volunteers">
          <h2>Assigned Volunteers</h2>
          <p>Review volunteers who already have a service and change the allocation when needed.</p>
        </Link>
        <Link className="card-link" href="/dashboard/service-wise">
          <h2>Service Wise View</h2>
          <p>Select a service, inspect the assigned volunteers, and download the result as Excel.</p>
        </Link>
        <Link className="card-link" href="/dashboard/assignment-status">
          <h2>Status of Assignment</h2>
          <p>Track required, allocated, and pending volunteers for every service.</p>
        </Link>
      </section>
    </main>
  );
}
