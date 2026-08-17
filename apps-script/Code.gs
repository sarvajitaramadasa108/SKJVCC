const SPREADSHEET_ID = "1BDU7rYRG0uCcu1aksSVRlCUni0MYGM7rYHgw7PL5OPQ";
const FORM_RESPONSES_SHEET_NAME = "Form Responses 1";
const MASTER_SHEET_NAME = "Volunteer Master";
const SERVICE_SHEET_NAME = "Service Master";
const ASSIGNMENT_SHEET_NAME = "Assignment Map";

const AVAILABILITY_COLUMNS = [
  "3rd September (Half day:- 2pm to 10pm)",
  "4th September (Full day:- 9am to 9pm)",
  "5th September (Full day:- 9am to 9pm)",
  "6th September (Full day:- 9am to 9pm)"
];

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return handleRequest_(String(e && e.parameter && e.parameter.action || "registrations.list"), e ? e.parameter : {}, null);
}

function doPost(e) {
  let body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: "Invalid JSON payload"
    });
  }
  return handleRequest_(String(body.action || "registrations.list"), body, e);
}

function handleRequest_(action, payload, event) {
  try {
    return jsonResponse(route(action, payload, event));
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: String(error && error.message ? error.message : error)
    });
  }
}

function route(action, payload) {
  if (action === "setup") return { ok: true, data: setupSheets() };
  if (action === "sync.formResponses") return { ok: true, data: syncFormResponsesToMaster() };
  if (action === "services.list") return { ok: true, data: listServices() };
  if (action === "services.updateCounts") return { ok: true, data: updateServiceCounts(payload) };
  if (action === "registrations.list") return { ok: true, data: listRegistrations() };
  if (action === "registrations.assigned") return { ok: true, data: listAssignedRegistrations() };
  if (action === "registrations.byService") return { ok: true, data: registrationsByService(payload.serviceName) };
  if (action === "registrations.assignService") return { ok: true, data: assignService(payload) };
  if (action === "registrations.resetAssignments") return { ok: true, data: resetAssignments() };
  if (action === "registrations.delete") return { ok: true, data: deleteRegistration(payload) };
  if (action === "registrations.photo") return { ok: true, data: getRegistrationPhoto(payload) };
  return { ok: false, error: "Unknown action: " + action };
}

function setupSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ensureServiceHeader(serviceSheet(ss));
  ensureAssignmentHeader(assignmentSheet(ss));
  return {
    serviceSheet: SERVICE_SHEET_NAME,
    assignmentSheet: ASSIGNMENT_SHEET_NAME
  };
}

function syncFormResponsesToMaster() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const formSheet = formResponsesSheet(ss);
  const assignment = assignmentSheet(ss);
  ensureAssignmentHeader(assignment);

  const values = formSheet.getDataRange().getValues();
  if (values.length < 2) return { synced: 0 };

  const formHeaders = buildHeaderMap(values[0]);
  const assignmentRows = assignment.getDataRange().getValues();
  const assignmentIndex = buildAssignmentRowIndex_(assignmentRows);
  let synced = 0;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (isFormHeaderRow_(row)) continue;
    const responseKey = buildResponseKey_(row);
    const assignmentRecord = assignmentIndex[responseKey] || assignmentIndex["source:" + (i + 1)] || null;
    if (!assignmentRecord) continue;
    const nextRecord = buildAssignmentRecordFromFormRow_(row, formHeaders, assignmentRecord);
    if (!nextRecord) continue;
    upsertAssignmentRecord_(assignment, nextRecord);
    synced += 1;
  }

  return { synced: synced };
}

function listRegistrations() {
  syncFormResponsesToMaster();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const formSheet = formResponsesSheet(ss);
  const assignment = assignmentSheet(ss);
  const rows = formSheet.getDataRange().getValues();
  if (rows.length < 2) return [];

  const headers = buildHeaderMap(rows[0]);
  const assignmentRows = assignment.getDataRange().getValues();
  const assignmentIndex = buildAssignmentRowIndex_(assignmentRows);

  return rows
    .slice(1)
    .map(function (row, index) {
      const responseKey = buildResponseKey_(row);
      const assignmentRecord = assignmentIndex[responseKey] || null;
      const record = mapFormResponseRow_(row, headers, responseKey, assignmentRecord, index + 2);
      if (!record) return null;
      return record;
    })
    .filter(function (row) {
      return row && isValidRegistrationRecord_(row) && !isHeaderLikeRecord_(row);
    });
}

function listAssignedRegistrations() {
  syncFormResponsesToMaster();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const assignment = assignmentSheet(ss);
  const assignmentRows = assignment.getDataRange().getValues();
  if (assignmentRows.length < 2) return [];

  return assignmentRows
    .slice(1)
    .map(function (assignmentRow) {
      return mapAssignmentRow_(assignmentRow, 0);
    })
    .filter(function (row) {
      return row && isAssignedRegistration(row);
    });
}

