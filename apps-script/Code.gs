const SPREADSHEET_ID = "1BDU7rYRG0uCcu1aksSVRlCUni0MYGM7rYHgw7PL5OPQ";
const FORM_RESPONSES_SHEET_NAME = "Form Responses 1";
const MASTER_SHEET_NAME = "Volunteer Master";
const SERVICE_SHEET_NAME = "Service Master";

const AVAILABILITY_COLUMNS = [
  "3rd September (Half day:- 2pm to 10pm)",
  "4th September (Full day:- 9am to 9pm)",
  "5th September (Full day:- 9am to 9pm)",
  "6th September (Full day:- 9am to 9pm)"
];

function doGet(e) {
  return jsonResponse(route(String(e && e.parameter && e.parameter.action || "registrations.list"), e ? e.parameter : {}, null));
}

function doPost(e) {
  const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  return jsonResponse(route(String(body.action || "registrations.list"), body, e));
}

function route(action, payload) {
  if (action === "setup") return { ok: true, data: setupSheets() };
  if (action === "sync.formResponses") return { ok: true, data: syncFormResponsesToMaster() };
  if (action === "services.list") return { ok: true, data: listServices() };
  if (action === "registrations.list") return { ok: true, data: listRegistrations() };
  if (action === "registrations.byService") return { ok: true, data: registrationsByService(payload.serviceName) };
  if (action === "registrations.assignService") return { ok: true, data: assignService(payload) };
  if (action === "registrations.photo") return { ok: true, data: getRegistrationPhoto(payload) };
  return { ok: false, error: "Unknown action: " + action };
}

function setupSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ensureMasterHeader(masterSheet(ss));
  ensureServiceHeader(serviceSheet(ss));
  return {
    masterSheet: MASTER_SHEET_NAME,
    serviceSheet: SERVICE_SHEET_NAME
  };
}

function syncFormResponsesToMaster() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const formSheet = formResponsesSheet(ss);
  const master = masterSheet(ss);
  ensureMasterHeader(master);

  const values = formSheet.getDataRange().getValues();
  if (values.length < 2) return { synced: 0 };

  const formHeaders = buildHeaderMap(values[0]);
  const masterRows = master.getDataRange().getValues();
  const masterIndex = buildSourceRowIndex_(masterRows);
  const scriptProps = PropertiesService.getScriptProperties();
  const lastSyncedRow = Number(scriptProps.getProperty("VOLUNTEER_LAST_SYNCED_RESPONSE_ROW") || 1);
  const startRow = Math.max(2, lastSyncedRow + 1);
  if (startRow > values.length) {
    return { synced: 0 };
  }

  let synced = 0;

  for (let i = startRow - 1; i < values.length; i++) {
    const sourceRow = i + 1;
    const row = values[i];
    if (isFormHeaderRow_(row)) continue;
    const record = mapFormResponseRow_(row, formHeaders, sourceRow, masterIndex[sourceRow]);
    if (!record) continue;
    upsertMasterRow_(master, record, masterIndex[sourceRow]);
    synced += 1;
  }

  scriptProps.setProperty("VOLUNTEER_LAST_SYNCED_RESPONSE_ROW", String(values.length));
  return { synced: synced };
}

function listRegistrations() {
  syncFormResponsesToMaster();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = masterSheet(ss);
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];

  const headers = buildHeaderMap(rows[0]);
  return rows
    .slice(1)
    .map(function (row, index) {
      return mapMasterRow_(row, headers, index + 2);
    })
    .filter(function (row) {
      return isValidMasterRecord_(row) && !isHeaderLikeRecord_(row);
    });
}

function registrationsByService(serviceName) {
  const target = String(serviceName || "").trim();
  if (!target) throw new Error("Select a service");
  return listRegistrations().filter(function (row) {
    return String(row.assignedService || "").trim() === target;
  });
}

