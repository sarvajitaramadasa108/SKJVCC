import Link from "next/link";
import AssignedVolunteersPanel from "@/components/AssignedVolunteersPanel";

export default function AssignedVolunteersPage() {
  return (
    <main className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SKJVCC Volunteer Portal</p>
          <h1>Assigned volunteers</h1>
          <p className="subtle">
            Review volunteers who already have a service, then update the allocation if needed.
          </p>
        </div>
        <nav className="topnav">
          <Link href="/">Home</Link>
          <Link href="/dashboard/registrations">Live Registrations</Link>
          <Link href="/dashboard/service-wise">Service Wise View</Link>
        </nav>
      </header>

      <AssignedVolunteersPanel />
    </main>
  );
}