function registrationsByService(serviceName) {
  const target = String(serviceName || "").trim();
  if (!target) throw new Error("Select a service");
  return listAssignedRegistrations().filter(function (row) {
    return normalizeHeader_(row.assignedService || "") === normalizeHeader_(target);
  });
}

function assignService(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const assignment = assignmentSheet(ss);
  ensureAssignmentHeader(assignment);
  const formSheet = formResponsesSheet(ss);
  const rows = formSheet.getDataRange().getValues();
  if (rows.length < 2) throw new Error("No registrations found");

  const headers = buildHeaderMap(rows[0]);
  const responseKey = String(payload.responseKey || "").trim();
  const sourceRow = Number(payload.sourceRow || 0);
  const serviceName = String(payload.serviceName || "").trim();
  const category = String(payload.category || "").trim();
  if (!serviceName) throw new Error("Select a service");
  if (!category) throw new Error("Select a category");

  const current = findFormResponseRowByResponseKey_(rows, headers, responseKey || String(payload.responseKey || ""));
  const currentRow = current ? current.row : null;
  if (!currentRow && !payload.fullName) throw new Error("Registration not found");
  const assignmentRows = assignment.getDataRange().getValues();
  const assignmentIndex = buildAssignmentRowIndex_(assignmentRows);
  const resolvedResponseKey = responseKey || (currentRow ? buildResponseKey_(currentRow) : "");
  const previousAssignment = assignmentIndex[resolvedResponseKey] || null;
  const previousService = String(previousAssignment && previousAssignment.assignedService || "").trim();
  const previousCategory = String(previousAssignment && previousAssignment.assignedCategory || "").trim();
  const nextCategory = category || previousCategory;
  const updatedAt = formatNow_();

  const record = buildAssignmentRecordFromPayload_(payload, currentRow, headers, {
    responseKey: resolvedResponseKey,
    sourceRow: sourceRow || Number(previousAssignment && previousAssignment.sourceRow || 0),
    assignedService: serviceName,
    assignedCategory: nextCategory,
    updatedAt: updatedAt,
    previousRecord: previousAssignment
  });

  upsertAssignmentRecord_(assignment, record);
  SpreadsheetApp.flush();

  return {
    registration: normalizeAssignmentRegistration_(record)
  };
}

function resetAssignments() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const assignment = assignmentSheet(ss);
  ensureAssignmentHeader(assignment);

  const assignmentLastRow = assignment.getLastRow();
  if (assignmentLastRow > 1) {
    assignment.getRange(2, 1, assignmentLastRow - 1, assignment.getLastColumn()).clearContent();
  }

  SpreadsheetApp.flush();
  return {
    reset: true
  };
}

function deleteRegistration(payload) {
  const sourceRow = Number(payload.sourceRow || 0);
  const responseKey = String(payload.responseKey || "").trim();
  const fullName = normalizeHeader_(payload.fullName || "");
  const mobileNumber = normalizeHeader_(payload.mobileNumber || "");
  const age = normalizeHeader_(payload.age || "");
  if (!sourceRow && !responseKey && !fullName && !mobileNumber && !age) throw new Error("Registration not found");

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const formSheet = formResponsesSheet(ss);
  const assignment = assignmentSheet(ss);
  ensureAssignmentHeader(assignment);

  const formRows = formSheet.getDataRange().getValues();
  if (formRows.length < 2) throw new Error("No registrations found");

  const formHeaders = buildHeaderMap(formRows[0]);
  const formTarget = findDeleteTargetRow_(formRows, formHeaders, {
    responseKey: responseKey,
    fullName: fullName,
    mobileNumber: mobileNumber,
    age: age,
    sourceRow: sourceRow
  });

  if (formTarget >= 2) {
    formSheet.deleteRow(formTarget);
  }
  deleteAssignmentRecord_(assignment, {
    responseKey: responseKey,
    sourceRow: sourceRow,
    fullName: payload.fullName,
    mobileNumber: payload.mobileNumber,
    age: payload.age
  });

  syncFormResponsesToMaster();
  return {
    deleted: true,
    sourceRow: sourceRow
  };
}