function assignService(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = masterSheet(ss);
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) throw new Error("No registrations found");

  const headers = buildHeaderMap(rows[0]);
  const sourceRow = Number(payload.sourceRow || 0);
  const serviceName = String(payload.serviceName || "").trim();
  if (!serviceName) throw new Error("Select a service");

  const targetRow = findMasterRowBySourceRow_(rows, sourceRow);
  if (targetRow < 2) throw new Error("Registration not found");

  const current = rows[targetRow - 1];
  current[headers.assignedService] = serviceName;
  current[headers.assignmentUpdatedAt] = formatNow_();
  sheet.getRange(targetRow, 1, 1, rows[0].length).setValues([current]);

  return {
    registration: mapMasterRow_(current, headers, targetRow)
  };
}

function listServices() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = serviceSheet(ss);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = buildHeaderMap(values[0]);
  return values.slice(1).map(function (row, index) {
    return {
      rowNumber: index + 2,
      serviceName: String(row[headers.serviceName] || "").trim(),
      coordinatorName: String(row[headers.coordinatorName] || "").trim(),
      contactNumber: String(row[headers.contactNumber] || "").trim(),
      reportingTime: String(row[headers.reportingTime] || "").trim(),
      requiredCount: Number(row[headers.requiredCount] || 0),
      photoUrl: String(row[headers.photoUrl] || "").trim(),
      active: headers.active >= 0 ? String(row[headers.active] || "").trim().toLowerCase() !== "false" : true
    };
  }).filter(function (row) {
    return row.serviceName;
  });
}

function formResponsesSheet(ss) {
  const sheet = ss.getSheetByName(FORM_RESPONSES_SHEET_NAME);
  if (!sheet) throw new Error('Sheet "' + FORM_RESPONSES_SHEET_NAME + '" not found');
  return sheet;
}

function masterSheet(ss) {
  return ss.getSheetByName(MASTER_SHEET_NAME) || ss.insertSheet(MASTER_SHEET_NAME);
}

function serviceSheet(ss) {
  return ss.getSheetByName(SERVICE_SHEET_NAME) || ss.insertSheet(SERVICE_SHEET_NAME);
}

function ensureMasterHeader(sheet) {
  const headers = [
    "S No",
    "Source Row",
    "Full Name",
    "Age",
    "Gender",
    "Mobile Number",
    "Devotee in Touch",
    "Area of Staying in Vizag",
    "Availability for Service",
    AVAILABILITY_COLUMNS[0],
    AVAILABILITY_COLUMNS[1],
    AVAILABILITY_COLUMNS[2],
    AVAILABILITY_COLUMNS[3],
    "Photo upload",
    "Assigned Service",
    "Assignment Updated At"
  ];
  ensureHeaders_(sheet, headers);
}

function ensureServiceHeader(sheet) {
  const headers = [
    "S No",
    "Service Name",
    "Coordinator Name",
    "Coordinator Contact Number",
    "Reporting Time",
    "Required Count",
    "Coordinator Photo Link",
    "Active"
  ];
  ensureHeaders_(sheet, headers);
}

