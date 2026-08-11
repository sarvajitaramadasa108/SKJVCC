import Link from "next/link";

export default function PortalNav() {
  return (
    <nav className="topnav portal-nav">
      <Link href="/">Home</Link>
      <Link href="/dashboard/registrations">Live Registrations</Link>
      <Link href="/dashboard/assigned-volunteers">Assigned Volunteers</Link>
      <Link href="/dashboard/service-wise">Service Wise View</Link>
      <Link href="/dashboard/assignment-status">Status of Assignment</Link>
    </nav>
  );
}