function listServices() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = serviceSheet(ss);
  ensureServiceHeader(sheet);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = buildHeaderMap(values[0]);
  const allocatedSeedCounts = buildAllocatedSeedCounts_();
  let changed = false;
  const seen = {};
  const result = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const serviceName = String(row[headers.serviceName] || row[1] || "").trim();
    if (!serviceName) continue;
    const serviceKey = normalizeHeader_(serviceName);
    if (seen[serviceKey]) continue;
    seen[serviceKey] = true;

    const seedCounts = allocatedSeedCounts[serviceKey] || emptyCategoryCounts();
    if (headers.allocatedCongCount >= 0 && String(row[headers.allocatedCongCount] || "").trim() === "" && seedCounts.Congregation) {
      row[headers.allocatedCongCount] = seedCounts.Congregation;
      changed = true;
    }
    if (headers.allocatedFolkCount >= 0 && String(row[headers.allocatedFolkCount] || "").trim() === "" && seedCounts.FOLK) {
      row[headers.allocatedFolkCount] = seedCounts.FOLK;
      changed = true;
    }
    if (headers.allocatedEmpCount >= 0 && String(row[headers.allocatedEmpCount] || "").trim() === "" && seedCounts.Employee) {
      row[headers.allocatedEmpCount] = seedCounts.Employee;
      changed = true;
    }

    const requiredCongCount = readNumericCell_(row, headers.requiredCongCount);
    const requiredFolkCount = readNumericCell_(row, headers.requiredFolkCount);
    const requiredEmpCount = readNumericCell_(row, headers.requiredEmpCount);
    const allocatedCongCount = readNumericCell_(row, headers.allocatedCongCount);
    const allocatedFolkCount = readNumericCell_(row, headers.allocatedFolkCount);
    const allocatedEmpCount = readNumericCell_(row, headers.allocatedEmpCount);
    const requiredCount = readNumericCell_(row, headers.requiredCount) || requiredCongCount + requiredFolkCount + requiredEmpCount;
    const active = headers.active >= 0 ? String(row[headers.active] || "").trim().toLowerCase() !== "false" : true;

    result.push({
      rowNumber: i + 1,
      serviceName: serviceName,
      coordinatorName: String(row[headers.coordinatorName] || row[2] || "").trim(),
      contactNumber: String(row[headers.contactNumber] || row[3] || "").trim(),
      reportingTime: String(row[headers.reportingTime] || row[4] || "").trim(),
      requiredCount: requiredCount,
      requiredCongCount: requiredCongCount,
      requiredFolkCount: requiredFolkCount,
      requiredEmpCount: requiredEmpCount,
      allocatedCount: allocatedCongCount + allocatedFolkCount + allocatedEmpCount,
      allocatedCongCount: allocatedCongCount || seedCounts.Congregation,
      allocatedFolkCount: allocatedFolkCount || seedCounts.FOLK,
      allocatedEmpCount: allocatedEmpCount || seedCounts.Employee,
      photoUrl: String(row[headers.photoUrl] || row[5] || "").trim(),
      active: active
    });
  }

  if (changed) {
    sheet.getRange(2, 1, values.length - 1, values[0].length).setValues(values.slice(1));
  }

  return result;
}

function cleanupRegistrationRowsByNames_(ss, names) {
  const targets = {};
  for (let i = 0; i < names.length; i++) {
    const key = normalizeHeader_(names[i]);
    if (key) targets[key] = true;
  }
  if (!Object.keys(targets).length) return 0;

  const master = masterSheet(ss);
  const formSheet = formResponsesSheet(ss);
  const rows = master.getDataRange().getValues();
  if (rows.length < 2) return 0;

  const headers = buildHeaderMap(rows[0]);
  const masterRowsToDelete = [];
  const formRowsToDelete = [];

  for (let i = 1; i < rows.length; i++) {
    const fullName = normalizeHeader_(rows[i][headers.fullName] || rows[i][2] || "");
    if (!targets[fullName]) continue;
    masterRowsToDelete.push(i + 1);
    const sourceRow = Number(rows[i][headers.sourceRow] || 0);
    if (sourceRow >= 2) formRowsToDelete.push(sourceRow);
  }

  deleteRowsDescending_(master, masterRowsToDelete);
  deleteRowsDescending_(formSheet, formRowsToDelete);
  return masterRowsToDelete.length;
}

function deleteRowsDescending_(sheet, rowNumbers) {
  const uniqueRows = Array.from(
    new Set(
      (rowNumbers || [])
        .map(function (rowNumber) {
          return Number(rowNumber || 0);
        })
        .filter(function (rowNumber) {
          return rowNumber >= 2;
        })
    )
  ).sort(function (left, right) {
    return right - left;
  });

  for (let i = 0; i < uniqueRows.length; i++) {
    sheet.deleteRow(uniqueRows[i]);
  }
}

function findDeleteTargetRow_(rows, headers, payload) {
  const targetResponseKey = String(payload && payload.responseKey || "").trim();
  const targetName = normalizeHeader_(payload && payload.fullName || "");
  const targetMobile = normalizeHeader_(payload && payload.mobileNumber || "");
  const targetAge = normalizeHeader_(payload && payload.age || "");
  const targetSourceRow = Number(payload && payload.sourceRow || 0);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowName = normalizeHeader_(row[headers.fullName] || row[2] || "");
    const rowMobile = normalizeHeader_(row[headers.mobileNumber] || row[5] || "");
    const rowAge = normalizeHeader_(row[headers.age] || row[3] || "");
    const rowResponseKey = String(row[headers.responseKey] || "").trim();
    const rowSourceRow = Number(row[headers.sourceRow] || 0);

    if (targetResponseKey && rowResponseKey && rowResponseKey === targetResponseKey) {
      return i + 1;
    }

    if (targetName && targetMobile && targetAge) {
      if (rowName === targetName && rowMobile === targetMobile && rowAge === targetAge) {
        return i + 1;
      }
    }

    if (targetSourceRow && rowSourceRow === targetSourceRow) {
      return i + 1;
    }
  }

  return -1;
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

