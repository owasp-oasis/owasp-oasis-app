/**
 * OASIS — Google Sheets registration import endpoint.
 *
 * Deploy this as a Google Apps Script web app and configure the
 * SHEETS_SYNC_SECRET script property. Cloudflare sends an HMAC-signed payload;
 * the secret itself never crosses the wire.
 */

const SHEET_REGISTRATIONS = 'Registrations';
const SHEET_LOG = 'Sync Log';
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

function jsonResponse(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function bytesToHex(bytes) {
  return bytes
    .map(byte => ((byte + 256) % 256).toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function verifyEnvelope(envelope, secret) {
  if (!envelope || typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string') {
    throw new Error('Invalid envelope');
  }

  const expected = bytesToHex(Utilities.computeHmacSha256Signature(
    envelope.payload,
    secret,
    Utilities.Charset.UTF_8,
  ));
  if (!constantTimeEqual(envelope.signature, expected)) throw new Error('Invalid signature');

  const payload = JSON.parse(envelope.payload);
  if (payload.version !== 1 || !Array.isArray(payload.registrations)) {
    throw new Error('Unsupported payload');
  }

  const sentAt = Date.parse(payload.sent_at);
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > MAX_CLOCK_SKEW_MS) {
    throw new Error('Expired payload');
  }
  return payload;
}

function doPost(e) {
  try {
    const secret = PropertiesService.getScriptProperties().getProperty('SHEETS_SYNC_SECRET') || '';
    if (!secret) throw new Error('Sync secret is not configured');
    if (!e || !e.postData || typeof e.postData.contents !== 'string') {
      throw new Error('Request body is required');
    }

    const envelope = JSON.parse(e.postData.contents);
    const payload = verifyEnvelope(envelope, secret);
    writeToSheet(payload.registrations);
    logSync(`Cloudflare Worker synced ${payload.registrations.length} registrations.`);
    return jsonResponse({ ok: true, count: payload.registrations.length });
  } catch (err) {
    logSync('ERROR: registration sync failed.');
    return jsonResponse({ ok: false, error: 'Sync rejected' });
  }
}

function writeToSheet(registrations) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_REGISTRATIONS);
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
    const rows = registrations.map(registration => [
      registration.id || '',
      registration.name || '',
      registration.email || '',
      registration.github || '',
      registration.role || '',
      registration.created_at ? new Date(registration.created_at).toLocaleString() : '',
    ]);
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  for (let column = 1; column <= headers.length; column++) sheet.autoResizeColumn(column);
  sheet.setFrozenRows(1);
  sheet.getRange('H1').setValue(`Total: ${registrations.length}`)
    .setFontWeight('bold').setFontColor('#0B4F8A');
}

function logSync(message) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_LOG);
  if (!sheet) sheet = ss.insertSheet(SHEET_LOG);
  sheet.appendRow([new Date().toLocaleString(), message]);
}
