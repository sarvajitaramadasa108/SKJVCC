import "./globals.css";

export const metadata = {
  title: "SKJVCC Volunteer Portal",
  description: "Live volunteer registrations and service allocation from Google Sheets."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