function assignmentSheet(ss) {
  return ss.getSheetByName(ASSIGNMENT_SHEET_NAME) || ss.insertSheet(ASSIGNMENT_SHEET_NAME);
}

function ensureMasterHeader(sheet) {
  const headers = masterHeaderRow_();
  if (sheet.getLastRow() > 0) {
    const currentHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
    const normalized = currentHeaders.map(function (cell) {
      return normalizeHeader_(cell);
    });
    if (normalized.indexOf("assignment flag") === -1 && sheet.getLastColumn() < headers.length) {
      sheet.insertColumnAfter(sheet.getLastColumn());
    }
  }
  ensureHeaders_(sheet, headers);
}

function masterHeaderRow_() {
  return [
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
    "Assigned Category",
    "Assignment Flag",
    "Assignment Updated At",
    "Response Key"
  ];
}

function ensureServiceHeader(sheet) {
  const headers = [
    "S No",
    "Service Name",
    "Service Coordinator",
    "Contact Number",
    "Reporting Time",
    "Photo",
    "No. of Req Cong Volunteers",
    "No. of Req FOLK Volunteers",
    "No. of Req Emp Volunteers",
    "No. of Alloc Cong Volunteers",
    "No. of Alloc FOLK Volunteers",
    "No. of Alloc Emp Volunteers",
    "Active"
  ];
  if (sheet.getLastRow() > 0) {
    const currentHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
    const normalized = currentHeaders.map(function (cell) {
      return normalizeHeader_(cell);
    });
    if (normalized.indexOf("no of alloc cong volunteers") === -1) {
      const activeIndex = normalized.indexOf("active");
      if (activeIndex >= 0) {
        sheet.insertColumnsBefore(activeIndex + 1, 3);
      } else if (sheet.getLastColumn() < headers.length) {
        sheet.insertColumnsAfter(sheet.getLastColumn(), 3);
      }
    }
  }
  ensureHeaders_(sheet, headers);
}

function ensureAssignmentHeader(sheet) {
  const headers = assignmentHeaderRow_();
  if (sheet.getLastRow() > 0 && sheet.getLastColumn() < headers.length) {
    sheet.insertColumnsAfter(sheet.getLastColumn(), headers.length - sheet.getLastColumn());
  }
  ensureHeaders_(sheet, headers);
}

function assignmentHeaderRow_() {
  return [
    "Response Key",
    "Source Row",
    "Full Name",
    "Age",
    "Mobile Number",
    "Assigned Service",
    "Assigned Category",
    "Updated At",
    "Devotee in Touch",
    "Area of Staying in Vizag",
    "Availability for Service",
    AVAILABILITY_COLUMNS[0],
    AVAILABILITY_COLUMNS[1],
    AVAILABILITY_COLUMNS[2],
    AVAILABILITY_COLUMNS[3],
    "Photo upload"
  ];
}