function ensureHeaders_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    return;
  }
  const current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
  let changed = false;
  for (let i = 0; i < headers.length; i++) {
    if (String(current[i] || "").trim() !== headers[i]) {
      changed = true;
      break;
    }
  }
  if (changed) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function mapFormResponseRow_(row, headers, sourceRow, existingRow) {
  const fullName = readFormCell_(row, headers.fullName, 1);
  const age = readFormCell_(row, headers.age, 2);
  const gender = readFormCell_(row, headers.gender, 3);
  const mobileNumber = readFormCell_(row, headers.mobileNumber, 4);
  const devoteeInTouch = readFormCell_(row, headers.devoteeInTouch, 5);
  const areaOfStay = readFormCell_(row, headers.areaOfStay, 6);
  const availabilityForService = readFormCell_(row, headers.availabilityForService, 7);
  const photoUpload = readFormCell_(row, headers.photoUpload, 8);
  const availability = parseAvailability_(availabilityForService);

  if (
    isHeaderLikeInput_(fullName, mobileNumber, availabilityForService) ||
    isFormHeaderRow_(row) ||
    !String(fullName || mobileNumber || age || gender || devoteeInTouch || areaOfStay || availabilityForService || photoUpload).trim()
  ) {
    return null;
  }

  const record = existingRow && existingRow.length ? existingRow.slice() : [];
  while (record.length < 16) record.push("");

  record[0] = existingRow && existingRow[0] ? existingRow[0] : sourceRow;
  record[1] = sourceRow;
  record[2] = fullName;
  record[3] = age;
  record[4] = gender;
  record[5] = mobileNumber;
  record[6] = devoteeInTouch;
  record[7] = areaOfStay;
  record[8] = availabilityForService;
  record[9] = availability[0] ? "Yes" : "";
  record[10] = availability[1] ? "Yes" : "";
  record[11] = availability[2] ? "Yes" : "";
  record[12] = availability[3] ? "Yes" : "";
  record[13] = photoUpload;
  record[14] = existingRow && existingRow[14] ? String(existingRow[14]).trim() : "";
  record[15] = existingRow && existingRow[15] ? String(existingRow[15]).trim() : "";
  return record;
}

function readFormCell_(row, headerIndex, fallbackIndex) {
  let value = headerIndex >= 0 ? row[headerIndex] : "";
  if (value === "" || value === null || value === undefined) {
    value = fallbackIndex >= 0 ? row[fallbackIndex] : "";
  }
  return String(value || "").trim();
}

function upsertMasterRow_(sheet, record, existingRowNumber) {
  if (existingRowNumber && existingRowNumber >= 2) {
    sheet.getRange(existingRowNumber, 1, 1, record.length).setValues([record]);
  } else {
    sheet.appendRow(record);
  }
}

function mapMasterRow_(row, headers, rowNumber) {
  const availabilityFlags = AVAILABILITY_COLUMNS.map(function (_, index) {
    return String(row[9 + index] || "").trim().toLowerCase() === "yes";
  });
  const availabilityMap = {};
  for (let i = 0; i < AVAILABILITY_COLUMNS.length; i++) {
    availabilityMap[AVAILABILITY_COLUMNS[i]] = availabilityFlags[i];
  }

  return {
    rowNumber: rowNumber,
    sourceRow: Number(row[headers.sourceRow] || rowNumber),
    serialNo: Number(row[headers.serialNo] || rowNumber - 1),
    fullName: String(row[headers.fullName] || "").trim(),
    age: String(row[headers.age] || "").trim(),
    gender: String(row[headers.gender] || "").trim(),
    mobileNumber: String(row[headers.mobileNumber] || "").trim(),
    devoteeInTouch: String(row[headers.devoteeInTouch] || "").trim(),
    areaOfStay: String(row[headers.areaOfStay] || "").trim(),
    availabilityForService: String(row[headers.availabilityForService] || "").trim(),
    availabilityFlags: AVAILABILITY_COLUMNS.map(function (label, index) {
      return {
        label: label,
        available: availabilityFlags[index]
      };
    }),
    availabilityMap: availabilityMap,
    photoUpload: String(row[headers.photoUpload] || "").trim(),
    assignedService: String(row[headers.assignedService] || "").trim(),
    assignmentUpdatedAt: String(row[headers.assignmentUpdatedAt] || "").trim()
  };
}

