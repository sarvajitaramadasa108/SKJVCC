export const AVAILABILITY_COLUMNS = [
  "3rd September (Half day:- 2pm to 10pm)",
  "4th September (Full day:- 9am to 9pm)",
  "5th September (Full day:- 9am to 9pm)",
  "6th September (Full day:- 9am to 9pm)"
];

export function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[-–—]/g, "-");
}

export function availabilityFlags(value) {
  const normalized = normalizeText(value);
  return AVAILABILITY_COLUMNS.map((column) => ({
    label: column,
    available: normalized.includes(normalizeText(column))
  }));
}

export function extractDriveFileId(link) {
  const value = String(link || "").trim();
  if (!value) return "";

  const patterns = [
    /\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /\/uc\?id=([a-zA-Z0-9_-]+)/
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match && match[1]) return match[1];
  }

  return "";
}

export function buildImageUrl(link, mode = "preview") {
  const value = String(link || "").trim();
  if (!value) return "";

  const fileId = extractDriveFileId(value);
  if (!fileId) return value;

  if (mode === "full") {
    return `https://drive.google.com/uc?export=view&id=${fileId}`;
  }

  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w900`;
}

export async function fetchPhotoDataUrl(photoUrl) {
  const response = await fetch("/api/bridge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "registrations.photo", photoUrl }),
    cache: "no-store"
  });
  const payload = await readJsonResponse(response);
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || "Could not load photo");
  }
  return payload?.data?.dataUrl || payload?.data?.imageUrl || "";
}

export async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    const trimmed = String(text || "").trim();
    if (/^<!doctype/i.test(trimmed) || /^<html/i.test(trimmed)) {
      throw new Error("Unexpected response from the server. Please try again.");
    }
    throw new Error(trimmed || "Unexpected response from the server. Please try again.");
  }
}

export function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildExcelDownload(filename, headers, rows) {
  const headerRow = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const bodyRows = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");
  const html = `
    <html>
      <head><meta charset="UTF-8" /></head>
      <body>
        <table border="1">
          <tr>${headerRow}</tr>
          ${bodyRows}
        </table>
      </body>
    </html>
  `;

  const blob = new Blob([html], { type: "application/vnd.ms-excel" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