function ensureHeaders_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    return;
  }
  const current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
  let changed = current.length < headers.length;
  for (let i = 0; i < headers.length && !changed; i++) {
    if (String(current[i] || "").trim() !== headers[i]) {
      changed = true;
    }
  }
  if (changed) {
    if (sheet.getLastColumn() < headers.length) {
      sheet.insertColumnsAfter(sheet.getLastColumn(), headers.length - sheet.getLastColumn());
    }
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function mapFormResponseRow_(row, headers, responseKey, assignmentRecord, sourceRow) {
  const fullName = readFormCell_(row, headers.fullName, 1);
  const age = readFormCell_(row, headers.age, 2);
  const gender = readFormCell_(row, headers.gender, 3);
  const mobileNumber = readFormCell_(row, headers.mobileNumber, 4);
  const devoteeInTouch = readFormCell_(row, headers.devoteeInTouch, 5);
  const areaOfStay = readFormCell_(row, headers.areaOfStay, 6);
  const availabilityForService = readAvailabilityForService_(row, headers.availabilityForService, 7);
  const photoUpload = readFormCell_(row, headers.photoUpload, 8);
  const availability = parseAvailability_(availabilityForService);
  const assignedService = String(
    (assignmentRecord && assignmentRecord.assignedService) ||
    ""
  ).trim();
  const assignedCategory = String(
    (assignmentRecord && assignmentRecord.assignedCategory) ||
    ""
  ).trim();
  const assignmentUpdatedAt = String(
    (assignmentRecord && assignmentRecord.updatedAt) ||
    ""
  ).trim();
  const responseKeyValue = String(
    (assignmentRecord && assignmentRecord.responseKey) ||
    responseKey ||
    ""
  ).trim();

  if (isHeaderLikeInput_(fullName, mobileNumber, availabilityForService) || isFormHeaderRow_(row)) {
    return null;
  }

  return {
    rowNumber: sourceRow || 0,
    sourceRow: Number(sourceRow || 0),
    responseKey: responseKeyValue,
    fullName: fullName,
    age: age,
    gender: gender,
    mobileNumber: mobileNumber,
    devoteeInTouch: devoteeInTouch,
    areaOfStay: areaOfStay,
    availabilityForService: availabilityForService,
    availabilityFlags: AVAILABILITY_COLUMNS.map(function (label, index) {
      return {
        label: label,
        available: availability[index]
      };
    }),
    availabilityMap: AVAILABILITY_COLUMNS.reduce(function (acc, label, index) {
      acc[label] = Boolean(availability[index]);
      return acc;
    }, {}),
    photoUpload: photoUpload,
    assignedService: assignedService,
    assignedCategory: assignedCategory,
    assignmentUpdatedAt: assignmentUpdatedAt,
    isAssigned: Boolean(assignedService && assignedCategory)
  };
}

function readFormCell_(row, headerIndex, fallbackIndex) {
  let value = headerIndex >= 0 ? row[headerIndex] : "";
  if (value === "" || value === null || value === undefined) {
    value = fallbackIndex >= 0 ? row[fallbackIndex] : "";
  }
  return String(value || "").trim();
}

function readAvailabilityForService_(row, headerIndex, fallbackIndex) {
  const direct = readFormCell_(row, headerIndex, fallbackIndex);
  if (direct) return direct;

  const matches = [];
  const seen = {};
  const cells = Array.isArray(row) ? row : [];

  for (let i = 0; i < cells.length; i++) {
    const cellText = normalizeHeader_(cells[i]);
    if (!cellText) continue;
    for (let j = 0; j < AVAILABILITY_COLUMNS.length; j++) {
      const label = AVAILABILITY_COLUMNS[j];
      const normalizedLabel = normalizeHeader_(label);
      if (cellText.indexOf(normalizedLabel) !== -1 && !seen[label]) {
        seen[label] = true;
        matches.push(label);
      }
    }
  }

  return matches.join(", ");
}

function buildAllocatedSeedCounts_() {
  const counts = {};
  const registrations = listRegistrations();

  for (let i = 0; i < registrations.length; i++) {
    const row = registrations[i];
    const serviceName = normalizeHeader_(row.assignedService || "");
    const category = normalizeCategory_(row.assignedCategory);
    if (!serviceName || !category) continue;
    if (!counts[serviceName]) counts[serviceName] = emptyCategoryCounts();
    counts[serviceName][category] = (counts[serviceName][category] || 0) + 1;
  }

  return counts;
}

function updateServiceAllocationCount_(sheet, serviceName, category, delta) {
  const targetService = String(serviceName || "").trim();
  const targetCategory = normalizeCategory_(category);
  const step = Number(delta || 0);
  if (!targetService || !targetCategory || !step) return;

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;
  const headers = buildHeaderMap(values[0]);

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const name = String(row[headers.serviceName] || row[1] || "").trim();
    if (normalizeHeader_(name) !== normalizeHeader_(targetService)) continue;

    const columnMap = {
      Congregation: headers.allocatedCongCount,
      FOLK: headers.allocatedFolkCount,
      Employee: headers.allocatedEmpCount
    };
    const columnIndex = columnMap[targetCategory];
    if (columnIndex < 0) return;
    const current = readNumericCell_(row, columnIndex);
    const next = Math.max(0, current + step);
    row[columnIndex] = next;
    sheet.getRange(i + 1, 1, 1, values[0].length).setValues([row]);
    return;
  }
}

function updateServiceCounts(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = serviceSheet(ss);
  ensureServiceHeader(sheet);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) throw new Error("No services found");

  const headers = buildHeaderMap(values[0]);
  const serviceName = String(payload.serviceName || "").trim();
  if (!serviceName) throw new Error("Select a service");

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const name = String(row[headers.serviceName] || row[1] || "").trim();
    if (normalizeHeader_(name) !== normalizeHeader_(serviceName)) continue;

    row[headers.requiredCongCount] = readNumericPayload_(payload.requiredCongCount, row[headers.requiredCongCount]);
    row[headers.requiredFolkCount] = readNumericPayload_(payload.requiredFolkCount, row[headers.requiredFolkCount]);
    row[headers.requiredEmpCount] = readNumericPayload_(payload.requiredEmpCount, row[headers.requiredEmpCount]);
    row[headers.allocatedCongCount] = readNumericPayload_(payload.allocatedCongCount, row[headers.allocatedCongCount]);
    row[headers.allocatedFolkCount] = readNumericPayload_(payload.allocatedFolkCount, row[headers.allocatedFolkCount]);
    row[headers.allocatedEmpCount] = readNumericPayload_(payload.allocatedEmpCount, row[headers.allocatedEmpCount]);
    sheet.getRange(i + 1, 1, 1, values[0].length).setValues([row]);
    return {
      serviceName: serviceName,
      requiredCongCount: Number(row[headers.requiredCongCount] || 0),
      requiredFolkCount: Number(row[headers.requiredFolkCount] || 0),
      requiredEmpCount: Number(row[headers.requiredEmpCount] || 0),
      allocatedCongCount: Number(row[headers.allocatedCongCount] || 0),
      allocatedFolkCount: Number(row[headers.allocatedFolkCount] || 0),
      allocatedEmpCount: Number(row[headers.allocatedEmpCount] || 0)
    };
  }

  throw new Error("Service not found");
}

