#!/usr/bin/env node
/**
 * OWASP OASIS — Export D1 database to CSV
 * Usage: node export-db.js
 * Output: registrations.csv and applications.csv
 */

const { execSync } = require('child_process');
const fs = require('fs');

const DB = 'oasis-db';

function query(sql) {
  try {
    const result = execSync(
      `npx wrangler d1 execute ${DB} --command="${sql}" --remote --json`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    // Wrangler outputs JSON array — grab results from last entry
    const parsed = JSON.parse(result);
    const data = Array.isArray(parsed) ? parsed[parsed.length - 1] : parsed;
    return data.results || [];
  } catch (err) {
    console.error('Query failed:', err.message);
    return [];
  }
}

function toCSV(rows) {
  if (!rows.length) return 'No data found.\n';
  // Headers — exclude ip_hash for privacy
  const headers = Object.keys(rows[0]).filter(k => k !== 'ip_hash');
  const lines = [headers.join(',')];
  for (const row of rows) {
    const values = headers.map(h => {
      const val = row[h] ?? '';
      // Escape quotes and wrap in quotes if contains comma/newline
      const str = String(val).replace(/"/g, '""');
      return str.includes(',') || str.includes('\n') || str.includes('"')
        ? `"${str}"`
        : str;
    });
    lines.push(values.join(','));
  }
  return lines.join('\n') + '\n';
}

function exportTable(tableName, filename) {
  console.log(`\nExporting ${tableName}...`);
  const rows = query(`SELECT * FROM ${tableName} ORDER BY created_at DESC`);
  if (!rows.length) {
    console.log(`  No records found in ${tableName}.`);
    fs.writeFileSync(filename, `No records in ${tableName}.\n`);
    return;
  }
  const csv = toCSV(rows);
  fs.writeFileSync(filename, csv);
  console.log(`  ✓ ${rows.length} records → ${filename}`);
}

console.log('OASIS DB Export');
console.log('───────────────');

exportTable('registrations', 'registrations.csv');
exportTable('applications',  'applications.csv');

// Summary
console.log('\nSummary:');
const regCount = query('SELECT COUNT(*) as total FROM registrations');
const appCount = query('SELECT COUNT(*) as total FROM applications');
console.log(`  Registrations : ${regCount[0]?.total ?? 0}`);
console.log(`  Applications  : ${appCount[0]?.total ?? 0}`);

// Role breakdown
const roles = query(`
  SELECT role, COUNT(*) as count
  FROM applications
  GROUP BY role
  ORDER BY count DESC
`);
if (roles.length) {
  console.log('\nApplications by role:');
  roles.forEach(r => console.log(`  ${r.role || 'none'}: ${r.count}`));
}

console.log('\nDone. Files saved: registrations.csv, applications.csv');
