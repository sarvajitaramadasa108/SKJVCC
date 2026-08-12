import Link from "next/link";

export default function HomePage() {
  return (
    <main className="home-shell">
      <header className="topbar home-topbar">
        <div>
          <p className="eyebrow">SKJVCC Volunteer Portal</p>
          <h1>Volunteer Registration Control Room</h1>
          <p className="hero-copy">
            Watch registrations update in real time, preview uploaded photos, assign services inline, and export service-wise volunteer lists when you need them.
          </p>
        </div>
      </header>

      <section className="hero hero-home">
        <p className="eyebrow">Live sheet sync</p>
        <h2>Live Google Sheet dashboard for volunteer registrations</h2>
        <p className="hero-copy">Everything below is wired to the same live sheet and assignment flow.</p>
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
        <Link className="card-link" href="/dashboard/services-master">
          <h2>Services Master</h2>
          <p>See the full Service Master table with coordinator details, volunteer requirements, and photo preview.</p>
        </Link>
        <Link className="card-link" href="/dashboard/assignment-status">
          <h2>Status of Assignment</h2>
          <p>Track required, allocated, and pending volunteers for every service.</p>
        </Link>
      </section>
    </main>
  );
}