function readNumericCell_(row, headerIndex) {
  if (headerIndex < 0) return 0;
  const value = Number(row[headerIndex] || 0);
  return Number.isFinite(value) ? value : 0;
}

function readNumericPayload_(value, fallback) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  const fallbackValue = Number(fallback || 0);
  return Number.isFinite(fallbackValue) ? fallbackValue : 0;
}

function normalizeCategory_(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "folk") return "FOLK";
  if (text === "congregation" || text === "congregational") return "Congregation";
  if (text === "employee") return "Employee";
  return "";
}

function emptyCategoryCounts() {
  return {
    FOLK: 0,
    Congregation: 0,
    Employee: 0
  };
}

function buildResponseKey_(row) {
  return (Array.isArray(row) ? row : [])
    .map(function (cell) {
      return normalizeHeader_(cell);
    })
    .join("||");
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
    assignedCategory: String(row[headers.assignedCategory] || "").trim(),
    assignmentFlag: String(row[headers.assignmentFlag] || "").trim(),
    assignmentUpdatedAt: String(row[headers.assignmentUpdatedAt] || "").trim(),
    responseKey: String(row[headers.responseKey] || "").trim(),
    isAssigned: isAssignedRow_(row, headers)
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
    devoteeInTouch: findHeaderIndex_(normalized, [
      "devotee in touch",
      "devotee in touch kindly mention name of devotee you are in touch"
    ]),
    areaOfStay: findHeaderIndex_(normalized, ["area of staying in vizag", "area of stay"]),
    availabilityForService: findHeaderIndex_(normalized, ["availability for service"]),
    photoUpload: findHeaderIndex_(normalized, ["photo upload", "photo"]),
    formAssignedService: findHeaderIndex_(normalized, ["service assigned", "assigned service"]),
    formAssignedCategory: findHeaderIndex_(normalized, ["category", "assigned category"]),
    assignedService: findHeaderIndex_(normalized, ["assigned service", "service"]),
    assignmentUpdatedAt: findHeaderIndex_(normalized, ["assignment updated at"]),
    responseKey: findHeaderIndex_(normalized, ["response key"]),
    assignmentFlag: findHeaderIndex_(normalized, ["assignment flag", "assigned flag", "assignment status"]),
    serviceName: findHeaderIndex_(normalized, ["service name"]),
    coordinatorName: findHeaderIndex_(normalized, ["coordinator name", "service coordinator"]),
    contactNumber: findHeaderIndex_(normalized, ["coordinator contact number", "contact number"]),
    reportingTime: findHeaderIndex_(normalized, ["reporting time"]),
    requiredCount: findHeaderIndex_(normalized, ["required count", "number of volunteers required", "no of required volunteers"]),
    requiredCongCount: findHeaderIndex_(normalized, ["no. of req cong volunteers", "req cong volunteers", "cong volunteers", "congregational volunteers"]),
    requiredFolkCount: findHeaderIndex_(normalized, ["no. of req folk volunteers", "req folk volunteers", "folk volunteers"]),
    requiredEmpCount: findHeaderIndex_(normalized, ["no. of req emp volunteers", "req emp volunteers", "emp volunteers"]),
    allocatedCongCount: findHeaderIndex_(normalized, ["no. of alloc cong volunteers", "allocated cong volunteers", "alloted cong volunteers", "allotted cong volunteers"]),
    allocatedFolkCount: findHeaderIndex_(normalized, ["no. of alloc folk volunteers", "allocated folk volunteers", "alloted folk volunteers", "allotted folk volunteers"]),
    allocatedEmpCount: findHeaderIndex_(normalized, ["no. of alloc emp volunteers", "allocated emp volunteers", "alloted emp volunteers", "allotted emp volunteers"]),
    photoUrl: findHeaderIndex_(normalized, ["coordinator photo link", "photo url", "photo"]),
    assignedCategory: findHeaderIndex_(normalized, ["assigned category", "category"]),
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

function normalizeMobile(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 12 && digits.indexOf("91") === 0) return digits.slice(-10);
  if (digits.length > 10) return digits.slice(-10);
  return digits;
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
  if (!row) return false;
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
  if (!row) return false;
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

function isAssignedRow_(row, headers) {
  const flag = normalizeHeader_(row[headers.assignmentFlag] || row[18] || "");
  if (flag === "yes" || flag === "assigned" || flag === "true") return true;
  const assignedService = String(row[headers.assignedService] || "").trim();
  const assignedCategory = String(row[headers.assignedCategory] || "").trim();
  return Boolean(assignedService && assignedCategory);
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

function buildMasterRowIndex_(rows) {
  const index = {};
  for (let i = 1; i < rows.length; i++) {
    const responseKey = String(rows[i][17] || "").trim();
    const sourceRow = Number(rows[i][1] || 0);
    if (responseKey) index[responseKey] = i + 1;
    if (sourceRow) index["source:" + sourceRow] = i + 1;
  }
  return index;
}

function buildAssignmentRowIndex_(rows) {
  const index = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const record = mapAssignmentRow_(row, i + 1);
    if (!record) continue;
    if (record.responseKey) index[record.responseKey] = record;
    if (record.sourceRow) index["source:" + record.sourceRow] = record;
  }
  return index;
}

function mapAssignmentRow_(row, rowNumber) {
  const cells = Array.isArray(row) ? row : [];
  return {
    rowNumber: rowNumber,
    responseKey: String(cells[0] || "").trim(),
    sourceRow: Number(cells[1] || 0),
    fullName: String(cells[2] || "").trim(),
    age: String(cells[3] || "").trim(),
    mobileNumber: String(cells[4] || "").trim(),
    assignedService: String(cells[5] || "").trim(),
    assignedCategory: String(cells[6] || "").trim(),
    updatedAt: String(cells[7] || "").trim(),
    devoteeInTouch: String(cells[8] || "").trim(),
    areaOfStay: String(cells[9] || "").trim(),
    availabilityForService: String(cells[10] || "").trim(),
    availabilityFlags: AVAILABILITY_COLUMNS.map(function (_, index) {
      return {
        label: AVAILABILITY_COLUMNS[index],
        available: String(cells[11 + index] || "").trim().toLowerCase() === "yes"
      };
    }),
    availabilityMap: AVAILABILITY_COLUMNS.reduce(function (acc, label, index) {
      acc[label] = String(cells[11 + index] || "").trim().toLowerCase() === "yes";
      return acc;
    }, {}),
    photoUpload: String(cells[15] || "").trim(),
    isAssigned: Boolean(String(cells[5] || "").trim() && String(cells[6] || "").trim())
  };
}

function upsertAssignmentRecord_(sheet, record) {
  const rows = sheet.getDataRange().getValues();
  const rowIndex = findAssignmentRowIndex_(rows, record);
  const nextRow = [
    String(record.responseKey || "").trim(),
    Number(record.sourceRow || 0),
    String(record.fullName || "").trim(),
    String(record.age || "").trim(),
    String(record.mobileNumber || "").trim(),
    String(record.assignedService || "").trim(),
    String(record.assignedCategory || "").trim(),
    String(record.updatedAt || "").trim(),
    String(record.devoteeInTouch || "").trim(),
    String(record.areaOfStay || "").trim(),
    String(record.availabilityForService || "").trim(),
    String(record.availabilityFlags && record.availabilityFlags[0] && record.availabilityFlags[0].available ? "Yes" : "").trim(),
    String(record.availabilityFlags && record.availabilityFlags[1] && record.availabilityFlags[1].available ? "Yes" : "").trim(),
    String(record.availabilityFlags && record.availabilityFlags[2] && record.availabilityFlags[2].available ? "Yes" : "").trim(),
    String(record.availabilityFlags && record.availabilityFlags[3] && record.availabilityFlags[3].available ? "Yes" : "").trim(),
    String(record.photoUpload || "").trim()
  ];

  if (rowIndex >= 2) {
    sheet.getRange(rowIndex, 1, 1, nextRow.length).setValues([nextRow]);
  } else {
    sheet.appendRow(nextRow);
  }
}

function deleteAssignmentRecord_(sheet, criteria) {
  const rows = sheet.getDataRange().getValues();
  const rowIndex = findAssignmentRowIndex_(rows, criteria);
  if (rowIndex >= 2) {
    sheet.deleteRow(rowIndex);
  }
}

function findAssignmentRowIndex_(rows, criteria) {
  const responseKey = String(criteria && criteria.responseKey || "").trim();
  const sourceRow = Number(criteria && criteria.sourceRow || 0);

  for (let i = 1; i < rows.length; i++) {
    const rowResponseKey = String(rows[i][0] || "").trim();
    const rowSourceRow = Number(rows[i][1] || 0);

    if (responseKey && rowResponseKey && rowResponseKey === responseKey) return i + 1;
    if (sourceRow && rowSourceRow && rowSourceRow === sourceRow) return i + 1;
  }

  return -1;
}

function findFormResponseRowByResponseKey_(rows, headers, responseKey) {
  const target = String(responseKey || "").trim();
  if (!target) return null;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (buildResponseKey_(row) === target) {
      return {
        row: row,
        rowNumber: i + 1,
        responseKey: target
      };
    }
  }

  return null;
}

