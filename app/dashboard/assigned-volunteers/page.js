import Link from "next/link";
import AssignedVolunteersPanel from "@/components/AssignedVolunteersPanel";
import PortalNav from "@/components/PortalNav";

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
        <PortalNav />
      </header>

      <AssignedVolunteersPanel />
    </main>
  );
}
