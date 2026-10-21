# Tests

Two kinds:

1. **`workout-tests.html`** (in the app folder). Open it from the same address as the app. It checks the shared maths and the
   library file, reads none of your data and changes nothing.
2. **`tests/e2e.py`**. Drives the real app in a headless browser against `sample-backup.json` (a copy of one of your exports):
   merging, undo, two-device sync, chains, the custom dropdowns, reset, the backup reminder and the graph page.
   Each run starts from a fresh browser, so your real data is never touched.

Run the second kind on a computer:

    pip install playwright
    playwright install chromium
    cd tests
    python3 e2e.py

Every line starts with PASS or FAIL. Use another backup with `WORKOUT_BACKUP=/path/to/backup.json python3 e2e.py`
(the merge checks expect the names in the sample backup, so those may fail on a different one).

# Editing `workout-log.js`

`workout-log.js` is built from the parts in `src/`. Edit a part, then run `node build.js`
(`node build.js --check` tells you whether the built file is up to date).