function buildAssignmentRecordFromFormRow_(row, headers, existingRecord) {
  const sourceRow = Number(existingRecord && existingRecord.sourceRow || 0);
  const responseKey = String(existingRecord && existingRecord.responseKey || buildResponseKey_(row) || "").trim();
  const mapped = mapFormResponseRow_(row, headers, responseKey, existingRecord || null, sourceRow);
  if (!mapped) return null;

  return {
    responseKey: String(mapped.responseKey || responseKey || "").trim(),
    sourceRow: Number(existingRecord && existingRecord.sourceRow || mapped.sourceRow || 0),
    fullName: String(mapped.fullName || "").trim(),
    age: String(mapped.age || "").trim(),
    mobileNumber: String(mapped.mobileNumber || "").trim(),
    assignedService: String(existingRecord && existingRecord.assignedService || "").trim(),
    assignedCategory: String(existingRecord && existingRecord.assignedCategory || "").trim(),
    updatedAt: String(existingRecord && existingRecord.updatedAt || "").trim(),
    devoteeInTouch: String(mapped.devoteeInTouch || "").trim(),
    areaOfStay: String(mapped.areaOfStay || "").trim(),
    availabilityForService: String(mapped.availabilityForService || "").trim(),
    availabilityFlags: mapped.availabilityFlags || [],
    availabilityMap: mapped.availabilityMap || {},
    photoUpload: String(mapped.photoUpload || "").trim()
  };
}

