"""Exercise workflow shell steps with synthetic responses and no network access."""
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

WORKFLOW = Path(__file__).resolve().parents[2] / '.github/workflows/sync-sheets.yml'
SENTINEL = 'private-contact@example.invalid'


class SheetsWorkflowPrivacyTest(unittest.TestCase):
    def run_step(self, step_name, status='200'):
        text = WORKFLOW.read_text()
        section = text.split(f'- name: {step_name}\n', 1)[1].split('\n      - name:', 1)[0]
        script = section.split('run: |\n', 1)[1]
        script = '\n'.join(line[10:] for line in script.splitlines())
        script = re.sub(r'\$\{\{.*?\}\}', 'synthetic-test-secret', script)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            # Isolate the workflow's files from any real local files.
            script = script.replace('/tmp/', directory + '/')
            (root / 'registrations.json').write_text(json.dumps({
                'ok': True, 'registrations': [{'email': SENTINEL, 'name': 'Synthetic Contact'}],
            }))
            mock = root / 'curl'
            mock.write_text('''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
args = sys.argv[1:]
status = os.environ['TEST_HTTP_STATUS']
body = {'ok': True, 'registrations': [{'email': 'private-contact@example.invalid', 'name': 'Synthetic Contact'}]}
Path(args[args.index('-o') + 1]).write_text(json.dumps(body))
if '-w' in args:
    print(status, end='')
if '--fail' in args and int(status) >= 400:
    sys.exit(22)
''')
            mock.chmod(0o700)
            result = subprocess.run(['bash', '-e', '-o', 'pipefail', '-c', script],
                env={**os.environ, 'PATH': directory + os.pathsep + os.environ['PATH'],
                     'TEST_HTTP_STATUS': status}, capture_output=True, text=True)
            self.assertNotIn(SENTINEL, result.stdout + result.stderr)
            self.assertNotIn('Synthetic Contact', result.stdout + result.stderr)
            return result

    def test_fetch_reports_only_aggregate(self):
        result = self.run_step('Fetch registrations from Cloudflare Worker')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('Total registrations: 1', result.stdout)

    def test_fetch_http_failure_stops_step(self):
        result = self.run_step('Fetch registrations from Cloudflare Worker', '401')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('Total registrations:', result.stdout)

    def test_webhook_success_does_not_print_echoed_contacts(self):
        self.assertEqual(self.run_step('Push to Google Sheets').returncode, 0)

    def test_webhook_failure_does_not_print_echoed_contacts(self):
        self.assertNotEqual(self.run_step('Push to Google Sheets', '500').returncode, 0)


if __name__ == '__main__':
    unittest.main()
