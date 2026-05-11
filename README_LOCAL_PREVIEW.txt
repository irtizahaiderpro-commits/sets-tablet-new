SETS Yard Visibility Dashboard Preview - v26
==========================================

This package contains the updated Stage 3 Throughput Details page.

Recommended preview on Windows:
1. Extract the ZIP.
2. Double-click START_STATIC_PREVIEW_WINDOWS.bat.
3. If that does not open, double-click START_STATIC_SERVER_WINDOWS.bat.
4. For full development preview, install Node.js LTS and double-click START_DASHBOARD_WINDOWS.bat.

v26 changes:
- Rebuilt Throughput Details page.
- Added a proper visible stacked bar chart for Throughput Last 7 Days.
- Added KPI cards: total movements, daily average, peak day, busiest service.
- Added service split panel for washing, heating and storage.
- Added arrivals/ready movement summary for context.
- Added day-by-day throughput table.
- Added next-phase reminder notes for live data rules.
- Did not change form/validation logic.

Mock-up note:
Demo Mode figures are sample busy-yard values for presentation. In the next phase, throughput rules should be agreed with SETS, for example whether throughput means completed services only, all tank movements, or chargeable movements.


V27 update: Stage 4 Recent Tank Records page rebuilt as a separate manager table with filters, summary cards, action buttons, demo/live/draft/final badges, and links back to Saved Records / Print.

v30 navigation cleanup notes:
- Dashboard sidebar now uses full labels, descriptions, active state and tooltips.
- All management pages are directly reachable from every dashboard page: Dashboard Overview, Yard Status Details, Throughput Details, Recent Tank Records, Saved Records / Print, and Review Needed.
- Review Needed carries a visible count badge.
- Home and New / Existing Intake remain available from the sidebar for workflow access.


Version v30 notes:
- Stage 7 implemented: clear data separation between demo sample records, live user-created records, live drafts, review-needed records, ready-to-print records and final saved records.
- New Data Separation management page added from Dashboard and sidebar.

V31 - Print and PDF labelling
- Print/PDF buttons now use explicit output labels: DRAFT / REVIEW NEEDED, READY TO PRINT, FINAL SAVED RECORD.
- Browser print title is generated from tank number and output status.
- Record print view includes a visible output status strip.
- Draft outputs remain allowed for mock-up review, but they are clearly marked as not final.