function buildAssignmentRecordFromPayload_(payload, row, headers, options) {
  const mapped = row ? mapFormResponseRow_(row, headers, options.responseKey, options.previousRecord || null, options.sourceRow) : null;
  const fallback = mapped || {};
  const availabilityFlags = Array.isArray(payload.availabilityFlags) ? payload.availabilityFlags : (fallback.availabilityFlags || []);
  const responseKey = String(options.responseKey || payload.responseKey || fallback.responseKey || (row ? buildResponseKey_(row) : "") || "").trim();

  return {
    responseKey: responseKey,
    sourceRow: Number(options.sourceRow || payload.sourceRow || fallback.sourceRow || 0),
    fullName: String(payload.fullName || fallback.fullName || "").trim(),
    age: String(payload.age || fallback.age || "").trim(),
    mobileNumber: String(payload.mobileNumber || fallback.mobileNumber || "").trim(),
    assignedService: String(options.assignedService || payload.serviceName || fallback.assignedService || "").trim(),
    assignedCategory: String(options.assignedCategory || payload.category || fallback.assignedCategory || "").trim(),
    updatedAt: String(options.updatedAt || fallback.updatedAt || formatNow_()).trim(),
    devoteeInTouch: String(payload.devoteeInTouch || fallback.devoteeInTouch || "").trim(),
    areaOfStay: String(payload.areaOfStay || fallback.areaOfStay || "").trim(),
    availabilityForService: String(payload.availabilityForService || fallback.availabilityForService || "").trim(),
    availabilityFlags: availabilityFlags,
    availabilityMap: payload.availabilityMap || fallback.availabilityMap || {},
    photoUpload: String(payload.photoUpload || fallback.photoUpload || "").trim()
  };
}

function normalizeAssignmentRegistration_(record) {
  return {
    rowNumber: Number(record.rowNumber || 0),
    sourceRow: Number(record.sourceRow || 0),
    responseKey: String(record.responseKey || "").trim(),
    fullName: String(record.fullName || "").trim(),
    age: String(record.age || "").trim(),
    mobileNumber: String(record.mobileNumber || "").trim(),
    devoteeInTouch: String(record.devoteeInTouch || "").trim(),
    areaOfStay: String(record.areaOfStay || "").trim(),
    availabilityForService: String(record.availabilityForService || "").trim(),
    availabilityFlags: Array.isArray(record.availabilityFlags) ? record.availabilityFlags : [],
    availabilityMap: record.availabilityMap || {},
    photoUpload: String(record.photoUpload || "").trim(),
    assignedService: String(record.assignedService || "").trim(),
    assignedCategory: String(record.assignedCategory || "").trim(),
    assignmentUpdatedAt: String(record.updatedAt || "").trim(),
    isAssigned: Boolean(String(record.assignedService || "").trim() && String(record.assignedCategory || "").trim())
  };
}

function isValidRegistrationRecord_(row) {
  if (!row) return false;
  const fullName = normalizeHeader_(row.fullName || "");
  const mobileNumber = normalizeHeader_(row.mobileNumber || "");
  const age = normalizeHeader_(row.age || "");
  return Boolean(fullName || mobileNumber || age);
}

function formatNow_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Calcutta", "yyyy-MM-dd HH:mm:ss");
}

function buildVolunteerFingerprint_(fullName, mobileNumber, age) {
  const name = normalizeHeader_(fullName);
  const mobile = normalizeMobile(mobileNumber);
  const volunteerAge = normalizeHeader_(age);
  if (!name || !mobile || !volunteerAge) return "";
  return name + "||" + mobile + "||" + volunteerAge;
}
