import { describe, expect, it } from 'vitest';
import {
  createSheetsSyncEnvelope,
  scheduledTaskForCron,
  signSheetsPayload,
} from '../../../worker/sheetsSync.js';

describe('Sheets sync signing and scheduling', () => {
  it('matches the standard HMAC-SHA256 test vector', async () => {
    await expect(signSheetsPayload('The quick brown fox jumps over the lazy dog', 'key')).resolves.toBe(
      'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
    );
  });

  it('signs the exact serialized payload sent in the envelope', async () => {
    const envelope = await createSheetsSyncEnvelope(
      [{
        id: 1,
        name: 'Reporter',
        email: 'reporter@example.org',
        github: 'reporter',
        role: 'validator',
        created_at: '2026-08-18T20:00:00.000Z',
      }],
      'sync-secret',
      new Date('2026-08-18T20:15:00.000Z'),
    );

    expect(JSON.parse(envelope.payload)).toEqual({
      version: 1,
      sent_at: '2026-08-18T20:15:00.000Z',
      registrations: [{
        id: 1,
        name: 'Reporter',
        email: 'reporter@example.org',
        github: 'reporter',
        role: 'validator',
        created_at: '2026-08-18T20:00:00.000Z',
      }],
    });
    await expect(signSheetsPayload(envelope.payload, 'sync-secret')).resolves.toBe(envelope.signature);
    await expect(signSheetsPayload(`${envelope.payload} `, 'sync-secret')).resolves.not.toBe(envelope.signature);
  });

  it('routes only the configured GitHub and Sheets cron expressions', () => {
    expect(scheduledTaskForCron('0 */4 * * *')).toBe('github_sync');
    expect(scheduledTaskForCron('15 * * * *')).toBe('sheets_sync');
    expect(scheduledTaskForCron('0 * * * *')).toBeNull();
  });
});
