# SKJVCC Volunteer Portal

Live Google Sheets interface for volunteer registrations.

## What it does

- Shows all Google Form registrations in a live table
- Polls for new rows so the dashboard stays fresh
- Shows each volunteer photo with a `View Image` preview
- Assigns or changes service inline from the table
- Filters volunteers by service and exports to Excel

## Data source

This project reads from a Google Sheet populated by a live Google Form.

The app uses Google Apps Script as the bridge between Next.js and the sheet.

## Setup

1. Open the Apps Script file in `apps-script/Code.gs`.
2. Replace the spreadsheet ID if needed.
3. Deploy the script as a web app.
4. Copy the deployment URL into `GOOGLE_APPS_SCRIPT_URL`.
5. Run the Next.js app.

If you are using the currently shared web app, it is already wired as the default fallback in the project.

## Sheets

The script creates or uses:

- `Form Responses 1`
- `Volunteer Master`
- `Service Master`

## Pages

- `/` - project home
- `/dashboard/registrations` - live registrations table
- `/dashboard/service-wise` - service filter and Excel export
