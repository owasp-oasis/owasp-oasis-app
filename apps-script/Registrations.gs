/**
 * OASIS — Google Sheets Auto-Import
 *
 * ADMIN_SECRET is read from Apps Script Properties. Keep the value out of
 * source control and configure it once per Apps Script project.
 */

const WORKER_URL          = 'https://www.owasp-oasis.org';
const SHEET_REGISTRATIONS = 'Registrations';
const SHEET_LOG           = 'Sync Log';

// ─── CALLED BY GITHUB ACTIONS (POST with data + secret) ──────
function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!isAuthorized(e)) return jsonResponse({ ok: false, error: 'Unauthorised' });

    const registrations = data.registrations || [];
    if (!Array.isArray(registrations)) {
      throw new Error('registrations must be an array');
    }

    writeToSheet(registrations);
    logSync(`GitHub Actions synced ${registrations.length} registrations.`);
    return jsonResponse({ ok: true, count: registrations.length });
  } catch (err) {
    logSync(`ERROR (doPost): ${err.message}`);
    return jsonResponse({ ok: false, error: err.message });
  }
}

// ─── CALLED MANUALLY (GET) ────────────────────────────────────
function doGet(e) {
  try {
    if (!isAuthorized(e)) return jsonResponse({ ok: false, error: 'Unauthorised' });
    syncRegistrations();
    return jsonResponse({ ok: true, message: 'Sync complete' });
  } catch (err) {
    logSync(`ERROR (doGet): ${err.message}`);
    return jsonResponse({ ok: false, error: err.message });
  }
}

// ─── FETCH FROM WORKER AND SYNC ───────────────────────────────
function syncRegistrations() {
  const adminSecret = getAdminSecret();
  const response = UrlFetchApp.fetch(`${WORKER_URL}/api/admin/registrations`, {
    method: 'GET',
    headers: { 'X-Admin-Secret': adminSecret },
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() !== 200) {
    throw new Error(`HTTP ${response.getResponseCode()}: ${response.getContentText()}`);
  }

  const data = JSON.parse(response.getContentText());
  const registrations = data.registrations || [];
  if (!Array.isArray(registrations)) throw new Error('Worker returned an invalid registrations list');

  writeToSheet(registrations);
  logSync(`Synced ${registrations.length} registrations.`);
}

// ─── SECRET CONFIGURATION ────────────────────────────────────
// Run setAdminSecret once manually in each Apps Script project, passing the
// value from the deployment secret store. The value is never saved in source.
function setAdminSecret(secret) {
  if (typeof secret !== 'string' || !secret) {
    throw new Error('Pass a non-empty ADMIN_SECRET string.');
  }
  PropertiesService.getScriptProperties().setProperty('ADMIN_SECRET', secret);
  Logger.log('ADMIN_SECRET saved to Script Properties.');
}

function getAdminSecret() {
  const secret = PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET');
  if (!secret) throw new Error('ADMIN_SECRET is not configured');
  return secret;
}

function isAuthorized(e) {
  const supplied = e && e.parameter && e.parameter.secret;
  const stored = PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET');
  return Boolean(supplied && stored && supplied === stored);
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
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
