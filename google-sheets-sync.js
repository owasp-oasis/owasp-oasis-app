/**
 * OASIS — Google Sheets Auto-Import
 * Accepts data POSTed from GitHub Actions OR fetches directly
 */

const WORKER_URL  = 'https://www.owasp-oasis.org';
const API_SECRET  = 'oasis-admin-2026-xK9mP3q7*';
const SHEET_REGISTRATIONS = 'Registrations';
const SHEET_LOG           = 'Sync Log';

// ─── CALLED BY GITHUB ACTIONS (POST with data) ───────────────
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const registrations = data.registrations || [];
    writeToSheet(registrations);
    logSync(`GitHub Actions synced ${registrations.length} registrations.`);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, count: registrations.length }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    logSync(`ERROR (doPost): ${err.message}`);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ─── CALLED MANUALLY (GET) ────────────────────────────────────
function doGet(e) {
  try {
    syncRegistrations();
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, message: 'Sync complete' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ─── FETCH FROM WORKER AND SYNC ───────────────────────────────
function syncRegistrations() {
  const response = UrlFetchApp.fetch(`${WORKER_URL}/api/admin/registrations`, {
    method: 'GET',
    headers: { 'X-Admin-Secret': API_SECRET },
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() !== 200) {
    throw new Error(`HTTP ${response.getResponseCode()}: ${response.getContentText()}`);
  }

  const data = JSON.parse(response.getContentText());
  const registrations = data.registrations || [];
  writeToSheet(registrations);
  logSync(`Synced ${registrations.length} registrations.`);
}

// ─── WRITE TO SHEET ───────────────────────────────────────────
function writeToSheet(registrations) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let sheet   = ss.getSheetByName(SHEET_REGISTRATIONS);
  if (!sheet) sheet = ss.insertSheet(SHEET_REGISTRATIONS);

  sheet.clearContents();

  const headers = ['ID', 'Name', 'Email', 'GitHub', 'Role', 'Registered At'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#0B4F8A');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(11);

  if (registrations.length > 0) {
    const rows = registrations.map(r => [
      r.id || '', r.name || '', r.email || '',
      r.github || '', r.role || '',
      r.created_at ? new Date(r.created_at).toLocaleString() : '',
    ]);
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  for (let i = 1; i <= headers.length; i++) sheet.autoResizeColumn(i);
  sheet.setFrozenRows(1);

  sheet.getRange('H1').setValue(`Total: ${registrations.length}`)
    .setFontWeight('bold').setFontColor('#0B4F8A');
}

// ─── LOG ──────────────────────────────────────────────────────
function logSync(message) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_LOG);
  if (!sheet) sheet = ss.insertSheet(SHEET_LOG);
  sheet.appendRow([new Date().toLocaleString(), message]);
}

// ─── MENU ─────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('OASIS')
    .addItem('Sync Now', 'syncRegistrations')
    .addToUi();
}
