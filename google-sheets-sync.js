/**
 * OASIS — Google Sheets Auto-Import
 * 
 * HOW TO SET UP:
 * 1. Open Google Sheets → Extensions → Apps Script
 * 2. Paste this entire file
 * 3. Replace WORKER_URL and API_SECRET below
 * 4. Click Run → authorise
 * 5. Set a trigger: clock icon → Add Trigger → syncRegistrations → Time-driven → Every hour
 */

// ─── CONFIG ──────────────────────────────────────────────────
const WORKER_URL  = 'https://www.owasp-oasis.com'; // your live Worker URL
const API_SECRET  = 'REPLACE_WITH_A_SECRET_YOU_MAKE_UP'; // set same value in wrangler.toml vars

// Sheet names
const SHEET_REGISTRATIONS = 'Registrations';
const SHEET_LOG           = 'Sync Log';

// ─── MAIN SYNC FUNCTION ───────────────────────────────────────
function syncRegistrations() {
  try {
    const response = UrlFetchApp.fetch(`${WORKER_URL}/api/admin/registrations`, {
      method: 'GET',
      headers: {
        'X-Admin-Secret': API_SECRET,
        'Content-Type': 'application/json',
      },
      muteHttpExceptions: true,
    });

    if (response.getResponseCode() !== 200) {
      logSync(`ERROR: HTTP ${response.getResponseCode()} — ${response.getContentText()}`);
      return;
    }

    const data = JSON.parse(response.getContentText());
    const registrations = data.registrations || [];

    if (!registrations.length) {
      logSync('No registrations found.');
      return;
    }

    writeToSheet(registrations);
    logSync(`Synced ${registrations.length} registrations successfully.`);

  } catch (err) {
    logSync(`ERROR: ${err.message}`);
  }
}

// ─── WRITE TO SHEET ───────────────────────────────────────────
function writeToSheet(registrations) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let sheet   = ss.getSheetByName(SHEET_REGISTRATIONS);

  // Create sheet if it doesn't exist
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_REGISTRATIONS);
  }

  // Clear existing data
  sheet.clearContents();

  // Headers
  const headers = ['ID', 'Name', 'Email', 'GitHub', 'Role', 'Registered At'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Style header row
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#0B4F8A');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(11);

  // Data rows
  const rows = registrations.map(r => [
    r.id         || '',
    r.name       || '',
    r.email      || '',
    r.github     || '',
    r.role       || '',
    r.created_at ? new Date(r.created_at).toLocaleString() : '',
  ]);

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  // Auto-resize columns
  for (let i = 1; i <= headers.length; i++) {
    sheet.autoResizeColumn(i);
  }

  // Freeze header row
  sheet.setFrozenRows(1);

  // Add summary at top
  const totalCell = sheet.getRange('H1');
  totalCell.setValue(`Total: ${rows.length}`);
  totalCell.setFontWeight('bold');
  totalCell.setFontColor('#0B4F8A');
}

// ─── SYNC LOG ─────────────────────────────────────────────────
function logSync(message) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let sheet   = ss.getSheetByName(SHEET_LOG);
  if (!sheet) sheet = ss.insertSheet(SHEET_LOG);

  sheet.appendRow([new Date().toLocaleString(), message]);
  Logger.log(message);
}

// ─── MANUAL TRIGGER (run from sheet menu) ────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('OASIS')
    .addItem('Sync Registrations Now', 'syncRegistrations')
    .addToUi();
}
