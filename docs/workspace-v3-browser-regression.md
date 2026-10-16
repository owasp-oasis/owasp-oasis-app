# Workspace v3 browser regression coverage

The local Workspace preview is the only permitted target for this suite. It
uses synthetic identities and blocks outbound requests.

Run the browser checks with:

```bash
npm run test:e2e
```

The suite runs in Chromium and WebKit and covers:

- queue-to-review deep links and selected-row visibility;
- Split, Table, and Focus layout selection;
- comments loading and review action presentation;
- Preferences and Teams entry points;
- mobile vote-button hit targets at 390×844;
- the validation footer remaining inside a 1440×900 desktop viewport.

## Safari footer regression

The live Preview regression occurred because an inline review panel used a
viewport-height calculation while it started below the Workspace header,
toolbar, and filter summary. The panel therefore extended below the viewport,
especially in Safari's small/dynamic viewport calculations.

The fix bounds the desktop review grid to `100svh` after the Workspace chrome,
lets the detail body own scrolling, and makes the validation footer part of the
bounded panel. The WebKit footer test is the acceptance check for this bug.

The suite does not claim that GitHub OAuth writes or remote D1 migrations work;
those remain staging checks.