function buildHeaderMap(headerRow) {
  const normalized = {};
  for (let i = 0; i < headerRow.length; i++) {
    normalized[normalizeHeader_(headerRow[i])] = i;
  }

  return {
    serialNo: findHeaderIndex_(normalized, ["s no", "serial no", "serial number"]),
    sourceRow: findHeaderIndex_(normalized, ["source row", "row", "form row"]),
    fullName: findHeaderIndex_(normalized, ["full name", "name"]),
    age: findHeaderIndex_(normalized, ["age"]),
    gender: findHeaderIndex_(normalized, ["gender"]),
    mobileNumber: findHeaderIndex_(normalized, ["mobile number", "mobile", "phone number"]),
    devoteeInTouch: findHeaderIndex_(normalized, ["devotee in touch"]),
    areaOfStay: findHeaderIndex_(normalized, ["area of staying in vizag", "area of stay"]),
    availabilityForService: findHeaderIndex_(normalized, ["availability for service"]),
    photoUpload: findHeaderIndex_(normalized, ["photo upload", "photo"]),
    assignedService: findHeaderIndex_(normalized, ["assigned service", "service"]),
    assignmentUpdatedAt: findHeaderIndex_(normalized, ["assignment updated at"]),
    serviceName: findHeaderIndex_(normalized, ["service name"]),
    coordinatorName: findHeaderIndex_(normalized, ["coordinator name"]),
    contactNumber: findHeaderIndex_(normalized, ["coordinator contact number", "contact number"]),
    reportingTime: findHeaderIndex_(normalized, ["reporting time"]),
    requiredCount: findHeaderIndex_(normalized, ["required count", "number of volunteers required"]),
    photoUrl: findHeaderIndex_(normalized, ["coordinator photo link", "photo url"]),
    active: findHeaderIndex_(normalized, ["active"])
  };
}

function findHeaderIndex_(normalizedHeaders, possibleNames) {
  for (let i = 0; i < possibleNames.length; i++) {
    var key = normalizeHeader_(possibleNames[i]);
    if (Object.prototype.hasOwnProperty.call(normalizedHeaders, key)) {
      return normalizedHeaders[key];
    }
  }
  return -1;
}

function normalizeHeader_(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "");
}

function parseAvailability_(text) {
  const normalized = normalizeHeader_(text);
  return AVAILABILITY_COLUMNS.map(function (label) {
    return normalized.indexOf(normalizeHeader_(label)) !== -1;
  });
}

function isHeaderLikeInput_(fullName, mobileNumber, availabilityForService) {
  const full = normalizeHeader_(fullName);
  const mobile = normalizeHeader_(mobileNumber);
  const availability = normalizeHeader_(availabilityForService);
  return (
    full === "full name" ||
    full === "name" ||
    mobile === "mobile number" ||
    mobile === "phone number" ||
    availability === "availability for service"
  );
}

function isFormHeaderRow_(row) {
  const values = (row || []).map(function (cell) {
    return normalizeHeader_(cell);
  });
  const labelSet = new Set([
    "timestamp",
    "full name",
    "age",
    "gender",
    "mobile number whatsapp number",
    "mobile number",
    "devotee in touch kindly mention name of devotee you are in touch",
    "area of staying in vizag",
    "availability for service",
    "photo upload kindly upload your any recent photo with good face visibility",
    "photo upload"
  ]);

  if (!values.length) return false;
  let matches = 0;
  for (let i = 0; i < values.length; i++) {
    if (labelSet.has(values[i])) matches += 1;
  }
  return values[0] === "timestamp" || matches >= 4;
}

function isValidMasterRecord_(row) {
  const fullName = normalizeHeader_(row.fullName || "");
  const mobileNumber = normalizeHeader_(row.mobileNumber || "");
  const devoteeInTouch = normalizeHeader_(row.devoteeInTouch || "");
  const areaOfStay = normalizeHeader_(row.areaOfStay || "");
  const availability = normalizeHeader_(row.availabilityForService || "");
  const badLabels = new Set([
    "timestamp",
    "full name",
    "name",
    "age",
    "gender",
    "mobile number",
    "mobile number whatsapp number",
    "devotee in touch",
    "kindly mention name of devotee you are in touch",
    "area of staying in vizag",
    "availability for service",
    "photo upload",
    "photo"
  ]);

  if (!fullName || !mobileNumber) return false;
  if (badLabels.has(fullName) || badLabels.has(mobileNumber)) return false;
  if (badLabels.has(devoteeInTouch) || badLabels.has(areaOfStay) || badLabels.has(availability)) return false;
  return true;
}

