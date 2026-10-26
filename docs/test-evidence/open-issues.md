# Open Issues and Verification Gaps

- **Phase 3 startup and live HTTP checks were not run**, at the user's direction. The server's startup against a configured deployment database, admin bootstrap in that deployment, and requested live `curl` status codes remain unverified. No production database was contacted.
- Initial dependency audits found four backend vulnerable packages and three frontend vulnerable packages. Both sets were remediated by `npm audit fix` without `--force`; final audits report **0 vulnerabilities** in both projects. No breaking major upgrade was required.
- Frontend build succeeded but Vite warned that the minified JS bundle is **722.28 kB**, above its 500 kB warning threshold.
- Frontend install warned that the `esbuild@0.25.12` install script is not yet covered by the allow-scripts policy. Lint, tests, and build passed regardless.
- The requested dead-file search covered static and dynamic import patterns, symbol references, and CSS `@import`; fourteen confirmed unused files were removed. Customer [Reservations.jsx](../../frontend/src/Customer/react/Reservations.jsx) remains because customer routes import it. `main.jsx` and test files remain intact.
- The first integration attempt failed because the test fixtures used invalid `.test` email domains. The fixture was corrected; the focused suite then passed.
- One integration assertion initially checked a field omitted from the mechanic API response; it was corrected to verify the persisted timestamp. Latest complete backend suite passed: 18 files, 96 passed, 0 failed, 0 skipped.
- Post-remediation frontend validation passed: 2 test files / 7 tests, lint clean, and production build successful. The existing chunk-size warning remains as noted above.
- No unresolved dependency audit findings or test, lint, or build failures remain.
