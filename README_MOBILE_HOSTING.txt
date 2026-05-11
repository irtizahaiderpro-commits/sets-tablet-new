SETS Tablet App v40 - mobile/tablet client preview

What changed in this package:
- Phone/tablet responsive shell added.
- Main app container now uses mobile-safe height instead of forcing a desktop viewport.
- Headers wrap correctly on small screens.
- Dashboard/manager sections stack on phone/tablet instead of using a fixed left sidebar layout.
- Form controls use mobile-friendly tap sizes and 16px input text to avoid iPhone zoom.
- Static preview and built dist files were patched so this can be hosted directly.

Hosting quickest option:
- Upload the contents of the dist folder to Netlify, Vercel, or any static hosting.
- Or upload the static-preview folder if you only want to show the mock-up preview.

Local Windows preview:
- Run START_DASHBOARD_WINDOWS.bat for Vite/local dashboard preview.
- Run START_STATIC_PREVIEW_WINDOWS.bat for the static preview.