function isHeaderLikeRecord_(row) {
  const labels = new Set([
    "timestamp",
    "full name",
    "name",
    "age",
    "gender",
    "mobile number",
    "mobile number whatsapp number",
    "devotee in touch",
    "kindly mention name of devotee you are in touch",
    "area of staying in vizag",
    "availability for service",
    "photo upload",
    "photo",
    "assigned service"
  ]);

  const values = [
    row.fullName,
    row.age,
    row.gender,
    row.mobileNumber,
    row.devoteeInTouch,
    row.areaOfStay,
    row.availabilityForService,
    row.photoUpload,
    row.assignedService
  ].map(function (cell) {
    return normalizeHeader_(cell);
  });

  return values.some(function (value) {
    return labels.has(value);
  });
}

function pruneInvalidMasterRows_(sheet, rows, headers) {
  const rowsToDelete = [];
  for (let i = 1; i < rows.length; i++) {
    const row = mapMasterRow_(rows[i], headers, i + 1);
    if (!isValidMasterRecord_(row) || isFormHeaderRow_(rows[i])) {
      rowsToDelete.push(i + 1);
    }
  }

  for (let i = rowsToDelete.length - 1; i >= 0; i--) {
    sheet.deleteRow(rowsToDelete[i]);
  }
}

function getRegistrationPhoto(payload) {
  const photoUrl = String(payload.photoUrl || payload.photoUpload || "").trim();
  const fileId = extractDriveFileId_(photoUrl);
  if (!fileId) {
    throw new Error("No photo file found");
  }

  const imageBytes = fetchDriveImageBytes_(fileId);
  if (imageBytes) {
    return {
      mimeType: imageBytes.mimeType,
      dataUrl: imageBytes.dataUrl
    };
  }

  return {
    mimeType: "image/jpeg",
    imageUrl: "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w1200"
  };
}

function fetchDriveImageBytes_(fileId) {
  const token = ScriptApp.getOAuthToken();
  const urls = [
    "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(fileId) + "?alt=media",
    DriveApp.getFileById(fileId).getDownloadUrl()
  ];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (!url) continue;
    try {
      const response = UrlFetchApp.fetch(url, {
        headers: {
          Authorization: "Bearer " + token
        },
        followRedirects: true,
        muteHttpExceptions: true
      });
      if (response.getResponseCode() !== 200) continue;
      const headers = response.getHeaders() || {};
      const contentType = String(headers["Content-Type"] || headers["content-type"] || "").trim();
      if (contentType.indexOf("image/") !== 0) continue;
      const bytes = response.getContent();
      if (!bytes || !bytes.length) continue;
      return {
        mimeType: contentType,
        dataUrl: "data:" + contentType + ";base64," + Utilities.base64Encode(bytes)
      };
    } catch (error) {
      // try the next URL
    }
  }

  return null;
}

function extractDriveFileId_(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const patterns = [
    /\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /\/uc\?id=([a-zA-Z0-9_-]+)/
  ];
  for (let i = 0; i < patterns.length; i++) {
    const match = text.match(patterns[i]);
    if (match && match[1]) return match[1];
  }
  return "";
}

function buildSourceRowIndex_(rows) {
  const index = {};
  for (let i = 1; i < rows.length; i++) {
    const sourceRow = Number(rows[i][1] || 0);
    if (sourceRow) index[sourceRow] = i + 1;
  }
  return index;
}

function findMasterRowBySourceRow_(rows, sourceRow) {
  if (!sourceRow) return -1;
  for (let i = 1; i < rows.length; i++) {
    if (Number(rows[i][1] || 0) === sourceRow) {
      return i + 1;
    }
  }
  return -1;
}

function formatNow_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Calcutta", "yyyy-MM-dd HH:mm:ss");
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
