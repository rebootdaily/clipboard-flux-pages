/* Clipboard-Flux -- Milestone 22.1 follow-up: the field report ("Settings
   still doesn't open anything") persisted after the pointer-capture fix
   below, on an iPad where the button visibly reacts to a tap and every
   other Footprint control already worked correctly -- which pointed away
   from pointer capture entirely. Confirmed via getComputedStyle() (not
   just the `hidden` IDL property, which reads correctly regardless of
   what actually renders): `.footprint-settings-popover`'s own
   `display:flex` was silently overriding the browser's built-in
   `[hidden]{display:none}` rule the whole time -- author-stylesheet
   `display` always outranks the user-agent stylesheet's [hidden] rule in
   the CSS cascade, regardless of source order. The popover was visually
   present at every Footprint tab visit from the moment Milestone 22
   shipped, `hidden` attribute or not; toggling it via JS genuinely never
   had any visual effect. This exact gotcha was already correctly handled
   for every *other* hidden-toggled panel in this file (.field-note,
   .photo-panel, .disregarded-list each carry their own explicit
   `[hidden]{display:none}` override in index.html) -- Milestone 22 simply
   didn't extend that established convention to the new popover. Fixed
   with the identical one-line pattern: `.footprint-settings-popover
   [hidden]{display:none}`. The pointer-capture/touch-action/layering
   fixes below are kept -- real, defensible, spec-compliant hardening --
   they just weren't the actual cause of this particular symptom.

   Milestone 22.1: field-reported corrective fix --
   the Footprint Settings button didn't reliably respond to a first real
   tap on physical touch hardware. Root cause (by code inspection; see
   footprintEndPointer()'s own comment): pointer capture on the drawing
   canvas was only ever released implicitly (relying on the browser's
   own auto-release on pointerup/pointercancel), never explicitly --
   exactly the kind of gap that manifests only on real touch hardware a
   mouse or synthetic pointer-event test can't reproduce. Fixed with an
   explicit releasePointerCapture() call plus a defensive
   footprintAbortActiveGesture() guard called at the top of every
   toolbar handler (belt-and-suspenders: toolbar interaction always wins
   over stale canvas gesture state, by construction). Also added
   touch-action:manipulation and a slightly larger touch target to every
   Footprint toolbar/settings control, and made the toolbar's layering
   above the canvas explicit via z-index rather than relying on DOM
   order alone. No change to the line-assist algorithm, drawing model,
   persistence, or PDF export.

   Milestone 22: Footprint, a freehand sketching tab
   ("digital graph paper," per that milestone's own framing) with
   intelligent straight-line assist -- a rough hand-drawn stroke becomes
   a clean straight segment on pointer-lift when it looks line-like,
   using the stroke's own actual start/end points, never a length prompt
   or CAD-style snapping. Full design/rationale lives as a block comment
   directly above the Footprint tab's own code (search "Footprint tab
   (Milestone 22)") rather than repeated here -- see that section for
   the drawing-engine architecture, the classifyStroke() line-intent
   algorithm, persistence, and PDF full-bounds export.

   Milestone 21: general inspection photos ("Front",
   "Rear", "Kitchen", etc. -- photos that don't belong to any single
   questionnaire field) plus the workbook PHOTO LABELS sheet that
   configures them, and a new synthetic "Photos" app tab between Exit
   Interview and Inspection.

   Data model: reuses the existing Milestone 14/15 `photos` IndexedDB
   store and record shape completely -- no new store, no version bump.
   A field photo has fieldId set, category/label always null. A general
   photo has fieldId null, and category/label that start null
   ("Unassigned" is just that -- not a separate flag or error state, see
   Milestone 21 #6) until assigned via the picker on its thumbnail.
   Existing field-photo records simply don't have category/label
   properties at all (IndexedDB is schemaless per-record), which
   toCacheEntry() already treats identically to explicit null -- so nothing
   about existing inspections needed migrating. loadAllPhotosIntoCache()
   partitions one inspectionId-scoped read into photosByField (unchanged)
   and the new flat `generalPhotos` array by checking fieldId, instead of
   a second IndexedDB query. ingestPhoto()/ingestGeneralPhoto() share one
   decode-thumbnail-write pipeline (decodeAndStorePhoto()); deletePhoto()/
   deleteGeneralPhoto() and the two ingest functions are otherwise
   deliberately parallel, one array each, same as photosByField's own
   per-field pattern. assignPhotoLabel() (Milestone 21.1: renamed and
   generalized from assignGeneralPhotoLabel(), see that milestone's own
   header section below) is the one function that changes an *existing*
   photo's category/label (re-reading the full record from IndexedDB
   first, since the in-memory cache entry never holds real Blobs -- see
   toCacheEntry()) -- reassignment and "return to Unassigned"/"remove
   report label" are the exact same call with different arguments, never
   a delete-and-recreate.

   The Photos tab (renderPhotosTabHtml()) puts Photo Library and Take
   Photo first, exactly like every per-field photo panel already does,
   then a compact checklist (Milestone 21 #7) built straight from
   CFG.photoLabels -- the workbook is the only source of truth for the
   label list, nothing is hard-coded here -- then a thumbnail grid where
   each photo carries a native <select> label picker (deliberately not a
   custom modal, see generalPhotoLabelSelectHtml()'s comment). Reassigning
   a label never changes a photo's position in the grid, only its
   caption/the checklist counts, so the grid stays calm to work through
   one-handed.

   PDF export gets a second, separate "GENERAL PHOTOS" section
   (pdfBuildGeneralPhotosSectionHtml()) after the existing field-photo
   "PHOTOS" section -- grouped by category then label in workbook order,
   Unassigned always last and never silently dropped, reusing the exact
   same .pdf-photo-group/.pdf-photo-grid CSS the field-photo section
   already established. JSON export adds category/label to each photo's
   metadata for round-trip fidelity only, same as every other photo
   field there -- import still never fabricates a Blob from JSON
   metadata (Milestone 16's own rule, unchanged).

   Reset/New/Load need zero new code for general photos:
   idbDeleteAllPhotosForInspection() already deletes by inspectionId
   regardless of fieldId, and switchToInspection()'s existing
   loadAllPhotosIntoCache() call already repopulates `generalPhotos`
   fresh for whichever inspection is now active, the same way it always
   has for photosByField.

   ---- Milestone 21.1: unified inspection photo library -- corrective
   fix for a field-use report that a photo captured from a field (e.g.
   Property Address) stayed attached to that field but never showed up
   in the Photos tab. Root cause: renderPhotosTabHtml() and its helpers
   only ever read the flat `generalPhotos` array (fieldId null); a field
   photo lives in photosByField and was never merged in anywhere. Fixed
   in the query/render layer only -- no IndexedDB schema change, no new
   store, no photo record ever duplicated or copied between the two
   caches, and photoPanelHtml()/wireFields()'s per-field photo panel is
   byte-for-byte unchanged (still shows exactly the photos it always
   did, exactly the same way).

   allPhotoCacheEntries() (new) is the Photos tab's one merge point --
   computed fresh from photosByField + generalPhotos on every call, never
   itself stored, so there is nothing new that could drift out of sync
   with the two caches that remain each mutation's actual source of
   truth. A field-linked photo may now also carry a report label
   (category/label) without losing its fieldId -- assignPhotoLabel(id,
   fieldId, category, label), renamed and generalized from Milestone 21's
   assignGeneralPhotoLabel(id, category, label), only ever writes
   category/label; fieldId is never read from or written by it at all,
   so field linkage cannot be lost by relabeling, reassigning, or
   clearing a label back to Unassigned.

   The checklist (renderPhotoChecklistHtml()) now counts a photo toward
   its category+label pair regardless of fieldId (#6), plus a new "Field
   Photos" row for field-linked photos with no report label yet; the
   review list below it (renderPhotoReviewListHtml(), replacing the old
   flat `generalPhotos`-only grid) shows every photo in the inspection
   exactly once, bucketed the same three mutually-exclusive ways
   (labeled -- regardless of field linkage -- then field-linked-with-no-
   label, then Unassigned) so the checklist and the grid can never
   disagree about where a photo belongs. photoItemHtml() (renamed/
   extended from generalPhotoItemHtml()) adds a compact secondary-text
   source note ("From: <field>") via the shared fieldLabelById() resolver
   (renamed from the PDF-only pdfFieldLabelById(), now used by both the
   PDF and the Photos tab so they can never disagree on a field's display
   name, with the same safe-fallback-to-'Field Photo' behavior for an
   orphaned/legacy fieldId).

   wirePhotosTabControls()'s view/delete/label-picker handlers now read
   which field (if any) an item belongs to off that item's own
   data-field-id and dispatch to the *same* functions the per-field photo
   panel already uses (openFullPhotoViewer(), deletePhoto()) for a
   field-linked photo, or the Milestone 21 general-photo functions
   (deleteGeneralPhoto()) otherwise -- so "delete from Photos" for a
   field-linked photo *is* "delete from the field" (same idbDelete() +
   same photosByField-cache splice), never a second, parallel deletion
   path that could disagree with the field panel about what still
   exists.

   PDF export (buildPrintDocumentHtml()): a labeled photo -- field-linked
   or not -- now prints once, under GENERAL PHOTOS grouped by its report
   label (the more specific, deliberately-chosen fact winning over field
   association); an unlabeled field photo still prints once, under
   PHOTOS, field-grouped, exactly as before. The two filters partitioning
   photosWithUrls are simply each other's negation, so a photo can never
   land in both sections or neither. JSON export needed no changes at
   all: exportInspectionJson() already included fieldId and category/
   label on every photo, field-linked or not.

   ---- Milestone 19: field usability hardening, driven by
   physical field testing of 0.18 -- (1) a field can now be activated by
   tapping anywhere on its card (label, blank area, reminder text), not
   only by touching its answer control; (2) the whole active card is now
   visually highlighted, not just the selected answer button; (3) every
   primary screen gets a bottom Previous/Next nav bar, derived from the
   same navTabs() list the top nav already uses; (4) PDF export no longer
   opens a separate popup window at all -- see the PDF section's own
   header comment for the mobile hang this eliminates.

   Card-tap activation (1+2): wireFields() now also assigns each `.field`
   element's own `.onclick` to call activateFieldNoRender(id). Every
   existing control inside a field (option/counter buttons, Note/Photo
   toggles, text focus) already calls setActiveField()/
   activateFieldNoRender() itself as part of its own handler, and DOM
   click events bubble from whatever was actually tapped up through its
   ancestors to this new card-level handler regardless -- so a tap on an
   answer control fires its own handler first (selecting the answer,
   activating the field, and for most controls calling render()) and
   *then* bubbles to the card handler, which finds activeFieldId already
   equal to id and no-ops via activateFieldNoRender()'s own existing
   guard. A tap on the label, blank card background, or reminder text has
   no inner handler to fire first, so only the card-level handler runs --
   activating the field without touching `values` or calling
   saveValues()/scheduleAutoSave() at all (Milestone 19 #6: activation
   alone must never mark the inspection dirty). No stopPropagation
   anywhere is needed for this to be safe, and none was added -- every
   control's own click handler already runs to completion (including any
   render() it triggers) before the same event's bubble phase can ever
   reach the card, so there is no path to a control action firing twice.
   This is wired inside the *existing* per-field loop in wireFields(),
   which already iterates every `.field` element -- MAIN and FOLLOW_UP
   (Dynamic and Exit Interview) alike, both destinations, including
   nested SHOW WHEN questions -- so activation/highlight behavior is
   identical everywhere by construction, never a MAIN-only feature.
   The active-card highlight itself is pure CSS (`.field.active`) keyed
   off the exact same class the shell already applied for
   `.field-actions` visibility -- see index.html.

   Bottom Previous/Next (3): renderBottomNavHtml() reads navTabs() (the
   one list the top nav already renders from, itself built from
   CFG.main.tabs + EXIT_INTERVIEW_TAB + INSPECTION_TAB) to find the
   current tab's neighbors -- there is no second, hardcoded tab order
   anywhere. switchToTab() is the one function that changes activeTab,
   re-renders, and scrolls the window back to the top, used by both the
   new bottom buttons and the existing top nav.tabs buttons (which
   previously left the scroll position wherever it was, exactly the
   "stuck at the bottom of a long screen" complaint this milestone is
   fixing). It never touches values/autosave -- activeTab is transient
   UI state, same category as activeFieldId, never persisted -- so this
   is always safe regardless of any pending debounced write.

   PDF export mobile hang (4/5): diagnosed as the popup-window mechanism
   itself. generatePdfExport() used to call window.open('', '_blank'),
   document.write() the printable HTML into that separate window, and
   window.print() it there. On iPhone/iPad Safari a script-opened window
   is not a reliably dismissable, easy-to-return-from browser surface the
   way it is on desktop -- there is no window-manager chrome to close it
   from, no afterprint support to rely on for auto-cleanup, and in a
   Home-Screen standalone PWA a window.open() popup can end up kicking
   the user out to full Safari entirely. Either way the user is left
   looking at a dead print-preview document with no link back to
   Clipboard-Flux, matching exactly what was reported. The fix removes
   the separate window/tab from the mechanism altogether: the same
   unchanged buildPrintDocumentHtml() output is now written into a
   hidden same-page <iframe> (0x0, position:fixed, never display:none so
   print rendering still works) and printed via
   iframe.contentWindow.print() -- a long-established cross-browser
   technique specifically because the browser's native print/share sheet
   then simply overlays the current page and Clipboard-Flux's own
   document is never navigated away from or replaced at all. There is
   nothing to "return to" because nothing was ever left -- app state,
   activeTab, and DOM are untouched throughout. The iframe is torn down
   on `afterprint` (fires reliably on desktop; a generous fallback timer
   -- not the primary mechanism -- covers engines where it doesn't) and
   defensively before building a new one, so repeated exports can't stack
   iframes or leak the object URLs used for full-resolution photos.
   Because there's no popup to keep synchronous with the click anymore,
   handleExportPdfClick() now flushes any pending autosave first via the
   same flushPendingSave() pattern Export JSON already uses, instead of
   forcing its own internal save -- the two export handlers are now
   symmetric.

   Auto-save (Milestone 18), the compact header/Inspection tab, JSON
   export/import (Milestone 16), inspection identity (Milestone 15), and
   every earlier milestone are otherwise unchanged -- this milestone only
   changes how a field becomes "active," how the active card looks, how
   the user moves between screens, and how the PDF print dialog is
   invoked, never what any of those things actually do to persisted
   state.

   ---- Milestone 18: field-workflow cleanup -- auto-save,
   a compact global header, and a synthetic "Inspection" app tab that
   absorbs the New/Save/Load/Reset/Export controls that used to sit in a
   permanent top-of-screen bar on every MAIN/Exit Interview tab.

   Auto-save replaces the old explicit-Save-or-lose-it model. Every
   mutation that used to call setDirty(true) (saveValues/saveDisregarded/
   saveOtherText/saveFieldNotes, plus photo add/delete) now calls
   scheduleAutoSave() instead, which (re)arms a single
   AUTOSAVE_DEBOUNCE_MS setTimeout via performSave() -- the same
   Milestone 15 saveCurrentInspection() write, unchanged, just triggered
   automatically instead of only from a Save button click. Concurrent
   triggers coalesce onto one in-flight write (saveInFlightPromise) since
   IndexedDB put() on the same inspectionId is naturally idempotent, so
   there's never a risk of two overlapping writes racing each other.
   saveStatus ('saving' | 'saved' | 'failed') drives the compact
   indicator in #inspection-bar and the Inspection tab -- 'saving' covers
   both "debounce pending" and "write in flight" as one continuous state,
   exactly matching what a field user actually needs to know ("is my
   data safe yet"). A failed write leaves values/disregarded/otherText/
   fieldNotes/activeInspection untouched in memory (nothing is ever
   silently discarded) and simply stays 'failed' until the next edit
   re-arms the debounce or the user retries via the Inspection tab's
   explicit "Save Now" (performSave() called directly, no debounce).

   Old unsaved-changes-on-switch behavior (confirmDiscardUnsavedIfNeeded's
   window.confirm) no longer makes sense once edits save themselves, so
   it's gone. New/Load instead call flushPendingSave() first -- if a
   debounced write is pending it fires immediately and is awaited; if it
   fails, the switch is aborted with an alert (data was never abandoned,
   just not yet durable) rather than silently discarding it. Reset takes
   the opposite tack on purpose: it *is* the explicit "clear this
   inspection" action, so it first waits out (never fires) any pending/
   in-flight autosave for the pre-reset state, so a stale write can never
   land after Reset's own cleared write and resurrect old data.

   The compact header (#inspection-bar) now shows only the active
   inspection's address plus the save-status word -- no buttons -- so
   Property's first field sits materially higher on a phone screen.
   Every inspection-management/export action that used to live there
   moved into a new synthetic "Inspection" tab (navTabs() appends it
   after the workbook-driven tabs and Exit Interview, same pattern
   Milestone 8 already used to append Exit Interview itself) -- large,
   stacked, touch-friendly buttons, grouped Inspection vs. Export/Import
   per this milestone's spec. It reuses the exact same handler functions
   (handleNewInspectionClick/handleLoadInspectionClick/handleReset
   InspectionClick/handleExportInspectionClick/handleExportPdfClick/
   handleImportFile) as before -- only where they're wired from changed.

   Address synchronization: the workbook's own Property/Address MAIN
   field (resolved once at boot, by tab+label rather than a hardcoded id,
   into ADDRESS_FIELD_ID) is the single source of truth once an
   inspection has that field. New Inspection's address prompt seeds both
   activeInspection.propertyAddress (so Load Inspection/the header can
   show it before any field renders) and values[ADDRESS_FIELD_ID] (so
   the Property tab shows it too) at creation time. From then on, editing
   the Property Address field's input also writes
   activeInspection.propertyAddress directly and repaints just the
   header bar (renderInspectionBar(), never a full render()) so the
   header never goes stale while the user is mid-type -- the same
   never-blow-away-a-focused-input discipline activateFieldNoRender()
   already established. There is deliberately no second address input
   anywhere (the Inspection tab only *displays* the current address).

   visibilitychange (on hidden) and pagehide both flush any pending
   autosave -- deliberately not beforeunload, which mobile Safari does
   not reliably fire on tab switch/backgrounding/screen lock. In
   practice this is a safety net more than a requirement: values/
   disregarded/otherText/fieldNotes are already mirrored to localStorage
   on every keystroke (unchanged since Milestone 5), and boot's fast
   path (resolveActiveInspectionAndBoot(), pointedId found) already
   trusts that localStorage snapshot over IndexedDB -- so a refresh or
   relaunch before a debounced write ever reached IndexedDB still
   restores full working state from memory/localStorage, and boot now
   also immediately calls performSave() once to reconcile IndexedDB with
   whatever localStorage was actually holding, closing any gap a killed
   tab could have left.

   Milestone 17's PDF export, Milestone 16's JSON export/import,
   Milestone 15's inspection identity, and every earlier milestone
   (Photo action, action-icon system, FN-011 first-tap constraint,
   Other-supplemental-text, Exit Interview badge/Disregard, SHOW WHEN,
   DESTINATION routing, trigger engine) are functionally unchanged --
   this milestone only changes *when* a save happens and *where* its
   controls live, never what Save/Load/Reset/Export actually do to
   IndexedDB. */
(function () {
  var STORAGE_KEY = 'clipboard-flux-values';
  var DISREGARD_STORAGE_KEY = 'clipboard-flux-disregarded';
  var OTHER_TEXT_STORAGE_KEY = 'clipboard-flux-other-text';
  var FIELD_NOTES_STORAGE_KEY = 'clipboard-flux-field-notes';
  var ACTIVE_INSPECTION_KEY = 'clipboard-flux-active-inspection';
  var OTHER_OPTION = 'Other';
  var EXIT_INTERVIEW_TAB = 'Exit Interview';
  // Milestone 22.4.4: MultiSelect Dropdown is a second INPUT TYPE with
  // the exact same canonical answer shape as MultiSelect (an array of
  // selected option strings) -- only its on-screen control differs
  // (always-visible buttons vs. a compact popover). This helper is the
  // single place that equates the two, used only where behavior is
  // genuinely semantic (Other detection, trigger/PDF/JSON value
  // handling) -- never for anything purely visual, where the two types
  // must keep rendering differently (see controlHtml()).
  function isMultiSelectInputType(type) {
    return type === 'MultiSelect' || type === 'MultiSelect Dropdown';
  }

  // Milestone 22.4.5: single shared value-matching helper for every
  // trigger-style comparison in the app -- MAIN FOLLOW-UP TRIGGER
  // (activeSourceFieldsForGroup()/pdfActiveSourceFieldsForGroup()) and
  // FOLLOW_UP SHOW WHEN (isShowWhenSatisfied()/pdfIsShowWhenSatisfied())
  // all call this one function now instead of each re-implementing
  // their own array/scalar branch, which is exactly what let the live
  // and PDF trigger copies drift apart in 0.22.4.4 (pdfActiveSource
  // FieldsForGroup() kept the old scalar-only check after the live
  // version learned to handle MultiSelect arrays). `allowedValues` is
  // always the plain array of trimmed, non-empty workbook strings
  // parse_main_fields()/parse_follow_up() already produce (FOLLOW-UP
  // TRIGGER / SHOW WHEN VALUE, semicolon-split) -- never touched here.
  //
  // `currentValue` is whatever's actually sitting in `values[id]`:
  //   - null/undefined (never answered): never matches.
  //   - array (MultiSelect/MultiSelect Dropdown): matches if *any*
  //     selected element matches *any* allowed value -- never whole-
  //     array equality, never "every selection must match." An empty
  //     array naturally matches nothing (Array.prototype.some on []).
  //   - scalar string (Button/Text/LongText/Currency) or number
  //     (Counter): matches if its value equals one of the allowed
  //     values. Numbers are compared via String(v) so a Counter's
  //     numeric runtime value (3) can match its workbook TRIGGER text
  //     ("3") -- the one and only normalization performed. An empty
  //     string scalar naturally matches nothing, since the parser never
  //     lets an empty string into `allowedValues` to begin with.
  //
  // Deliberately NOT done here, per this milestone's scope: no
  // case-folding (existing matching is case-sensitive and stays that
  // way), no trimming (the parser already trims), no numeric parsing of
  // arbitrary text, no substring/fuzzy matching.
  function normalizeTriggerValue(v) {
    return typeof v === 'number' ? String(v) : v;
  }
  function matchesConfiguredValues(currentValue, allowedValues) {
    if (currentValue === null || currentValue === undefined) return false;
    if (Array.isArray(currentValue)) {
      return currentValue.some(function (v) {
        return allowedValues.indexOf(normalizeTriggerValue(v)) !== -1;
      });
    }
    return allowedValues.indexOf(normalizeTriggerValue(currentValue)) !== -1;
  }

  // Synthetic app-management tabs -- none is a workbook MAIN tab, all
  // appended onto CFG.main.tabs by navTabs(), same pattern Milestone 8
  // used to append Exit Interview itself. Photos (Milestone 21) sits
  // between Exit Interview and Footprint; Footprint (Milestone 22) sits
  // between Photos and Inspection -- see navTabs(). There is no workbook
  // Sketch-type field anywhere in this build (confirmed by inventory
  // before starting Milestone 22) for Footprint to attach to instead, so
  // it's a synthetic tab like its two neighbors, not a field-driven one.
  var PHOTOS_TAB = 'Photos';
  var FOOTPRINT_TAB = 'Footprint';
  // Milestone 22.4: fast field-capture text/handwriting scratchpad, one
  // per inspection -- sits between Footprint and Inspection in navTabs(),
  // same synthetic-tab convention every tab in this list already uses.
  var NOTES_TAB = 'Notes';
  var INSPECTION_TAB = 'Inspection';
  // How long to wait after the last edit before actually writing to
  // IndexedDB -- long enough that rapid typing collapses into one write,
  // short enough that "Saved" reliably lands well within this milestone's
  // 500-1000ms target even accounting for the write itself.
  var AUTOSAVE_DEBOUNCE_MS = 700;
  var MIGRATED_INSPECTION_ADDRESS = 'Unsaved / Migrated Inspection';
  // The exported-file schema is versioned independently of
  // 0.23.2.2 -- app releases and the inspection-file format can
  // and will drift out of step (a future app version might still need
  // to read a schemaVersion 1 file, or refuse a newer one it doesn't
  // understand yet), so import validation checks schema/schemaVersion
  // only, never APP_VERSION.
  var EXPORT_SCHEMA = 'clipboard-flux-inspection';
  var EXPORT_SCHEMA_VERSION = 1;
  var SUPPORTED_SCHEMA_VERSIONS = [1];
  // Stamped at build time exactly like every other 0.23.2.2
  // token in this file -- informational only in the export, never
  // itself validated on import.
  var APP_VERSION = '0.23.2.2';
  // Same database as Milestone 14's photos -- name kept for continuity
  // even though it now also holds inspection records; renaming it would
  // mean either abandoning existing photo data or writing a whole
  // database-to-database copy migration for zero functional benefit.
  var PHOTO_DB_NAME = 'clipboard-flux-photos';
  // Milestone 22.3: v2->v3 adds one new store (footprintReferenceBlobs)
  // for the Footprint reference-sketch underlay's image Blob -- purely
  // additive, every existing store/record is untouched by this upgrade.
  // See footprintReference's own comment for why the Blob lives in its
  // own store, separate from the lightweight transform/opacity metadata
  // that rides along on the existing inspectionData record.
  var PHOTO_DB_VERSION = 3;
  var PHOTO_STORE = 'photos';
  var INSPECTIONS_STORE = 'inspections';
  var INSPECTION_DATA_STORE = 'inspectionData';
  var FOOTPRINT_REFERENCE_STORE = 'footprintReferenceBlobs';
  var PHOTO_THUMB_MAX_DIM = 500;
  var CFG = null;
  var activeTab = null;
  var values = loadValues();
  var disregarded = loadDisregarded();
  var otherText = loadOtherText();
  var fieldNotes = loadFieldNotes();
  var disregardedListOpen = false;
  // Milestone 22: whether the Footprint Drawing Settings popover is open
  // -- same transient-UI-toggle category as disregardedListOpen, never
  // persisted, survives the tab's own full re-renders (see
  // wireFootprintTabControls()'s straighten-toggle/width-button handlers).
  var footprintSettingsOpen = false;
  // Which field currently shows its action icon, and which field's note
  // textarea (if any) is currently expanded -- both purely in-memory UI
  // state, never persisted, same as activeTab/disregardedListOpen: which
  // field you last touched shouldn't survive a reload, only what you
  // typed into it (values/fieldNotes) should.
  var activeFieldId = null;
  var noteOpenFieldId = null;
  // Photo panel state -- photoOpenFieldId mirrors noteOpenFieldId (own
  // variable, not folded into it, since a field's Note and Photo panels
  // are independent UI, just mutually exclusive by convention -- see
  // setActiveField()/the photo-toggle handler). photosByField is the
  // synchronous in-memory read model render() actually uses; it never
  // holds full-resolution Blobs, only thumbnail object URLs + metadata,
  // refilled by async IndexedDB reads (loadAllPhotosIntoCache(), and
  // incremental updates from ingestPhoto()/deletePhoto()), always
  // scoped to activeInspection -- see loadAllPhotosIntoCache().
  // dbUnavailable is set once, at startup, if IndexedDB itself can't be
  // opened (unsupported/blocked) -- Photo panels and inspection
  // management both then show a plain note instead of controls that
  // would silently fail, since both depend on the same database.
  var photoOpenFieldId = null;
  // Milestone 22.4.4: which field's MultiSelect Dropdown selector sheet
  // (if any) is currently open. Lives outside #screen (see
  // renderMsdSheet()), same "persistent overlay, own render function"
  // pattern as fullViewerState/renderPhotoViewer() below -- so a full
  // render() from an option toggle (needed for live Dynamic follow-up
  // reactivity) never tears the open sheet down mid-interaction.
  var msdOpenFieldId = null;
  var photosByField = {};
  // Milestone 21: general inspection photos (fieldId null) -- report/
  // documentation photos that don't belong to any single questionnaire
  // field (Front, Rear, Kitchen, etc.). Same `photos` IndexedDB store,
  // same record shape, same toCacheEntry()/loadAllPhotosIntoCache()
  // pipeline as field photos -- just a flat array instead of a
  // per-field map, since there's no field to key by. See
  // decodeAndStorePhoto()/ingestGeneralPhoto() and the Photos tab
  // section below for the rest of the design.
  var generalPhotos = [];
  var dbUnavailable = false;
  var photoDbPromise = null;
  var fullViewerState = null;
  // The hidden <iframe> currently printing a PDF export, if any -- see
  // generatePdfExport()/printViaHiddenIframe() (Milestone 19 #4/#5).
  // Only one at a time; a fresh export always tears down a stale one
  // first via cleanupPdfPrintIframe().
  var pdfPrintIframe = null;
  // The currently open inspection's metadata record ({inspectionId,
  // propertyAddress, createdAt, updatedAt}) -- what the inspection bar
  // displays and what Save/Reset write back to.
  var activeInspection = null;
  // ---- Boot state (Milestone 22.4.1) ----
  //
  // Field report: a real Android/Chrome device got stuck showing
  // "Loading…" everywhere -- inspection bar, Inspection tab, both
  // field-photo thumbnails and the Photos tab empty -- and Export PDF
  // alerted "No active inspection to export." Root cause (see
  // openPhotoDb()'s own comment): the app's one indexedDB.open() call had
  // no `onblocked` handler, so a blocked open (most plausibly another
  // stale/backgrounded tab still holding a pre-0.22.3 v2 connection open
  // against the v3 database Milestone 22.3 introduced) left the shared
  // photoDbPromise permanently unsettled -- neither resolved nor
  // rejected -- so every dependent boot step (activeInspection
  // resolution, photo cache load) hung forever, resolveActiveInspection
  // AndBoot()'s own .catch() never fired (nothing ever rejected), and the
  // UI was stuck on whatever its first paint showed. `activeInspection`
  // genuinely was still null, so Export PDF's pre-existing guard wasn't
  // technically wrong -- just uninformative about *why*.
  //
  // `bootState` makes "the app hasn't finished restoring yet" a distinct,
  // first-class state from both "there is no inspection" and "restoration
  // failed," instead of all three collapsing into the same null-
  // `activeInspection` check every caller used to test separately:
  //   'restoring' -- resolveActiveInspectionAndBoot() is still running;
  //                  every inspection-dependent action must decline with
  //                  a truthful "still loading" message, never a false
  //                  "no active inspection" one (see
  //                  ensureBootReadyForAction()).
  //   'ready'     -- boot's promise chain completed successfully;
  //                  activeInspection reflects real (or freshly created)
  //                  stored state.
  //   'error'     -- boot's promise chain rejected or timed out.
  //                  `bootErrorMessage` holds the safe, user-facing
  //                  reason. Deliberately does NOT fabricate a pseudo-
  //                  inspection for a *blocked* open (unlike the
  //                  pre-existing "IndexedDB genuinely unavailable"
  //                  degrade path, kept unchanged below) -- the user's
  //                  real inspection is very likely still safely stored,
  //                  just temporarily unreachable, and inventing a
  //                  throwaway in-memory inspection here would risk the
  //                  user typing real answers into a session that can
  //                  never be saved back to their actual data once the
  //                  block clears.
  var bootState = 'restoring';
  var bootErrorMessage = null;
  // Diagnostic-only safety net (#31), never the underlying fix -- guards
  // against any other genuinely-hanging async browser API this sequence
  // depends on, beyond the specific blocked-open case openPhotoDb()'s
  // onblocked handler now resolves directly. Long enough that a slow but
  // healthy device is never falsely timed out.
  var BOOT_TIMEOUT_MS = 20000;
  // 'saving' | 'saved' | 'failed' -- drives the compact save-status word
  // in #inspection-bar and the Inspection tab. See scheduleAutoSave()/
  // performSave()/flushPendingSave() below for the full design.
  var saveStatus = 'saved';
  var autosaveTimer = null;
  // The one in-flight IndexedDB write, if any -- lets concurrent
  // triggers (a keystroke firing scheduleAutoSave() while
  // flushPendingSave() is already awaiting a write, for instance)
  // coalesce onto the same Promise instead of issuing overlapping
  // put()s. Always cleared back to null once that write settles either
  // way, in performSave() itself.
  var saveInFlightPromise = null;
  // The workbook's own Property/Address MAIN field id, resolved once
  // config.json loads (see resolveAddressFieldId()) -- never hardcoded,
  // so a workbook that renames or reorders that field still resolves
  // correctly as long as a Property-tab field labeled "Address" exists.
  // null if no such field exists, in which case address synchronization
  // (Milestone 18 #6) simply no-ops.
  var ADDRESS_FIELD_ID = null;
  // Milestone 16: imported photo *metadata* (id/fieldId/filename/etc,
  // never Blobs) from a JSON file that had no accompanying binaries --
  // kept separate from the real `photos` IndexedDB store/photosByField
  // cache so it can never render as, or be confused with, an actual
  // photo. Purely reference data for now (no UI reads it yet); carried
  // through Save/Reset/New like any other inspection field so a later
  // Save doesn't silently drop it.
  var externalPhotoManifest = [];

  // Milestone 22: the current inspection's Footprint sketch -- a plain
  // {version, strokes:[...]} document, folded straight into the same
  // inspectionData record values/disregarded/otherText/fieldNotes/
  // externalPhotoManifest already live on (see
  // applyInspectionDataToMemory()/saveCurrentInspection()). This is a
  // deliberate choice over a new IndexedDB store: it costs zero schema
  // change (inspectionData's keyPath is inspectionId either way, and one
  // more property on a plain object needs no version bump), and it means
  // Footprint gets New/Load/Reset/Save/autosave/JSON export-import
  // entirely for free from code that already exists and is already
  // tested, the same way Milestone 21's category/label fields did for
  // photosByField. See defaultFootprint()/FOOTPRINT_SCHEMA_VERSION below.
  // Defense in depth: initialized to a safe empty document (inlined
  // rather than a defaultFootprint() call, since that function is
  // declared later in the file and reads FOOTPRINT_SCHEMA_VERSION, which
  // wouldn't be assigned yet this early in module-init var evaluation
  // order) rather than null, so a code path that somehow reads
  // `footprint` before any boot/load function has run yet (there
  // shouldn't be one -- see resolveActiveInspectionAndBoot()'s own fix
  // for the one real gap found here during testing) fails safe instead
  // of throwing on `footprint.strokes`.
  var footprint = { version: 1, strokes: [] };
  // Undo history for the *current* Footprint session only -- whole
  // snapshots of `footprint.strokes` (not the full footprint object,
  // and never the view transform -- panning/zooming is not an undoable
  // drawing action, see #33/render loop comments below), capped so a
  // long session can't grow this unboundedly. Reset on every
  // switchToInspection() the same way activeFieldId/noteOpenFieldId are
  // -- undo history from a *different* inspection (or a stale session)
  // must never bleed into this one.
  var footprintUndoStack = [];
  var FOOTPRINT_UNDO_LIMIT = 50;
  // 'pencil' | 'eraser' | 'hand' -- transient UI state, never persisted
  // (a fresh visit to the Footprint tab always starts in Pencil, the
  // most common action), same category as activeTab/activeFieldId.
  var footprintTool = 'pencil';
  // Live view transform (world-space -> screen-space): screen = world *
  // scale + {x,y}. Purely transient/session UI state, deliberately never
  // persisted or part of undo history -- see #33's "view transformation
  // may change... but underlying drawing coordinates must remain
  // stable." Reset to a sensible default every time the canvas is (re)
  // initialized (enterFootprintTab()), never restored from a prior
  // session's pan/zoom position.
  var footprintView = { scale: 1, x: 0, y: 0 };
  // Device/user drawing preferences -- deliberately their OWN localStorage
  // keys, never part of `footprint`/inspectionData, for the same reason
  // clipboard-test's own Footprint prototype keeps its grid/line-width
  // settings separate from sketch data (confirmed by reading it read-only
  // before starting this milestone): a drawing preference is a property
  // of the device/user, not of any one inspection, so it must survive
  // New/Reset/Load untouched and must never bloat JSON export size.
  var FOOTPRINT_STRAIGHTEN_KEY = 'clipboard-flux-footprint-straighten';
  var FOOTPRINT_LINEWIDTH_KEY = 'clipboard-flux-footprint-linewidth';
  var footprintStraightenEnabled = loadFootprintStraightenPref();
  var footprintLineWidth = loadFootprintLineWidthPref();
  // Internal canvas/rendering handles -- set once per Footprint tab
  // visit by wireFootprintTabControls(), cleared (not strictly required,
  // but keeps intent obvious) when leaving the tab. Never touched by the
  // global render() path directly; see the Footprint section's own
  // header comment for why canvas interaction is deliberately kept
  // outside the innerHTML-replace-and-rewire model everywhere else in
  // this file uses for state changes.
  var footprintCanvasEl = null;
  var footprintCtx = null;
  var footprintPointers = {};
  var footprintDraft = null;
  var footprintPinchState = null;
  var footprintResizeHandler = null;
  // Milestone 22.3: the Footprint reference-sketch underlay -- a county/
  // property-appraiser image or PDF page traced *behind* the actual Flux
  // drawing, architecturally kept separate from `footprint.strokes` at
  // every layer (own render step, own gesture mode, own storage, never
  // touched by Undo/Eraser, never included in PDF/bounds export -- see
  // this section's own header comment below for the full design).
  // `footprintReference` is lightweight metadata only (transform,
  // opacity, visible, locked, filename, dimensions) -- it never holds
  // the actual image Blob, which lives in its own IndexedDB store (see
  // idbPutReferenceBlob()) and is written once at import/replace time,
  // never on the routine autosave cycle that rewrites this metadata
  // alongside `footprint` on every inspectionData save (see
  // saveCurrentInspection()). null means no reference exists for the
  // current inspection.
  var footprintReference = null;
  // The decoded, drawable form of the current reference's Blob --
  // reloaded (via loadFootprintReferenceBitmap()) whenever the active
  // inspection changes or a new/replacement reference is imported, then
  // cached and reused across every redraw so drawFootprintCanvas() never
  // has to decode the Blob itself. Closed (ImageBitmap.close()) before
  // being replaced or cleared, to release its backing memory promptly.
  var footprintReferenceBitmap = null;
  // Whether the Reference popover is open -- same transient-UI-toggle
  // category as footprintSettingsOpen, and deliberately mutually
  // exclusive with it (opening one closes the other -- #26's "reference
  // controls do not interfere with Settings").
  var footprintReferencePanelOpen = false;
  // Active two-finger scale+rotate gesture tracking for an *unlocked*
  // reference -- the reference's own analog of footprintPinchState,
  // kept entirely separate since transforming the reference and
  // panning/zooming the canvas are mutually exclusive modes (#7 "do not
  // simultaneously pan/zoom the Footprint canvas while the reference
  // itself is being transformed").
  var footprintReferenceGestureState = null;
  // Set true the instant a move or scale/rotate gesture actually changes
  // footprintReference.transform, cleared once that change is persisted.
  // Deliberately a separate flag from footprintReferenceGestureState/
  // footprintDraft, both of which are correctly cleared *before* the
  // last pointer of a multi-finger gesture lifts (see footprintEndPointer()'s
  // "still 1+ pointers remaining" branch, which intentionally freezes an
  // in-progress 2-finger gesture the instant the first of the two
  // fingers lifts) -- if persistence were gated on either of those
  // instead, a real transform change would silently never get saved,
  // since by the time the *second* (truly last) pointer lifts, both
  // would already read as "nothing was happening."
  var footprintReferenceTransformDirty = false;
  // Resolution cap for a stored reference raster (longest edge, in
  // pixels) -- matches the Footprint PDF export's own target long edge
  // (see FOOTPRINT_EXPORT_TARGET_LONG_EDGE) for the same reasoning:
  // sharp enough for tablet-screen tracing without storing an
  // arbitrarily large source photo/PDF page. Applied uniformly to both
  // directly-imported images and PDF-rendered pages, one code path for
  // both (see footprintDownscaleToBlob()).
  var FOOTPRINT_REFERENCE_MAX_DIM = 2200;
  // Default opacity for a freshly imported reference -- clearly visible
  // for tracing, but secondary to full-opacity Flux strokes (#10/#18).
  var FOOTPRINT_REFERENCE_DEFAULT_OPACITY = 0.55;

  // ---- Notes (Milestone 22.4) ----
  //
  // One typed-text workspace and one handwritten-scratchpad workspace per
  // inspection -- deliberately not a second Footprint (#7: no line-assist,
  // no pan/zoom, no reference underlay, no shapes/colors/layers). `notes`
  // is loaded/saved the same way `footprint`/`footprintReference` are:
  // no localStorage mirror (see applyInspectionDataToMemory()'s and
  // resolveActiveInspectionAndBoot()'s own comments for why that category
  // of state must always be re-read from IndexedDB fresh, never assumed
  // correct from module-init), written wholesale by saveCurrentInspection()
  // alongside everything else on the normal autosave cycle. Defense in
  // depth: initialized to a safe empty document inline (same reasoning as
  // `footprint`'s own module-init comment) rather than null.
  var NOTES_SCHEMA_VERSION = 1;
  var notes = { version: NOTES_SCHEMA_VERSION, text: '', hand: { strokes: [], docHeight: 0 } };
  // 'text' | 'hand' -- which workspace is currently shown. Transient UI
  // state, same category as footprintTool: reset to 'text' (the fastest
  // capture path, #26) on every switchToInspection(), but otherwise left
  // alone by ordinary tab navigation -- revisiting Notes later in the same
  // session naturally returns to whichever mode was last used (#27),
  // simply because nothing else ever touches this variable.
  var notesMode = 'text';
  // Undo history for the *current* Hand-notes session only, deliberately
  // its own array -- never shared with footprintUndoStack (#11/#29).
  // Whole snapshots of notes.hand.strokes, same convention as
  // footprintUndoStack.
  var notesHandUndoStack = [];
  var NOTES_HAND_UNDO_LIMIT = 50;
  // 'pencil' | 'eraser' -- transient UI state, own variable, never shared
  // with footprintTool (#29).
  var notesHandTool = 'pencil';
  // Canvas/pointer/gesture handles -- own set, deliberately never shared
  // with footprintCanvasEl/footprintPointers/footprintDraft (#29): the two
  // drawing surfaces must never be able to continue or interfere with
  // each other's in-progress gesture.
  var notesHandCanvasEl = null;
  var notesHandCtx = null;
  var notesHandPointers = {};
  var notesHandDraft = null;
  var notesHandResizeListenerAdded = false;
  // Milestone 22.4.2 (#16/#17): same self-guarding once-ever pattern,
  // for the Text workspace's auto-height recompute on resize/rotation.
  var notesTextResizeListenerAdded = false;
  var NOTES_TEXT_MIN_HEIGHT_PX = 240;
  // Milestone 22.4.2: a second, independent global listener (added once,
  // self-guarding, exact same convention as the resize listener above) --
  // grows the document as the user scrolls near its current bottom. Kept
  // separate from the resize listener since they answer different
  // questions (resize: "did the viewport's width change," scroll: "is
  // the user approaching the bottom of an already-sized document").
  var notesHandScrollListenerAdded = false;
  // One fixed default stroke thickness (#9 -- no Thin/Medium/Thick this
  // milestone) and noise/sampling thresholds tuned for small handwritten
  // marks rather than Footprint's architectural-line scale.
  var NOTES_HAND_STROKE_WIDTH = 3;
  var NOTES_HAND_NOISE_SCREEN_PX = 3;
  var NOTES_HAND_MIN_SAMPLE_SCREEN_PX = 2;
  var NOTES_HAND_EXPORT_TARGET_LONG_EDGE = 1600;
  var NOTES_HAND_EXPORT_PADDING_RATIO = 0.08;
  // Milestone 22.4.2: continuous-notebook document model (#4/#5/#6) --
  // the canvas element's own CSS/backing-store height *is* the document
  // height (no separate virtualized viewport), so native page scrolling
  // is what "scrolls the notebook," with zero redraw cost while
  // scrolling and zero manual scroll-offset math for stroke coordinates
  // (see notesHandScreenToDoc()'s own comment). NOTES_HAND_MIN_DOC_HEIGHT
  // is the starting room before any stroke exists; NOTES_HAND_GROWTH_CHUNK
  // is how much room is added at a time as the user nears the bottom
  // (NOTES_HAND_BOTTOM_BUFFER px away, #6's "reasonable bottom buffer" --
  // never the final few pixels). NOTES_HAND_MAX_DPR caps the backing-store
  // device-pixel-ratio specifically for this one ever-growing canvas
  // (Footprint's canvas, bounded to ~62vh, never needed this) so a long
  // field session's memory footprint stays bounded even on a 3x-DPR
  // phone -- 2x remains visually indistinguishable for handwriting ink.
  var NOTES_HAND_MIN_DOC_HEIGHT = 700;
  var NOTES_HAND_GROWTH_CHUNK = 700;
  var NOTES_HAND_BOTTOM_BUFFER = 350;
  var NOTES_HAND_MAX_DPR = 2;
  // Sensible print-page proportions for PDF pagination (#21/#22) -- a
  // slice this many document-px tall (relative to its own width) roughly
  // matches one letter-page's printable aspect ratio, so no single slice
  // image is ever itself taller than one physical PDF page.
  var NOTES_HAND_PDF_SLICE_ASPECT = 1.4;
  var NOTES_HAND_PDF_TARGET_WIDTH = 1200;

  // A flat {fieldId: value} map is all that's persisted -- MAIN fields
  // and FOLLOW_UP questions already share one `values` object and the
  // same id shape, so nothing sheet-specific needs to happen here.
  // Corrupt/missing storage just falls back to an empty object rather
  // than breaking the app.
  function loadValues() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function saveValues() {
    scheduleAutoSave();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    } catch (e) {
      // Storage full/unavailable (e.g. private browsing) -- the app
      // still works for this session, it just won't survive reload.
    }
  }

  // Disregard status is runtime inspection state, not an answer -- it
  // lives in its own {groupName: true} map under its own storage key
  // rather than inside `values`, so it can never collide with a real
  // field id and never gets cleared by anything that touches answers.
  // A group simply absent from this map is not disregarded.
  function loadDisregarded() {
    try {
      var raw = localStorage.getItem(DISREGARD_STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function saveDisregarded() {
    scheduleAutoSave();
    try {
      localStorage.setItem(DISREGARD_STORAGE_KEY, JSON.stringify(disregarded));
    } catch (e) {
      // Same graceful degradation as saveValues().
    }
  }

  function isGroupDisregarded(groupName) {
    return !!disregarded[groupName];
  }

  function setGroupDisregarded(groupName, flag) {
    if (flag) {
      disregarded[groupName] = true;
    } else {
      delete disregarded[groupName];
    }
    saveDisregarded();
  }

  // Other-supplemental text is keyed by field id, same shape and same
  // graceful degradation as loadValues()/loadDisregarded(), but its own
  // storage key -- it's a second, independent answer slot for a field,
  // not the field's actual value, so it can never collide with or get
  // clobbered by anything that writes to `values`.
  function loadOtherText() {
    try {
      var raw = localStorage.getItem(OTHER_TEXT_STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function saveOtherText() {
    scheduleAutoSave();
    try {
      localStorage.setItem(OTHER_TEXT_STORAGE_KEY, JSON.stringify(otherText));
    } catch (e) {
      // Same graceful degradation as saveValues().
    }
  }

  // Field notes (Milestone 13's "More Text / Note") -- keyed by field id,
  // same shape/degradation as otherText, own storage key. A note is a
  // second, independent thing a field knows, not part of its answer, so
  // it's never read from or written into `values`.
  function loadFieldNotes() {
    try {
      var raw = localStorage.getItem(FIELD_NOTES_STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function saveFieldNotes() {
    scheduleAutoSave();
    try {
      localStorage.setItem(FIELD_NOTES_STORAGE_KEY, JSON.stringify(fieldNotes));
    } catch (e) {
      // Same graceful degradation as saveValues().
    }
  }

  // Milestone 22: device-level drawing preferences, own localStorage
  // keys (see footprintStraightenEnabled/footprintLineWidth's own
  // comment for why these are never part of inspectionData). Same
  // graceful-degradation posture as every other localStorage read/write
  // in this file -- a blocked/unavailable localStorage just falls back
  // to the default rather than breaking the tab.
  function loadFootprintStraightenPref() {
    try {
      var raw = localStorage.getItem(FOOTPRINT_STRAIGHTEN_KEY);
      return raw === null ? true : raw === '1';
    } catch (e) {
      return true;
    }
  }

  function saveFootprintStraightenPref(enabled) {
    try {
      localStorage.setItem(FOOTPRINT_STRAIGHTEN_KEY, enabled ? '1' : '0');
    } catch (e) {
      // Session-only fallback -- the toggle still works, it just won't
      // survive a reload on this device.
    }
  }

  function loadFootprintLineWidthPref() {
    try {
      var raw = localStorage.getItem(FOOTPRINT_LINEWIDTH_KEY);
      return (raw === 'thin' || raw === 'medium' || raw === 'thick') ? raw : 'medium';
    } catch (e) {
      return 'medium';
    }
  }

  function saveFootprintLineWidthPref(width) {
    try {
      localStorage.setItem(FOOTPRINT_LINEWIDTH_KEY, width);
    } catch (e) {
      // Same graceful degradation as saveFootprintStraightenPref().
    }
  }

  function loadActiveInspectionId() {
    try {
      return localStorage.getItem(ACTIVE_INSPECTION_KEY) || null;
    } catch (e) {
      return null;
    }
  }

  function saveActiveInspectionId(id) {
    try {
      localStorage.setItem(ACTIVE_INSPECTION_KEY, id);
    } catch (e) {
      // Same graceful degradation as saveValues() -- worst case, a
      // reload falls back to the migration/fresh-boot path instead of
      // resuming this exact inspection.
    }
  }

  // The single place that decides what the save-status word says.
  // Called by scheduleAutoSave()/performSave() as edits happen and
  // writes settle; no-ops if the status isn't actually changing, so
  // rapid typing while already 'saving' doesn't redraw the bar on every
  // keystroke. Deliberately calls the *inspection bar's own* render
  // function, not the full render() -- the bar lives outside #screen,
  // so patching it can never disturb a focused text input mid-type the
  // way a full render() would (see activateFieldNoRender()'s comment).
  function setSaveStatus(status) {
    if (saveStatus === status) return;
    saveStatus = status;
    renderInspectionBar();
  }

  function saveStatusLabel() {
    if (saveStatus === 'saving') return 'Saving…';
    if (saveStatus === 'failed') return 'Save failed';
    return 'Saved';
  }

  // Called by every save*() function (saveValues/saveDisregarded/
  // saveOtherText/saveFieldNotes) and by photo add/delete -- every
  // mutation this milestone's spec requires auto-save to cover. Shows
  // 'saving' immediately (even though the actual write is still
  // AUTOSAVE_DEBOUNCE_MS away) since that's the accurate answer to "is
  // my data safe yet" the whole time a write is pending, and re-arms a
  // single timer so a burst of keystrokes collapses into one write
  // AUTOSAVE_DEBOUNCE_MS after the *last* one, not one write per key.
  function scheduleAutoSave() {
    setSaveStatus('saving');
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(function () {
      autosaveTimer = null;
      // performSave() already surfaces failure via saveStatus/'Save
      // failed' -- nothing left for this unattended timer callback to do
      // with the rejection itself, so it's swallowed here rather than
      // left as an unhandled promise rejection in the console.
      performSave().catch(function () {});
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  // The one function that actually writes to IndexedDB (via the
  // unchanged Milestone 15 saveCurrentInspection()). Coalesces
  // concurrent callers onto a single in-flight write rather than firing
  // two overlapping put()s -- harmless either way since put() on the
  // same inspectionId is idempotent, but this keeps saveStatus
  // transitions single-threaded and predictable. No-ops (and reports
  // 'saved') if there's no real inspection to write, e.g. the
  // storage-unavailable pseudo-inspection from resolveActiveInspection
  // AndBoot()'s fallback path.
  function performSave() {
    if (saveInFlightPromise) return saveInFlightPromise;
    if (!activeInspection || !activeInspection.inspectionId) {
      setSaveStatus('saved');
      return Promise.resolve();
    }
    setSaveStatus('saving');
    saveInFlightPromise = saveCurrentInspection().then(function () {
      setSaveStatus('saved');
    }, function (e) {
      window.console && console.error && console.error('Clipboard-Flux: auto-save failed', e);
      setSaveStatus('failed');
      throw e;
    }).then(function () {
      saveInFlightPromise = null;
    }, function (e) {
      saveInFlightPromise = null;
      throw e;
    });
    return saveInFlightPromise;
  }

  // Flushes any pending debounced write immediately and returns a
  // Promise that resolves once the current in-memory state is durably
  // in IndexedDB, or rejects if that write failed -- used before New/
  // Load switch to a different inspection (Milestone 18 #7), and
  // opportunistically on visibilitychange/pagehide. If nothing is
  // pending, returns the already-in-flight write (if any) or an
  // already-resolved Promise (nothing to flush).
  function flushPendingSave() {
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
      return performSave();
    }
    return saveInFlightPromise || Promise.resolve();
  }

  // Independent of propertyAddress by design (Milestone 15's explicit
  // requirement) -- same generator shape as photo ids, for the same
  // reason: cheap, dependency-free, and this project's established
  // pattern rather than reaching for crypto.randomUUID() (narrower
  // legacy-browser support) for a one-line problem.
  function generateInspectionId() {
    return 'insp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString();
    } catch (e) {
      return iso;
    }
  }

  // Milestone 22.4.1: safe, minimal checkpoint logging through boot --
  // console.log only, never inspection answers, photo Blobs, image URLs,
  // or other private data (#6) -- so a field report that includes
  // browser console output is actually useful for diagnosing exactly
  // where restoration stalled or failed, without exposing anything
  // sensitive. Guarded the same way every other console access in this
  // file is, for browsers where `console` itself may be absent.
  function bootLog(checkpoint, extra) {
    window.console && console.log && console.log('[Clipboard-Flux boot] ' + checkpoint, extra || '');
  }

  // Opens (and caches) the IndexedDB connection. Three object stores as
  // of Milestone 15: `photos` (keyPath `id`, indexed on `fieldId` and,
  // new this milestone, `inspectionId` -- a photo is now looked up by
  // field *within* the active inspection); `inspections` (keyPath
  // `inspectionId` -- the small metadata list Load Inspection reads);
  // `inspectionData` (keyPath `inspectionId` -- the full non-photo
  // answer blob Save/Load/Reset read or write wholesale). The
  // idempotent `contains()` checks mean this same upgrade logic
  // correctly handles both a fresh v0->v2 database and an existing
  // Milestone 14 v1->v2 upgrade in one pass, without branching on
  // event.oldVersion. Rejects (once, cached) if IndexedDB is
  // unavailable/blocked -- callers surface that via dbUnavailable
  // rather than throwing into the render path.
  //
  // Milestone 22.4.1: `req.onblocked` is the actual field-bug fix (see
  // bootState's own comment for the full diagnosis) -- an open request
  // against a newer version (this database went v2->v3 in Milestone
  // 22.3) blocks, silently and indefinitely, for as long as any other
  // tab/connection still holds the older version open and never receives/
  // acts on the resulting `versionchange` event -- exactly what an Android
  // Chrome backgrounded/suspended tab can do. Without this handler,
  // neither `onsuccess` nor `onerror` ever fires, so `photoDbPromise`
  // (and therefore every idb*() call and the whole boot chain) hung
  // forever. Now it rejects instead -- tagged `clipboardFluxBlocked` so
  // resolveActiveInspectionAndBoot() can show a specific, actionable
  // message and deliberately avoid fabricating a pseudo-inspection for
  // what is very likely still a perfectly intact, just-temporarily-
  // unreachable, real inspection.
  function openPhotoDb() {
    if (photoDbPromise) return photoDbPromise;
    bootLog('photo DB open started');
    photoDbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB not available'));
        return;
      }
      var req = indexedDB.open(PHOTO_DB_NAME, PHOTO_DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        var tx = req.transaction;
        var photoStore;
        if (!db.objectStoreNames.contains(PHOTO_STORE)) {
          photoStore = db.createObjectStore(PHOTO_STORE, { keyPath: 'id' });
          photoStore.createIndex('fieldId', 'fieldId', { unique: false });
        } else {
          photoStore = tx.objectStore(PHOTO_STORE);
        }
        if (!photoStore.indexNames.contains('inspectionId')) {
          photoStore.createIndex('inspectionId', 'inspectionId', { unique: false });
        }
        if (!db.objectStoreNames.contains(INSPECTIONS_STORE)) {
          db.createObjectStore(INSPECTIONS_STORE, { keyPath: 'inspectionId' });
        }
        if (!db.objectStoreNames.contains(INSPECTION_DATA_STORE)) {
          db.createObjectStore(INSPECTION_DATA_STORE, { keyPath: 'inspectionId' });
        }
        if (!db.objectStoreNames.contains(FOOTPRINT_REFERENCE_STORE)) {
          db.createObjectStore(FOOTPRINT_REFERENCE_STORE, { keyPath: 'inspectionId' });
        }
      };
      req.onblocked = function () {
        window.console && console.error && console.error('Clipboard-Flux: IndexedDB open blocked by another connection');
        var err = new Error('Storage is blocked by another open tab of this app.');
        err.clipboardFluxBlocked = true;
        reject(err);
      };
      req.onsuccess = function () { bootLog('photo DB open completed'); resolve(req.result); };
      req.onerror = function () {
        window.console && console.error && console.error('Clipboard-Flux: IndexedDB open failed', req.error);
        reject(req.error);
      };
    });
    return photoDbPromise;
  }

  // Milestone 22.4.1: the one safe, non-destructive way to let Retry
  // actually retry a blocked/failed open -- clears only the in-memory
  // cached Promise reference (never touches any stored record) so the
  // next openPhotoDb() call issues a fresh indexedDB.open() rather than
  // immediately re-returning the same already-settled (rejected) Promise.
  function resetPhotoDbConnection() {
    photoDbPromise = null;
  }

  function idbAdd(record) {
    return openPhotoDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(PHOTO_STORE, 'readwrite');
        tx.objectStore(PHOTO_STORE).add(record);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function idbDelete(id) {
    return openPhotoDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(PHOTO_STORE, 'readwrite');
        tx.objectStore(PHOTO_STORE).delete(id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function idbGetById(id) {
    return openPhotoDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(PHOTO_STORE, 'readonly');
        var req = tx.objectStore(PHOTO_STORE).get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  // Milestone 22.3: the Footprint reference sketch's image Blob, keyed
  // directly by inspectionId (at most one reference per inspection) --
  // its own tiny store, written only at import/replace/remove time
  // (never on the routine autosave cycle that rewrites inspectionData,
  // see footprintReference's own comment for why that split matters).
  function idbPutReferenceBlob(inspectionId, blob) {
    return openPhotoDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(FOOTPRINT_REFERENCE_STORE, 'readwrite');
        tx.objectStore(FOOTPRINT_REFERENCE_STORE).put({ inspectionId: inspectionId, blob: blob });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function idbGetReferenceBlob(inspectionId) {
    return openPhotoDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(FOOTPRINT_REFERENCE_STORE, 'readonly');
        var req = tx.objectStore(FOOTPRINT_REFERENCE_STORE).get(inspectionId);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbDeleteReferenceBlob(inspectionId) {
    return openPhotoDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(FOOTPRINT_REFERENCE_STORE, 'readwrite');
        tx.objectStore(FOOTPRINT_REFERENCE_STORE).delete(inspectionId);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  // Whole-store, unfiltered -- used only by migration, which needs to
  // find photo records that predate `inspectionId` entirely (an
  // IndexedDB index silently skips records missing the indexed
  // property, so an `inspectionId` index query can never surface an
  // orphaned pre-0.15 photo; only a full scan can).
  function idbGetAllPhotosRaw() {
    return openPhotoDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(PHOTO_STORE, 'readonly');
        var req = tx.objectStore(PHOTO_STORE).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  // put(), not add() -- migration reuses a photo's existing `id`
  // (keyPath) to overwrite it in place with `inspectionId` backfilled,
  // never creating a duplicate record or touching the stored Blobs.
  function idbPutPhoto(record) {
    return openPhotoDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(PHOTO_STORE, 'readwrite');
        tx.objectStore(PHOTO_STORE).put(record);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function idbGetAllPhotosForInspection(inspectionId) {
    return openPhotoDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(PHOTO_STORE, 'readonly');
        var idx = tx.objectStore(PHOTO_STORE).index('inspectionId');
        var req = idx.getAll(IDBKeyRange.only(inspectionId));
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  // Bulk-deletes every photo belonging to one inspection (Reset) via a
  // cursor over the `inspectionId` index, all inside one transaction --
  // scoped strictly to that index value, so it can never touch another
  // inspection's photos even if their fieldIds happen to match.
  function idbDeleteAllPhotosForInspection(inspectionId) {
    return openPhotoDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(PHOTO_STORE, 'readwrite');
        var idx = tx.objectStore(PHOTO_STORE).index('inspectionId');
        var cursorReq = idx.openCursor(IDBKeyRange.only(inspectionId));
        cursorReq.onsuccess = function (e) {
          var cursor = e.target.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function idbPutInspection(record) {
    return openPhotoDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(INSPECTIONS_STORE, 'readwrite');
        tx.objectStore(INSPECTIONS_STORE).put(record);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function idbGetInspection(id) {
    return openPhotoDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(INSPECTIONS_STORE, 'readonly');
        var req = tx.objectStore(INSPECTIONS_STORE).get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbGetAllInspections() {
    return openPhotoDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(INSPECTIONS_STORE, 'readonly');
        var req = tx.objectStore(INSPECTIONS_STORE).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbPutInspectionData(record) {
    return openPhotoDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(INSPECTION_DATA_STORE, 'readwrite');
        tx.objectStore(INSPECTION_DATA_STORE).put(record);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function idbGetInspectionData(id) {
    return openPhotoDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(INSPECTION_DATA_STORE, 'readonly');
        var req = tx.objectStore(INSPECTION_DATA_STORE).get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  // Converts one IDB record (full Blobs) into the lightweight shape
  // photosByField actually holds -- a thumbnail object URL plus display
  // metadata, never the full-resolution Blob (that's only fetched on
  // demand, when a thumbnail is tapped to view full-size).
  function toCacheEntry(record) {
    return {
      id: record.id,
      fieldId: record.fieldId,
      // Milestone 21: null for both on a field photo (and on a general
      // photo that hasn't been assigned yet -- "Unassigned" is just
      // category/label both null, not a separate flag).
      category: record.category || null,
      label: record.label || null,
      thumbnailUrl: URL.createObjectURL(record.thumbnailBlob),
      mimeType: record.mimeType,
      originalFileName: record.originalFileName || '',
      addedAt: record.addedAt,
      width: record.width,
      height: record.height,
      order: record.order
    };
  }

  function sortByOrder(list) {
    list.sort(function (a, b) { return a.order - b.order; });
    return list;
  }

  function revokeAllPhotoThumbnailUrls() {
    Object.keys(photosByField).forEach(function (fid) {
      photosByField[fid].forEach(function (p) { URL.revokeObjectURL(p.thumbnailUrl); });
    });
    generalPhotos.forEach(function (p) { URL.revokeObjectURL(p.thumbnailUrl); });
  }

  // Populates photosByField and generalPhotos from every photo belonging
  // to activeInspection -- simplest approach for a single inspection's
  // worth of photos (not paginated/lazy), matching every other piece of
  // state in this app being loaded whole per inspection. Milestone 15:
  // scoped by the `inspectionId` index instead of the whole store, so
  // Inspection A's cache can never include Inspection B's photos even if
  // they share a fieldId. Milestone 21: a record with fieldId null is a
  // general photo and goes into the flat generalPhotos array instead of
  // a photosByField bucket -- the same single IndexedDB read/index just
  // gets partitioned client-side, no second query needed. Always revokes
  // the previous cache's object URLs first -- called both at boot and on
  // every inspection switch, so the outgoing inspection's thumbnail
  // URLs (which reference Blobs no longer being displayed) don't leak.
  function loadAllPhotosIntoCache() {
    if (!activeInspection) return Promise.resolve();
    return idbGetAllPhotosForInspection(activeInspection.inspectionId).then(function (records) {
      revokeAllPhotoThumbnailUrls();
      var byField = {};
      var general = [];
      records.forEach(function (r) {
        if (r.fieldId == null) {
          general.push(toCacheEntry(r));
        } else {
          if (!byField[r.fieldId]) byField[r.fieldId] = [];
          byField[r.fieldId].push(toCacheEntry(r));
        }
      });
      Object.keys(byField).forEach(function (fid) { sortByOrder(byField[fid]); });
      sortByOrder(general);
      photosByField = byField;
      generalPhotos = general;
    }).catch(function () {
      dbUnavailable = true;
    });
  }

  // Milestone 22.3: decodes the current inspection's reference-sketch
  // Blob (if any) into a drawable ImageBitmap, caching it in
  // footprintReferenceBitmap for drawFootprintCanvas() to reuse across
  // every redraw without re-decoding. Called wherever loadAllPhotosInto
  // Cache() already is (boot, switchToInspection()) so the Footprint
  // tab's first paint for a given inspection never has to wait on this
  // itself. Closes the previous bitmap first to release its memory
  // promptly -- a stale bitmap from the *previous* inspection must never
  // linger and be drawn against a different inspection's reference
  // metadata/transform. Failure here (corrupt stored Blob, decode
  // unsupported) degrades to "no reference visible" rather than
  // breaking the tab -- footprintReference metadata is left alone so
  // the user can still see/replace/remove it via the Reference panel.
  function loadFootprintReferenceBitmap() {
    if (footprintReferenceBitmap) {
      try { footprintReferenceBitmap.close(); } catch (e) { /* already closed */ }
      footprintReferenceBitmap = null;
    }
    if (!activeInspection || !activeInspection.inspectionId || !footprintReference) {
      return Promise.resolve();
    }
    return idbGetReferenceBlob(activeInspection.inspectionId).then(function (rec) {
      if (!rec || !rec.blob) return;
      return createImageBitmap(rec.blob).then(function (bmp) {
        footprintReferenceBitmap = bmp;
      });
    }).catch(function (e) {
      window.console && console.error && console.error('Clipboard-Flux: could not load reference image', e);
    });
  }

  // Milestone 21.1: the Photos tab's single unified view over every photo
  // in the current inspection, field-linked and general alike -- computed
  // fresh from photosByField/generalPhotos on every call rather than
  // stored as its own third array, so it can never drift out of sync
  // with the two caches that are still each mutation's own source of
  // truth (ingestPhoto/deletePhoto touch photosByField, ingestGeneral
  // Photo/deleteGeneralPhoto touch generalPhotos, exactly as before --
  // this milestone changes how the Photos tab *reads* that state, never
  // how it's written). Cheap enough to recompute on every render: a
  // field inspection's photo count is small, and this only runs while
  // the Photos tab itself is active.
  function allPhotoCacheEntries() {
    var all = [];
    Object.keys(photosByField).forEach(function (fid) {
      all = all.concat(photosByField[fid]);
    });
    return all.concat(generalPhotos);
  }

  // Chronological order across a mixed field/general list -- `order` is
  // only ever comparable *within* one field's own bucket or the flat
  // generalPhotos array (see nextOrderForField()/nextOrderForGeneral()'s
  // comments), so it can't be used to sort a merged list; addedAt can.
  function sortByAddedAt(list) {
    list.sort(function (a, b) { return (a.addedAt || '').localeCompare(b.addedAt || ''); });
    return list;
  }

  // Decodes a File/Blob just far enough to know its natural pixel size
  // and to have a drawable <img> for thumbnail generation -- uses a
  // plain <img>+object-URL rather than createImageBitmap() so this
  // works identically on older Safari without a feature check.
  function readImageMeta(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        resolve({ img: img, url: url, width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Could not decode image'));
      };
      img.src = url;
    });
  }

  // Downscales to PHOTO_THUMB_MAX_DIM on the longest edge via an
  // offscreen canvas, once, at ingestion time -- so the field photo
  // strip never has to decode a multi-MB original just to show a small
  // preview. The full-resolution Blob (the original File, untouched) is
  // stored separately and is what the full-size viewer reads.
  function makeThumbnailBlob(img, width, height) {
    var scale = Math.min(1, PHOTO_THUMB_MAX_DIM / Math.max(width, height));
    var tw = Math.max(1, Math.round(width * scale));
    var th = Math.max(1, Math.round(height * scale));
    var canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    canvas.getContext('2d').drawImage(img, 0, 0, tw, th);
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) { resolve(blob); }, 'image/jpeg', 0.7);
    });
  }

  function nextOrderForField(fieldId) {
    var existing = photosByField[fieldId] || [];
    return existing.reduce(function (max, p) { return Math.max(max, p.order); }, -1) + 1;
  }

  // Milestone 21: same idea as nextOrderForField(), for the flat
  // generalPhotos array -- there's no field to key by, so just one
  // running order across every general photo in the inspection.
  function nextOrderForGeneral() {
    return generalPhotos.reduce(function (max, p) { return Math.max(max, p.order); }, -1) + 1;
  }

  // Shared decode -> thumbnail -> IndexedDB-write pipeline for both a
  // field photo (fieldId set, category/label always null -- a field
  // photo is never assigned a general-photo label) and a general photo
  // (fieldId null; category/label null at capture time -- Milestone 21
  // #6/#9: a new general photo starts Unassigned, never auto-guessed).
  // Resolves with the written record (still holding its real Blobs) so
  // each caller can build its own toCacheEntry() and decide which cache
  // array it belongs in; rejects (never throws synchronously) on
  // decode/thumbnail/write failure so one bad file can never take down
  // a multi-file batch -- see ingestPhoto()/ingestGeneralPhoto()'s own
  // .catch() handlers, which log and continue rather than propagate.
  // `order` is always reserved by the caller before any async work
  // starts (addPhotosForField()/addGeneralPhotos()), never computed in
  // here, for the same reason: concurrent decodes for a multi-select
  // batch resolve in whatever order they finish, and computing "next
  // order" only once a file's own decode finishes would race every
  // other concurrent file in that same batch against the cache's
  // not-yet-updated state.
  function decodeAndStorePhoto(fieldId, category, label, file, order) {
    var decodedUrl = null;
    var decodedMeta = null;
    return readImageMeta(file).then(function (meta) {
      decodedUrl = meta.url;
      decodedMeta = meta;
      return makeThumbnailBlob(meta.img, meta.width, meta.height);
    }).then(function (thumbBlob) {
      var record = {
        id: 'photo_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        fieldId: fieldId,
        category: category,
        label: label,
        inspectionId: activeInspection ? activeInspection.inspectionId : null,
        blob: file,
        thumbnailBlob: thumbBlob,
        mimeType: file.type || 'image/jpeg',
        originalFileName: file.name || '',
        addedAt: new Date().toISOString(),
        width: decodedMeta.width,
        height: decodedMeta.height,
        order: order
      };
      return idbAdd(record).then(function () { return record; });
    }).then(function (record) {
      if (decodedUrl) URL.revokeObjectURL(decodedUrl);
      return record;
    }, function (e) {
      if (decodedUrl) URL.revokeObjectURL(decodedUrl);
      throw e;
    });
  }

  // One field photo's full ingestion: decodeAndStorePhoto() -> append a
  // lightweight cache entry to photosByField[fieldId] -> render(). A
  // failure on one file (bad/corrupt image, IDB write failure) is caught
  // and logged, not thrown -- it never blocks ingesting the rest of a
  // multi-file "Photo Library" selection.
  function ingestPhoto(fieldId, file, order) {
    return decodeAndStorePhoto(fieldId, null, null, file, order).then(function (record) {
      if (!photosByField[fieldId]) photosByField[fieldId] = [];
      photosByField[fieldId].push(toCacheEntry(record));
      sortByOrder(photosByField[fieldId]);
      scheduleAutoSave();
      render();
    }).catch(function (e) {
      // A single bad/corrupt image (decode failure) shouldn't be
      // confused with the DB itself being unavailable -- that's already
      // reliably detected once, at startup, by loadAllPhotosIntoCache().
      window.console && console.error && console.error('Clipboard-Flux: photo ingestion failed', e);
      render();
    });
  }

  // Milestone 21: same pipeline, general (fieldId null) photo -- appends
  // to the flat generalPhotos array instead of a photosByField bucket.
  // Always Unassigned (category/label null) at ingestion; see
  // assignPhotoLabel() for how a label gets attached afterward.
  function ingestGeneralPhoto(file, order) {
    return decodeAndStorePhoto(null, null, null, file, order).then(function (record) {
      generalPhotos.push(toCacheEntry(record));
      sortByOrder(generalPhotos);
      scheduleAutoSave();
      render();
    }).catch(function (e) {
      window.console && console.error && console.error('Clipboard-Flux: general photo ingestion failed', e);
      render();
    });
  }

  // Reserves this whole batch's order values synchronously, before any
  // file's async decode/thumbnail work starts -- see
  // decodeAndStorePhoto()'s comment for why that matters for a
  // multi-select Photo Library selection specifically.
  function addPhotosForField(fieldId, files) {
    var order = nextOrderForField(fieldId);
    Array.prototype.forEach.call(files, function (file) {
      ingestPhoto(fieldId, file, order);
      order++;
    });
  }

  // Milestone 21: same reserve-then-ingest pattern, general photos.
  function addGeneralPhotos(files) {
    var order = nextOrderForGeneral();
    Array.prototype.forEach.call(files, function (file) {
      ingestGeneralPhoto(file, order);
      order++;
    });
  }

  function deletePhoto(fieldId, id) {
    idbDelete(id).then(function () {
      var arr = photosByField[fieldId] || [];
      var idx = arr.map(function (p) { return p.id; }).indexOf(id);
      if (idx !== -1) {
        URL.revokeObjectURL(arr[idx].thumbnailUrl);
        arr.splice(idx, 1);
      }
      scheduleAutoSave();
      render();
    }).catch(function (e) {
      window.console && console.error && console.error('Clipboard-Flux: photo delete failed', e);
    });
  }

  // Milestone 21: same idea, generalPhotos array instead of a
  // photosByField bucket.
  function deleteGeneralPhoto(id) {
    idbDelete(id).then(function () {
      var idx = generalPhotos.map(function (p) { return p.id; }).indexOf(id);
      if (idx !== -1) {
        URL.revokeObjectURL(generalPhotos[idx].thumbnailUrl);
        generalPhotos.splice(idx, 1);
      }
      scheduleAutoSave();
      render();
    }).catch(function (e) {
      window.console && console.error && console.error('Clipboard-Flux: general photo delete failed', e);
    });
  }

  // Milestone 21: (re)assigns or clears a photo's category/label --
  // category/label both null means "return to Unassigned"/"remove report
  // label" (#6/#8), never a separate delete-and-recreate. Reads the full
  // record back from IndexedDB first (the in-memory cache entry only
  // ever holds a thumbnail URL, never the real Blobs -- see
  // toCacheEntry()), mutates just the two fields, and put()s it back
  // under the same id, same idempotent upsert convention every other
  // inspection write in this file already uses. scheduleAutoSave()
  // afterward matches ingestPhoto()/deletePhoto()'s own pattern: the
  // Blob/label write itself is already durable the moment this Promise
  // resolves, so autosave here exists only to refresh the inspection's
  // own updatedAt/save-status, exactly like every other photo mutation.
  //
  // Milestone 21.1 #4: fieldId is never touched here -- a field-linked
  // photo keeps its fieldId (and stays visible under its original field)
  // no matter what happens to category/label; assigning, reassigning, or
  // removing a report label is purely an edit to those two properties.
  // `fieldId` (the caller's own field, if any -- the Photos tab already
  // knows this from the entry it's editing) says which cache array
  // actually holds this photo's live entry (photosByField[fieldId] vs.
  // the flat generalPhotos), so the in-memory patch lands in the same
  // place ingestPhoto()/ingestGeneralPhoto() originally put it, without
  // a full-cache rescan.
  function assignPhotoLabel(id, fieldId, category, label) {
    idbGetById(id).then(function (record) {
      if (!record) return;
      record.category = category;
      record.label = label;
      return idbPutPhoto(record).then(function () {
        var arr = fieldId ? (photosByField[fieldId] || []) : generalPhotos;
        var entry = arr.filter(function (p) { return p.id === id; })[0];
        if (entry) {
          entry.category = category;
          entry.label = label;
        }
        scheduleAutoSave();
        render();
      });
    }).catch(function (e) {
      window.console && console.error && console.error('Clipboard-Flux: could not assign photo label', e);
      render();
    });
  }

  // Full-size viewer is a persistent overlay outside the tab-scoped
  // #screen (so switching tabs/fields underneath can't blow it away
  // mid-view) -- its own tiny render function, not folded into the main
  // render(), since it depends on an async full-Blob fetch the rest of
  // the app doesn't need. Fetches the full-resolution Blob on demand
  // (never held in photosByField) so viewing one photo doesn't require
  // every thumbnail's full image to already be in memory.
  function openFullPhotoViewer(fieldId, id) {
    idbGetById(id).then(function (record) {
      if (!record) return;
      if (fullViewerState) URL.revokeObjectURL(fullViewerState.url);
      fullViewerState = {
        fieldId: fieldId,
        id: id,
        url: URL.createObjectURL(record.blob),
        originalFileName: record.originalFileName || ''
      };
      renderPhotoViewer();
    }).catch(function (e) {
      window.console && console.error && console.error('Clipboard-Flux: could not open photo', e);
    });
  }

  function closeFullPhotoViewer() {
    if (fullViewerState) {
      URL.revokeObjectURL(fullViewerState.url);
      fullViewerState = null;
    }
    renderPhotoViewer();
  }

  function renderPhotoViewer() {
    var el = document.getElementById('photo-viewer');
    if (!fullViewerState) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    el.innerHTML = '<div class="photo-viewer-backdrop">' +
      '<div class="photo-viewer-body">' +
        '<button type="button" class="photo-viewer-close-btn" aria-label="Close">&times;</button>' +
        '<img src="' + esc(fullViewerState.url) + '" alt="' + esc(fullViewerState.originalFileName) + '">' +
      '</div>' +
    '</div>';
    var backdrop = el.querySelector('.photo-viewer-backdrop');
    backdrop.onclick = function (ev) {
      if (ev.target === backdrop) closeFullPhotoViewer();
    };
    el.querySelector('.photo-viewer-close-btn').onclick = closeFullPhotoViewer;
  }

  // ---- MultiSelect Dropdown selector sheet (Milestone 22.4.4) ----
  //
  // A persistent overlay living outside #screen, same "own render
  // function, untouched by the tab-scoped render()" pattern as
  // fullViewerState/renderPhotoViewer() just above -- necessary because
  // an option toggle needs a full render() (to update the trigger's own
  // collapsed summary text and, when this field is a FOLLOW_UP trigger,
  // any Dynamic content beneath it) without also tearing down and
  // losing the sheet the user still has open. Built from scratch (never
  // a native <select multiple>) so whole-row taps, an always-visible
  // checked state per option, and a reachable Done button are all
  // reliable on touch regardless of how many options there are or where
  // the triggering field sits on the page.
  function openMsdSheet(id) {
    setActiveField(id);
    msdOpenFieldId = id;
    render();
    renderMsdSheet();
  }

  function closeMsdSheet() {
    msdOpenFieldId = null;
    render();
    renderMsdSheet();
  }

  // Toggles one option in place, then keeps both surfaces in sync:
  // render() rebuilds #screen (so the trigger's summary text and any
  // live Dynamic follow-up content beneath it react immediately, same
  // as every other option control), then renderMsdSheet() refreshes
  // just the sheet's own checked states -- the sheet is outside #screen
  // so render() alone never closes it, and the sheet stays open across
  // any number of taps until Done or tap-outside.
  function toggleMsdOption(fieldId, value) {
    var arr = Array.isArray(values[fieldId]) ? values[fieldId].slice() : [];
    var i = arr.indexOf(value);
    if (i === -1) arr.push(value); else arr.splice(i, 1);
    values[fieldId] = arr;
    saveValues();
    render();
    renderMsdSheet();
  }

  function renderMsdSheet() {
    var el = document.getElementById('msd-sheet');
    if (!msdOpenFieldId) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    var f = findFieldOrQuestionById(msdOpenFieldId);
    if (!f) {
      msdOpenFieldId = null;
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    var current = Array.isArray(values[f.id]) ? values[f.id] : [];
    el.hidden = false;
    el.innerHTML = '<div class="msd-backdrop">' +
      '<div class="msd-sheet-body">' +
        '<div class="msd-sheet-header">' +
          '<div class="msd-sheet-title">' + esc(f.label) + '</div>' +
          '<button type="button" class="msd-done-btn" data-role="msd-done">Done</button>' +
        '</div>' +
        '<div class="msd-option-list">' +
          (f.options || []).map(function (o) {
            var checked = current.indexOf(o) !== -1;
            return '<button type="button" class="msd-option-row' + (checked ? ' checked' : '') +
              '" data-role="msd-option" data-value="' + esc(o) + '">' +
              '<span class="msd-checkbox' + (checked ? ' checked' : '') + '" aria-hidden="true"></span>' +
              '<span class="msd-option-label">' + esc(o) + '</span>' +
              '</button>';
          }).join('') +
        '</div>' +
      '</div>' +
    '</div>';
    var backdrop = el.querySelector('.msd-backdrop');
    backdrop.onclick = function (ev) {
      if (ev.target === backdrop) closeMsdSheet();
    };
    el.querySelector('[data-role="msd-done"]').onclick = closeMsdSheet;
    Array.prototype.forEach.call(el.querySelectorAll('[data-role="msd-option"]'), function (btn) {
      btn.onclick = function () { toggleMsdOption(f.id, btn.dataset.value); };
    });
  }

  // ---- Inspection identity + Save/Load/Reset (Milestone 15) ----

  var FOOTPRINT_SCHEMA_VERSION = 1;

  function defaultFootprint() {
    return { version: FOOTPRINT_SCHEMA_VERSION, strokes: [] };
  }

  // Milestone 22: accepts whatever's sitting in a loaded/imported
  // inspectionData record's `footprint` property and returns a document
  // guaranteed safe to draw from -- {version, strokes:[...]} with every
  // entry a well-formed line or freehand stroke. Used both for a normal
  // IndexedDB load (where a pre-Milestone-22 inspection's record simply
  // has no `footprint` property at all -- schemaless-per-record, exactly
  // like Milestone 21's category/label fields needed no migration) and
  // for JSON import (where the file could be hand-edited or from an
  // older/newer app version) -- same "validate structurally, drop what's
  // malformed rather than reject or crash the whole load" posture
  // validateImportedInspection() already uses for the rest of the file.
  // A stroke missing required fields, or with a `type` this build
  // doesn't understand, is silently skipped -- not fatal, since Footprint
  // is additive inspection content, same tolerance photos/externalPhoto
  // Manifest already get.
  function sanitizeFootprint(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.strokes)) return defaultFootprint();
    var strokes = raw.strokes.filter(function (s) {
      if (!s || typeof s !== 'object') return false;
      if (s.type === 'line') {
        return isFinitePoint(s.a) && isFinitePoint(s.b);
      }
      if (s.type === 'freehand') {
        return Array.isArray(s.points) && s.points.length >= 2 && s.points.every(isFinitePoint);
      }
      return false;
    }).map(function (s) {
      var width = (s.width === 'thin' || s.width === 'thick') ? s.width : 'medium';
      var id = (typeof s.id === 'string' && s.id) ? s.id : generateFootprintStrokeId();
      if (s.type === 'line') {
        return { id: id, type: 'line', a: { x: s.a.x, y: s.a.y }, b: { x: s.b.x, y: s.b.y }, width: width };
      }
      return { id: id, type: 'freehand', points: s.points.map(function (p) { return { x: p.x, y: p.y }; }), width: width };
    });
    return { version: FOOTPRINT_SCHEMA_VERSION, strokes: strokes };
  }

  function isFinitePoint(p) {
    return !!p && typeof p === 'object' && typeof p.x === 'number' && typeof p.y === 'number' &&
      isFinite(p.x) && isFinite(p.y);
  }

  function generateFootprintStrokeId() {
    return 'fp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  function defaultNotes() {
    return { version: NOTES_SCHEMA_VERSION, text: '', hand: { strokes: [], docHeight: 0 } };
  }

  function generateNotesStrokeId() {
    return 'note_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  // Milestone 22.4: same "validate structurally, drop what's malformed
  // rather than reject or crash the whole load" posture as
  // sanitizeFootprint()/sanitizeReference() -- used for both a normal
  // IndexedDB load (a pre-0.22.4 inspection simply has no `notes`
  // property at all, same schemaless-per-record tolerance every other
  // additive field in this file already gets) and JSON import (#25: an
  // older file with no `notes` property must keep importing successfully,
  // never fail). A hand-note stroke needs at least one point; anything
  // else malformed is silently dropped rather than aborting the load. No
  // per-stroke width is stored (#9/#20 -- one fixed default thickness,
  // deliberately kept out of the data model rather than just out of the
  // UI, so there is nothing here that could quietly grow into
  // configurability later).
  // Milestone 22.4.2: `docHeight` replaces 22.4's logicalWidth/
  // logicalHeight fit-transform pair -- see the Notes section's own
  // header comment for the full before/after. Backward compatibility
  // (#49) is by construction, not conversion: a 22.4/22.4.1 stroke's
  // (x,y) values were already raw CSS pixels relative to the canvas's
  // own top-left at scale 1 (logicalWidth/logicalHeight were themselves
  // just the canvas's own CSS size at first-draw time, and the fit
  // transform was the identity whenever the canvas hadn't been resized
  // since) -- exactly what this milestone's document-space model uses
  // directly. Old points are copied through completely unchanged; only
  // `docHeight` is computed fresh (never trusted blindly from a possibly
  // hand-edited file) as the larger of whatever was persisted and enough
  // room to contain every existing stroke, so nothing pre-existing is
  // ever clipped by a too-short canvas on first load after upgrading.
  function sanitizeNotes(raw) {
    if (!raw || typeof raw !== 'object') return defaultNotes();
    var text = typeof raw.text === 'string' ? raw.text : '';
    var handRaw = (raw.hand && typeof raw.hand === 'object') ? raw.hand : {};
    var strokes = Array.isArray(handRaw.strokes) ? handRaw.strokes.filter(function (s) {
      return s && typeof s === 'object' && Array.isArray(s.points) && s.points.length >= 1 && s.points.every(isFinitePoint);
    }).map(function (s) {
      var id = (typeof s.id === 'string' && s.id) ? s.id : generateNotesStrokeId();
      return { id: id, points: s.points.map(function (p) { return { x: p.x, y: p.y }; }) };
    }) : [];
    var persistedDocHeight = (typeof handRaw.docHeight === 'number' && isFinite(handRaw.docHeight) && handRaw.docHeight > 0)
      ? handRaw.docHeight : 0;
    var maxStrokeY = strokes.reduce(function (max, s) {
      return s.points.reduce(function (m, p) { return Math.max(m, p.y); }, max);
    }, 0);
    var docHeight = Math.max(persistedDocHeight, maxStrokeY + NOTES_HAND_BOTTOM_BUFFER, NOTES_HAND_MIN_DOC_HEIGHT);
    return { version: NOTES_SCHEMA_VERSION, text: text, hand: { strokes: strokes, docHeight: docHeight } };
  }

  // Milestone 22.3: validates/normalizes whatever's sitting in a loaded
  // or imported inspectionData record's `reference` property, the same
  // "structurally validate, fail safe rather than trust blindly" posture
  // sanitizeFootprint() already established -- a malformed/corrupt
  // record (or a hand-edited JSON file) degrades to "no reference"
  // (null) rather than throwing or rendering garbage. Never validates or
  // touches an actual image Blob -- there isn't one in this object at
  // all, by design (see footprintReference's own comment).
  function sanitizeReference(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.sourceType !== 'image' && raw.sourceType !== 'pdf') return null;
    if (typeof raw.width !== 'number' || typeof raw.height !== 'number' ||
      !isFinite(raw.width) || !isFinite(raw.height) || raw.width <= 0 || raw.height <= 0) {
      return null;
    }
    var t = (raw.transform && typeof raw.transform === 'object') ? raw.transform : {};
    return {
      version: 1,
      sourceType: raw.sourceType,
      filename: typeof raw.filename === 'string' ? raw.filename : '',
      mimeType: typeof raw.mimeType === 'string' ? raw.mimeType : '',
      pdfPageIndex: typeof raw.pdfPageIndex === 'number' ? raw.pdfPageIndex : null,
      pdfPageCount: typeof raw.pdfPageCount === 'number' ? raw.pdfPageCount : null,
      width: raw.width,
      height: raw.height,
      transform: {
        x: typeof t.x === 'number' && isFinite(t.x) ? t.x : 0,
        y: typeof t.y === 'number' && isFinite(t.y) ? t.y : 0,
        scale: (typeof t.scale === 'number' && isFinite(t.scale) && t.scale > 0) ? t.scale : 1,
        rotation: typeof t.rotation === 'number' && isFinite(t.rotation) ? t.rotation : 0
      },
      opacity: (typeof raw.opacity === 'number' && isFinite(raw.opacity))
        ? Math.max(0.05, Math.min(1, raw.opacity)) : FOOTPRINT_REFERENCE_DEFAULT_OPACITY,
      visible: raw.visible !== false,
      locked: raw.locked !== false,
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString()
    };
  }

  // Replaces values/disregarded/otherText/fieldNotes/footprint wholesale
  // (an inspection switch, not a merge) and immediately syncs the result
  // to localStorage via the existing save*() functions, so the new
  // inspection's data becomes the live working draft. Every save*() call
  // arms a fresh autosave timer as a side effect (see scheduleAutoSave())
  // -- callers of applyInspectionDataToMemory() always correct that with
  // an explicit clearTimeout()+setSaveStatus('saved') right after (see
  // switchToInspection()), since freshly applied data by definition
  // matches its own IndexedDB snapshot. footprint itself has no separate
  // save*()/localStorage mirror the way values/etc. do -- it's written
  // straight to IndexedDB by saveCurrentInspection() like everything
  // else in this function, and scheduleAutoSave() is called directly by
  // whatever Footprint mutation just happened (see wireFootprintTabControls()),
  // not from here.
  function applyInspectionDataToMemory(data) {
    values = (data && data.values) || {};
    disregarded = (data && data.disregarded) || {};
    otherText = (data && data.otherText) || {};
    fieldNotes = (data && data.fieldNotes) || {};
    externalPhotoManifest = (data && Array.isArray(data.externalPhotoManifest)) ? data.externalPhotoManifest : [];
    footprint = sanitizeFootprint(data && data.footprint);
    footprintReference = sanitizeReference(data && data.reference);
    notes = sanitizeNotes(data && data.notes);
    saveValues();
    saveDisregarded();
    saveOtherText();
    saveFieldNotes();
  }

  // The one place that makes some inspectionId "the" active inspection:
  // reads its metadata + full data record from IndexedDB, applies the
  // data to memory, resets all transient per-session UI state (which
  // field/tab/panel was open, any open photo viewer -- none of that
  // means anything for a different inspection), and reloads its photos.
  // Used by Load, and reused by New/Reset/migration after they've
  // written that inspection's initial/cleared records, so there's one
  // single code path for "this inspection is now open," not several
  // slightly-different ones.
  function switchToInspection(inspectionId) {
    return idbGetInspection(inspectionId).then(function (meta) {
      if (!meta) throw new Error('Inspection not found: ' + inspectionId);
      return idbGetInspectionData(inspectionId).then(function (data) {
        activeInspection = meta;
        saveActiveInspectionId(meta.inspectionId);
        // applyInspectionDataToMemory() calls the same save*() functions
        // any other edit does, which arm a fresh autosave timer via
        // scheduleAutoSave() -- but data freshly loaded from IndexedDB
        // (or a just-written empty snapshot, for New/Reset) already
        // matches what's durably stored, so that timer is pointless.
        // Clearing it and forcing 'saved' *after* this call, not before,
        // is what makes this override win.
        applyInspectionDataToMemory(data);
        if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = null; }
        setSaveStatus('saved');
        activeFieldId = null;
        noteOpenFieldId = null;
        photoOpenFieldId = null;
        closeFullPhotoViewer();
        // Milestone 22: Footprint's undo history and in-progress draft
        // stroke are this *session's* state, not this inspection's saved
        // state -- undoing past a Load/New/Reset boundary into a
        // different inspection's drawing history would be nonsensical
        // and unsafe, exactly like activeFieldId/noteOpenFieldId above.
        // The view transform is reset too (see footprintView's own
        // comment) so a new inspection's Footprint always opens at the
        // same predictable default framing rather than wherever the
        // previous inspection's canvas happened to be panned/zoomed to.
        footprintUndoStack = [];
        footprintDraft = null;
        footprintTool = 'pencil';
        footprintView = { scale: 1, x: 0, y: 0 };
        // Milestone 22.3: the reference-edit gesture and popover-open
        // state are session UI, same category as the Footprint state
        // just above -- never carried across an inspection switch.
        footprintReferenceGestureState = null;
        footprintReferencePanelOpen = false;
        // Milestone 22.4: Hand-notes session/undo/gesture state is the
        // exact same category as Footprint's own just above -- this
        // session's drawing history, never a different inspection's.
        // notesMode resets to 'text' (#26's fastest-capture default);
        // notesHandTool resets to 'pencil', matching footprintTool.
        notesMode = 'text';
        notesHandUndoStack = [];
        notesHandDraft = null;
        notesHandTool = 'pencil';
        notesHandPointers = {};
        activeTab = (CFG && CFG.main.tabs[0]) || null;
        bootLog('inspection memory hydration completed (switchToInspection)', { inspectionId: meta.inspectionId });
        return loadAllPhotosIntoCache().then(function () {
          return loadFootprintReferenceBitmap();
        });
      });
    });
  }

  // Writes both of a brand-new inspection's IndexedDB records (metadata
  // + an empty data blob) immediately, rather than waiting for an
  // explicit first Save -- so it shows up in the Load list right away
  // and starts life not-dirty (its working draft, empty, already
  // matches what's durably stored). put(), not add(), throughout this
  // file's inspection writes -- inspectionId is always the keyPath, so
  // an upsert is naturally create-or-update with no separate "does this
  // already exist" branch anywhere.
  function createNewInspection(propertyAddress) {
    var id = generateInspectionId();
    var now = new Date().toISOString();
    var meta = { inspectionId: id, propertyAddress: propertyAddress || '', createdAt: now, updatedAt: now };
    var data = { inspectionId: id, values: {}, disregarded: {}, otherText: {}, fieldNotes: {}, externalPhotoManifest: [], footprint: defaultFootprint(), reference: null, notes: defaultNotes() };
    return idbPutInspection(meta)
      .then(function () { return idbPutInspectionData(data); })
      .then(function () { return switchToInspection(id); });
  }

  // Clears entered data (answers/notes/Other text/Disregard/photos)
  // while keeping inspectionId, propertyAddress, and the original
  // createdAt -- only updatedAt moves. Commits the cleared state to
  // IndexedDB immediately (this *is* the save, not a working-draft-only
  // clear) since Reset already requires its own explicit confirmation
  // before the caller ever reaches this function -- once confirmed, the
  // clear should be real, not something a missed Save could undo.
  // Photos are deleted by inspectionId (idbDeleteAllPhotosForInspection),
  // never by fieldId alone, so no other inspection's photos are ever at
  // risk even if they share field ids.
  function resetCurrentInspection() {
    if (!activeInspection) return Promise.resolve();
    var id = activeInspection.inspectionId;
    var now = new Date().toISOString();
    return idbDeleteAllPhotosForInspection(id)
      .then(function () { return idbDeleteReferenceBlob(id); })
      .then(function () {
        var data = { inspectionId: id, values: {}, disregarded: {}, otherText: {}, fieldNotes: {}, externalPhotoManifest: [], footprint: defaultFootprint(), reference: null, notes: defaultNotes() };
        return idbPutInspectionData(data);
      })
      .then(function () {
        var meta = {
          inspectionId: id,
          propertyAddress: activeInspection.propertyAddress,
          createdAt: activeInspection.createdAt,
          updatedAt: now
        };
        return idbPutInspection(meta);
      })
      .then(function () { return switchToInspection(id); });
  }

  // Writes the current in-memory values/disregarded/otherText/
  // fieldNotes as this inspection's new IndexedDB snapshot and bumps
  // updatedAt -- put() on the same inspectionId, so re-saving always
  // updates the one existing record rather than creating another.
  // Photos need no separate save step here: ingestPhoto()/deletePhoto()
  // already write straight to IndexedDB the moment they happen, already
  // tagged with this inspection's id.
  function saveCurrentInspection() {
    if (!activeInspection) return Promise.resolve();
    var id = activeInspection.inspectionId;
    var now = new Date().toISOString();
    var data = {
      inspectionId: id,
      values: values,
      disregarded: disregarded,
      otherText: otherText,
      fieldNotes: fieldNotes,
      externalPhotoManifest: externalPhotoManifest,
      footprint: footprint || defaultFootprint(),
      reference: footprintReference,
      notes: notes || defaultNotes()
    };
    return idbPutInspectionData(data)
      .then(function () {
        var meta = {
          inspectionId: id,
          propertyAddress: activeInspection.propertyAddress,
          createdAt: activeInspection.createdAt,
          updatedAt: now
        };
        activeInspection = meta;
        return idbPutInspection(meta);
      });
  }

  // One-time pre-0.15 data recovery, run only when boot finds no active-
  // inspection pointer at all (see resolveActiveInspectionAndBoot()).
  // Detects legacy data two ways: any non-empty content already sitting
  // in the plain (unscoped) localStorage keys loadValues()/etc. already
  // read, or any photo record that predates `inspectionId` entirely
  // (idbGetAllPhotosRaw() -- an index query can't find those, see its
  // comment). If neither is present, resolves to null and the caller
  // falls back to an ordinary new blank inspection -- a genuinely fresh
  // install shouldn't get a fabricated "migrated" inspection for data
  // that never existed. When there IS something to migrate, it's
  // wrapped into one new inspection named "Unsaved / Migrated
  // Inspection" and written to IndexedDB immediately, and every
  // orphaned photo record is updated in place (put(), same id) to carry
  // that inspection's id -- no photo is copied, recreated, or dropped.
  function migrateLegacyDataIfNeeded() {
    var legacyValues = loadValues();
    var legacyDisregarded = loadDisregarded();
    var legacyOtherText = loadOtherText();
    var legacyFieldNotes = loadFieldNotes();
    var hasLegacyLocalData =
      Object.keys(legacyValues).length > 0 ||
      Object.keys(legacyDisregarded).length > 0 ||
      Object.keys(legacyOtherText).length > 0 ||
      Object.keys(legacyFieldNotes).length > 0;

    return idbGetAllPhotosRaw().then(function (allPhotos) {
      var orphanPhotos = allPhotos.filter(function (r) { return !r.inspectionId; });
      if (!hasLegacyLocalData && orphanPhotos.length === 0) {
        return null;
      }
      var id = generateInspectionId();
      var now = new Date().toISOString();
      var meta = { inspectionId: id, propertyAddress: MIGRATED_INSPECTION_ADDRESS, createdAt: now, updatedAt: now };
      var data = {
        inspectionId: id,
        values: legacyValues,
        disregarded: legacyDisregarded,
        otherText: legacyOtherText,
        fieldNotes: legacyFieldNotes,
        externalPhotoManifest: []
      };
      return idbPutInspection(meta)
        .then(function () { return idbPutInspectionData(data); })
        .then(function () {
          return Promise.all(orphanPhotos.map(function (r) {
            r.inspectionId = id;
            return idbPutPhoto(r);
          }));
        })
        .then(function () { return id; });
    });
  }

  // Boot path for "no active-inspection pointer found" -- either a
  // pre-0.15 upgrade (migrateLegacyDataIfNeeded() finds something and
  // returns its new id) or a genuinely fresh install (nothing found,
  // falls through to an ordinary blank first inspection, no prompt --
  // asking for an address before the user has even seen the app would
  // be a blocking dialog on first paint; New Inspection is right there
  // if they want to name one properly).
  function bootstrapFresh() {
    return migrateLegacyDataIfNeeded().then(function (migratedId) {
      if (migratedId) return switchToInspection(migratedId);
      return createNewInspection('');
    });
  }

  // Runs once at boot, after config.json resolves. Fast path: a valid
  // active-inspection pointer already exists, so values/disregarded/
  // otherText/fieldNotes (already loaded at module-init time from
  // localStorage) are already correct as-is -- no need to round-trip
  // through IndexedDB just to reapply the same data a plain refresh
  // didn't touch. That localStorage snapshot can still be *ahead* of
  // IndexedDB, though -- a previous session could have been killed
  // (tab closed, phone locked and never resumed, browser crash) before
  // its debounced autosave ever fired. performSave() here reconciles
  // that gap unconditionally: it's the same write autosave always does,
  // just triggered once immediately at boot instead of after an edit,
  // and is a harmless no-op write if there was nothing to reconcile. Its
  // rejection is deliberately swallowed (not rethrown into `boot`) --
  // saveStatus already reflects 'failed' via performSave()'s own catch,
  // and activeInspection/values/etc. are all still correct in memory;
  // this must not fall through to the dbUnavailable pseudo-inspection
  // fallback below, which is reserved for IndexedDB being unreachable at
  // all, not one write failing. A missing/stale pointer (or any other
  // failure reading the pointed-to inspection itself) falls through to
  // bootstrapFresh().
  function resolveActiveInspectionAndBoot() {
    bootLog('BOOT START');
    var pointedId = loadActiveInspectionId();
    bootLog('active inspection key read', { found: !!pointedId });
    var boot;
    if (pointedId) {
      boot = idbGetInspection(pointedId).then(function (meta) {
        bootLog('active inspection record lookup completed', { found: !!meta });
        if (!meta) return bootstrapFresh();
        activeInspection = meta;
        // Milestone 22: footprint has no localStorage mirror the way
        // values/disregarded/otherText/fieldNotes do (deliberately --
        // see footprint's own module-level comment, and #21's "avoid
        // localStorage if the sketch structure can grow materially"),
        // so unlike those four fields, it can NOT be trusted as already
        // correct from module-init on this fast path -- it must be read
        // from IndexedDB here explicitly, every time, before the
        // reconciliation save below runs. Skipping this would leave
        // `footprint` at its safe-but-empty default for the rest of the
        // session and, worse, let that reconciliation save immediately
        // overwrite this inspection's real saved strokes with an empty
        // document the moment any autosave next fired.
        //
        // Milestone 22.3: `reference` metadata is exactly the same
        // category as `footprint` here -- no localStorage mirror, must
        // be read fresh on this fast path for the identical reason. Its
        // image Blob is loaded separately (loadFootprintReferenceBitmap(),
        // its own store, never touched by this reconciliation save at
        // all) but must still be kicked off here so the Footprint tab's
        // first paint after a refresh already has a decoded bitmap ready
        // rather than a one-frame flash of "no reference."
        return idbGetInspectionData(pointedId).then(function (data) {
          footprint = sanitizeFootprint(data && data.footprint);
          footprintReference = sanitizeReference(data && data.reference);
          // Milestone 22.4: `notes` is exactly the same category as
          // footprint/reference here -- no localStorage mirror, must be
          // read fresh on this fast path or the reconciliation save just
          // below would immediately overwrite real saved notes with the
          // safe-but-empty module-init default.
          notes = sanitizeNotes(data && data.notes);
          bootLog('inspection memory hydration completed (footprint/reference/notes)');
          bootLog('inspection photo query started');
          return loadAllPhotosIntoCache();
        }).then(function () {
          bootLog('inspection photo query completed', {
            fieldCount: Object.keys(photosByField).length,
            generalCount: generalPhotos.length
          });
          bootLog('reference blob load started');
          return loadFootprintReferenceBitmap();
        }).then(function () {
          bootLog('reference blob load completed', { present: !!footprintReferenceBitmap });
          return performSave().catch(function (e) {
            window.console && console.error && console.error('Clipboard-Flux: boot reconciliation save failed', e);
          });
        });
      });
    } else {
      boot = bootstrapFresh();
    }
    // Milestone 22.4.1 (#31): a bounded, purely diagnostic safety net --
    // never the underlying fix, see openPhotoDb()'s onblocked handler for
    // that -- against any other genuinely-hanging async browser API this
    // sequence might depend on. Racing, not replacing: `boot`'s own
    // .then() callbacks above are already attached and keep running to
    // completion in the background regardless of which side of the race
    // settles first, so a slow-but-eventually-successful restore still
    // finishes hydrating real state even if the timeout already moved the
    // UI to the Restore Error state first; the user's data is never at
    // risk either way, only the UI's up-to-dateness, and Retry re-reads
    // whatever is actually in memory/storage at that point.
    boot = Promise.race([
      boot,
      new Promise(function (resolve, reject) {
        setTimeout(function () {
          var err = new Error('Inspection restore timed out.');
          err.clipboardFluxTimeout = true;
          reject(err);
        }, BOOT_TIMEOUT_MS);
      })
    ]);
    return boot.then(function () {
      bootState = 'ready';
      bootErrorMessage = null;
    }, function (e) {
      window.console && console.error && console.error('Clipboard-Flux: inspection boot failed', e);
      bootState = 'error';
      if (e && e.clipboardFluxBlocked) {
        // See bootState's own comment -- deliberately does NOT fabricate
        // a pseudo-inspection here. The real stored inspection is very
        // likely still completely intact, just temporarily unreachable;
        // Retry (which clears the cached, now-rejected DB connection via
        // resetPhotoDbConnection()) is the safe path back to it.
        bootErrorMessage = 'Storage is blocked by another open tab of this app. Close other Clipboard-Flux tabs, then tap Retry.';
        return;
      }
      if (e && e.clipboardFluxTimeout) {
        bootErrorMessage = 'Inspection restore timed out. Your stored data has not been reset.';
        return;
      }
      dbUnavailable = true;
      bootErrorMessage = 'Inspection could not be restored. Your stored data has not been reset.';
      if (!activeInspection) {
        // No durable inspection storage reachable at all -- rather than
        // leaving activeInspection null (which would strand the bar on
        // "Loading…" forever and make New/Save/Load/Reset all silently
        // no-op via their own `if (!activeInspection)` guards), fall
        // back to a single in-memory-only pseudo-inspection so the rest
        // of the app still works for this session on localStorage
        // alone -- the same degrade-don't-break posture Milestone 14
        // already established for photos when IndexedDB is unavailable.
        var now = new Date().toISOString();
        activeInspection = {
          inspectionId: null,
          propertyAddress: '(storage unavailable -- unsaved)',
          createdAt: now,
          updatedAt: now
        };
      }
    }).then(function () {
      bootLog('BOOT READY', { state: bootState });
      render();
    });
  }

  // Milestone 22.4.1: the one non-destructive way back from the Restore
  // Error state -- clears only the cached (now-settled, rejected) DB
  // connection Promise so the next attempt issues a fresh
  // indexedDB.open(), then re-runs the exact same read-only resolution
  // process. Never clears storage, never resets/creates an inspection.
  function retryBootRestore() {
    if (bootState === 'restoring') return;
    resetPhotoDbConnection();
    bootState = 'restoring';
    bootErrorMessage = null;
    render();
    resolveActiveInspectionAndBoot();
  }

  // Under auto-save there's no separate "unsaved working draft" to lose
  // -- New/Load just need whatever's currently in memory durably
  // written before switching away from it (Milestone 18 #7). Flushes
  // any pending/in-flight autosave and resolves once IndexedDB is
  // confirmed caught up; a rejection means the write actually failed,
  // in which case the caller must warn and abort the switch rather than
  // silently abandoning data that was never made durable.
  function flushBeforeSwitch() {
    return flushPendingSave();
  }

  function handleNewInspectionClick() {
    flushBeforeSwitch().then(function () {
      var address = window.prompt('Property address for the new inspection:', '');
      if (address === null) return null;
      var trimmed = address.trim();
      return createNewInspection(trimmed).then(function () {
        // Milestone 18 #6: seed the workbook-driven Property Address
        // field from the same address just given to the new inspection,
        // so there's only ever one place to type it. saveValues() mirrors
        // this to localStorage and schedules the normal autosave, same
        // as any other edit -- no special-cased immediate write needed.
        if (ADDRESS_FIELD_ID) {
          values[ADDRESS_FIELD_ID] = trimmed;
          saveValues();
        }
        return true;
      });
    }, function (e) {
      window.console && console.error && console.error('Clipboard-Flux: could not save before New', e);
      window.alert('Could not save your current changes (' + e.message + '). The new inspection was not started -- resolve Save Now in the Inspection tab, then try again.');
    }).then(function (started) {
      if (started) render();
    }).catch(function (e) {
      window.console && console.error && console.error('Clipboard-Flux: could not create inspection', e);
      window.alert('Could not create the new inspection: ' + e.message);
    });
  }

  // Milestone 22.4.1 (#9/#32): the shared guard for every inspection-
  // dependent action button (Export PDF, Export JSON, Save Now, Reset).
  // Before this fix, each of these only ever checked `!activeInspection`
  // -- true both while boot is still resolving AND once it has genuinely
  // finished with nothing to show, so a tap mid-restore produced the
  // exact field-reported "No active inspection to export" alert, which
  // isn't a lie so much as a statement made before it's actually known to
  // be true. Distinguishing bootState === 'restoring' first means the
  // user now sees an honest "still loading" message instead.
  function ensureBootReadyForAction(actionLabel) {
    if (bootState === 'restoring') {
      window.alert('Inspection is still loading. Please wait a moment and try again.');
      return false;
    }
    // A settled Restore Error with no activeInspection (the blocked-
    // storage case -- see bootState's own comment) is a different, more
    // specific truth than "no active inspection": there may well BE one,
    // just not currently reachable. Surfacing bootErrorMessage here
    // instead of the generic "No active inspection to X" keeps this
    // guard from making the same kind of not-yet-true (or, here, not-
    // actually-true) claim #32 flags.
    if (bootState === 'error' && !activeInspection) {
      window.alert(bootErrorMessage || 'Inspection could not be restored.');
      return false;
    }
    if (!activeInspection || !activeInspection.inspectionId) {
      window.alert('No active inspection to ' + actionLabel + '.');
      return false;
    }
    return true;
  }

  // Explicit manual checkpoint (Milestone 18 #2's fallback action, now
  // living in the Inspection tab as "Save Now") -- bypasses the debounce
  // and writes immediately. Also how a 'failed' status gets retried:
  // performSave() itself doesn't remember *why* the last write failed,
  // it just tries again with whatever's currently in memory, which is
  // exactly what a retry should do.
  function handleSaveInspectionClick() {
    if (bootState === 'restoring') {
      window.alert('Inspection is still loading. Please wait a moment and try again.');
      return;
    }
    performSave().catch(function (e) {
      window.console && console.error && console.error('Clipboard-Flux: could not save inspection', e);
      window.alert('Could not save this inspection: ' + e.message);
    });
  }

  function handleLoadInspectionClick() {
    flushBeforeSwitch().then(function () {
      openInspectionLoadModal();
    }, function (e) {
      window.console && console.error && console.error('Clipboard-Flux: could not save before Load', e);
      window.alert('Could not save your current changes (' + e.message + '). Load was cancelled -- resolve Save Now in the Inspection tab, then try again.');
    });
  }

  function handleResetInspectionClick() {
    if (bootState === 'restoring') {
      window.alert('Inspection is still loading. Please wait a moment and try again.');
      return;
    }
    if (!activeInspection) return;
    var addr = activeInspection.propertyAddress || '(no address)';
    var ok = window.confirm(
      'Reset "' + addr + '"? This permanently clears all entered answers, notes, ' +
      'and photos for this inspection. This cannot be undone.'
    );
    if (!ok) return;
    // Reset is the opposite of flush-before-switch: it must make sure no
    // stale pending/in-flight write for the *pre-reset* state can land
    // after Reset's own cleared write and resurrect old data. Cancelling
    // the debounce timer is enough for the pending case; for an already
    // in-flight write, waiting it out (ignoring its outcome either way)
    // guarantees ordering without needing to cancel an XHR-like request
    // that IndexedDB has no API to cancel anyway.
    if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = null; }
    (saveInFlightPromise || Promise.resolve()).catch(function () {}).then(function () {
      return resetCurrentInspection();
    }).then(function () { render(); })
      .catch(function (e) {
        window.console && console.error && console.error('Clipboard-Flux: could not reset inspection', e);
        window.alert('Could not reset this inspection: ' + e.message);
      });
  }

  // Load Inspection's list overlay -- same persistent-overlay-outside-
  // #screen pattern as the photo viewer, its own small render function
  // for the same reason (depends on an async IndexedDB read the rest of
  // the app doesn't need). Sorted newest-updated-first; the currently
  // open inspection is marked so re-selecting it is visibly a no-op.
  function openInspectionLoadModal() {
    idbGetAllInspections().then(function (list) {
      list.sort(function (a, b) {
        return (b.updatedAt || '').localeCompare(a.updatedAt || '');
      });
      renderInspectionModal(list);
    }).catch(function (e) {
      window.console && console.error && console.error('Clipboard-Flux: could not list inspections', e);
      window.alert('Could not load the inspection list: ' + e.message);
    });
  }

  // Shared by the Load list, closeInspectionModal() also doubles as
  // every choice-modal's Cancel/close/backdrop-tap handler (see
  // renderChoiceModal()) -- one function, one #inspection-modal element,
  // whichever renderer last wrote into it.
  function closeInspectionModal() {
    var el = document.getElementById('inspection-modal');
    el.hidden = true;
    el.innerHTML = '';
  }

  function renderInspectionModal(list) {
    var el = document.getElementById('inspection-modal');
    var itemsHtml = list.length ? list.map(function (insp) {
      var isActive = activeInspection && activeInspection.inspectionId === insp.inspectionId;
      return '<button type="button" class="inspection-list-item' + (isActive ? ' active' : '') +
        '" data-role="load-inspection-item" data-inspection-id="' + esc(insp.inspectionId) + '">' +
        '<span class="inspection-list-address">' + esc(insp.propertyAddress || '(no address)') + '</span>' +
        '<span class="inspection-list-date">Updated ' + esc(formatDate(insp.updatedAt)) + '</span>' +
        '</button>';
    }).join('') : '<div class="shell-note">No saved inspections yet.</div>';
    el.hidden = false;
    el.innerHTML = '<div class="inspection-modal-backdrop">' +
      '<div class="inspection-modal-body">' +
        '<div class="inspection-modal-header">' +
          '<div class="inspection-modal-title">Load Inspection</div>' +
          '<button type="button" class="inspection-modal-close-btn" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="inspection-list">' + itemsHtml + '</div>' +
      '</div>' +
    '</div>';
    var backdrop = el.querySelector('.inspection-modal-backdrop');
    backdrop.onclick = function (ev) { if (ev.target === backdrop) closeInspectionModal(); };
    el.querySelector('.inspection-modal-close-btn').onclick = closeInspectionModal;
    Array.prototype.forEach.call(el.querySelectorAll('[data-role="load-inspection-item"]'), function (btn) {
      btn.onclick = function () {
        var id = btn.dataset.inspectionId;
        closeInspectionModal();
        switchToInspection(id)
          .then(function () { render(); })
          .catch(function (e) {
            window.console && console.error && console.error('Clipboard-Flux: could not load inspection', e);
            window.alert('Could not load that inspection: ' + e.message);
          });
      };
    });
  }

  // Generic stacked-button choice overlay, reusing the same
  // #inspection-modal element and .inspection-modal-* CSS as the Load
  // list -- Milestone 16's Export (Save and Export / Export Last Saved
  // / Cancel) and Import duplicate-id (Replace Existing / Import as
  // Copy / Cancel) prompts both need more than a plain two-way
  // window.confirm() can express, but don't need their own bespoke
  // modal markup. `opts.choices` is an array of {label, action}; the
  // backdrop, the X, and closeInspectionModal() itself all count as an
  // implicit Cancel (dismissing without picking anything changes
  // nothing, which is exactly what every one of these modals' own
  // explicit "Cancel" choice does too).
  function renderChoiceModal(opts) {
    var el = document.getElementById('inspection-modal');
    var buttonsHtml = opts.choices.map(function (c, i) {
      return '<button type="button" class="modal-choice-btn" data-choice-index="' + i + '">' +
        esc(c.label) + '</button>';
    }).join('');
    el.hidden = false;
    el.innerHTML = '<div class="inspection-modal-backdrop">' +
      '<div class="inspection-modal-body">' +
        '<div class="inspection-modal-header">' +
          '<div class="inspection-modal-title">' + esc(opts.title) + '</div>' +
          '<button type="button" class="inspection-modal-close-btn" aria-label="Close">&times;</button>' +
        '</div>' +
        (opts.message ? '<div class="shell-note">' + esc(opts.message) + '</div>' : '') +
        '<div class="modal-choice-list">' + buttonsHtml + '</div>' +
      '</div>' +
    '</div>';
    var backdrop = el.querySelector('.inspection-modal-backdrop');
    backdrop.onclick = function (ev) { if (ev.target === backdrop) closeInspectionModal(); };
    el.querySelector('.inspection-modal-close-btn').onclick = closeInspectionModal;
    Array.prototype.forEach.call(el.querySelectorAll('.modal-choice-btn'), function (btn) {
      btn.onclick = function () {
        opts.choices[Number(btn.dataset.choiceIndex)].action();
      };
    });
  }

  // ---- JSON export/import (Milestone 16) ----

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  // Strips characters invalid in Windows/macOS/most filesystem names and
  // collapses whitespace to underscores -- deliberately conservative
  // (strip rather than substitute per-character) since a slightly
  // shorter filename is harmless but a leftover invalid character can
  // silently break a save-to-Files/Drive action on some platforms.
  function sanitizeForFilename(s) {
    return String(s || '').trim()
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80);
  }

  // Local time, not UTC -- this is a human-facing filename ("when I
  // exported this, on my clock"), unlike the ISO/UTC `exportedAt` field
  // inside the file itself. Falls back to the inspectionId if the
  // address sanitizes to nothing (blank address, or an address that's
  // entirely punctuation/whitespace).
  function buildExportFilename(meta) {
    var base = sanitizeForFilename(meta.propertyAddress) || sanitizeForFilename(meta.inspectionId) || 'inspection';
    var now = new Date();
    var stamp = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate()) +
      '_' + pad2(now.getHours()) + pad2(now.getMinutes());
    return base + '_' + stamp + '.clipboard-flux.json';
  }

  // Standard client-side download technique -- a Blob + a momentary
  // object URL + a programmatically-clicked <a download>, the only real
  // option without a backend, and the same one this milestone's own
  // instructions point at ("native browser download/share... behavior
  // where available"). Revoked on a short delay rather than
  // immediately, since revoking synchronously has been known to race
  // the browser's own handoff to the download/share sheet on some
  // mobile browsers.
  function downloadJsonFile(obj, filename) {
    var json = JSON.stringify(obj, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // Builds and downloads the export file for `inspectionId` -- always
  // reads from IndexedDB (never the live in-memory values/etc.), which
  // is exactly what's expected to already match memory by the time this
  // runs: handleExportInspectionClick() flushes any pending autosave
  // write first (see flushPendingSave()) before calling this. Only
  // photo *metadata* is included (id/fieldId/filename/mimeType/
  // addedAt/width/height/order) -- explicitly never blob, thumbnailBlob,
  // or any object URL, so the file can never carry binary image data.
  function exportInspectionJson(inspectionId) {
    Promise.all([
      idbGetInspection(inspectionId),
      idbGetInspectionData(inspectionId),
      idbGetAllPhotosForInspection(inspectionId)
    ]).then(function (results) {
      var meta = results[0];
      var data = results[1];
      var photos = results[2];
      if (!meta || !data) throw new Error('Inspection not found in storage.');
      var exportObj = {
        schema: EXPORT_SCHEMA,
        schemaVersion: EXPORT_SCHEMA_VERSION,
        appVersion: APP_VERSION,
        exportedAt: new Date().toISOString(),
        inspection: {
          inspectionId: meta.inspectionId,
          propertyAddress: meta.propertyAddress,
          createdAt: meta.createdAt,
          updatedAt: meta.updatedAt
        },
        values: data.values || {},
        fieldNotes: data.fieldNotes || {},
        otherText: data.otherText || {},
        disregarded: data.disregarded || {},
        // Milestone 22 #26: structured vector drawing data, not a photo
        // -- no Blobs/base64 involved (a line/freehand stroke is just
        // numbers), so it's included directly, unlike photo binaries.
        // Always sanitized before writing (never trusts the IndexedDB
        // record blindly), so a malformed record already couldn't have
        // gotten this far in the first place, and a hand-edited export
        // is guaranteed well-formed too.
        footprint: sanitizeFootprint(data.footprint),
        // Milestone 22.3: lightweight reference metadata only -- never
        // the image Blob (there is no base64 anywhere in this object,
        // matching #21's explicit rule). This is informational/round-
        // trip context only; importing this file never resurrects a
        // live reference from it (see commitImport()'s own comment) --
        // the metadata alone can't reconstruct the actual sketch, and
        // #21 explicitly forbids pretending it exists when the Blob
        // doesn't.
        reference: sanitizeReference(data.reference),
        // Milestone 22.4: structured text + vector stroke data, same
        // "no Blobs/base64" posture as `footprint` above -- a hand-note
        // stroke is just numbers, so it's included directly and restored
        // in full on import (#24), unlike `reference` which can never be
        // resurrected from metadata alone.
        notes: sanitizeNotes(data.notes),
        photos: photos.map(function (p) {
          return {
            id: p.id,
            fieldId: p.fieldId,
            // Milestone 21: null/null on a field photo, and on a general
            // photo that's still Unassigned -- included for round-trip
            // fidelity only, same as every other photo metadata field
            // here; import never fabricates a Blob from this (see
            // commitImport()'s comment on externalPhotoManifest).
            category: p.category || null,
            label: p.label || null,
            originalFileName: p.originalFileName || '',
            mimeType: p.mimeType || '',
            addedAt: p.addedAt,
            width: p.width,
            height: p.height,
            order: p.order
          };
        })
      };
      downloadJsonFile(exportObj, buildExportFilename(meta));
    }).catch(function (e) {
      window.console && console.error && console.error('Clipboard-Flux: export failed', e);
      window.alert('Could not export this inspection: ' + e.message);
    });
  }

  // Export always reflects what's durably saved. Under Milestone 15's
  // model that meant asking the user to choose between the working
  // draft and the last save whenever they'd diverged; under Milestone
  // 18's auto-save, that distinction barely exists any more (autosave
  // already keeps IndexedDB within AUTOSAVE_DEBOUNCE_MS of memory) --
  // so this simply flushes any pending write first, then exports
  // whatever IndexedDB now holds. If the flush itself fails, this still
  // exports rather than blocking entirely -- the last successfully
  // saved snapshot is better than no export at all, and the failure is
  // already visible via the 'Save failed' status.
  function handleExportInspectionClick() {
    if (dbUnavailable) {
      window.alert('Export isn\'t available in this browser (IndexedDB is blocked or unsupported).');
      return;
    }
    if (!ensureBootReadyForAction('export')) return;
    var id = activeInspection.inspectionId;
    flushPendingSave().then(function () {
      exportInspectionJson(id);
    }, function (e) {
      window.console && console.error && console.error('Clipboard-Flux: could not save latest changes before export', e);
      window.alert('Could not save your latest changes (' + e.message + '). Exporting the last successfully saved version instead.');
      exportInspectionJson(id);
    });
  }

  function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  // Deliberately conservative: only what's actually needed to safely
  // reconstruct app state is required (schema/schemaVersion, the four
  // inspection-metadata fields, and that values/fieldNotes/otherText/
  // disregarded are objects, not e.g. arrays or strings). `photos`,
  // `appVersion`, and `exportedAt` are informational and left
  // unvalidated -- a hand-edited or older file missing them shouldn't
  // be rejected for that alone. Returns {ok:true} or {ok:false, reason}
  // rather than throwing, since every caller needs the human-readable
  // reason for the alert() it shows.
  function validateImportedInspection(obj) {
    if (!isPlainObject(obj)) return { ok: false, reason: 'the file is not a JSON object.' };
    if (obj.schema !== EXPORT_SCHEMA) {
      return { ok: false, reason: 'unrecognized schema (expected "' + EXPORT_SCHEMA + '").' };
    }
    if (SUPPORTED_SCHEMA_VERSIONS.indexOf(obj.schemaVersion) === -1) {
      return { ok: false, reason: 'unsupported schemaVersion "' + obj.schemaVersion + '".' };
    }
    var insp = obj.inspection;
    if (!isPlainObject(insp)) return { ok: false, reason: 'missing inspection metadata.' };
    if (typeof insp.inspectionId !== 'string' || !insp.inspectionId) {
      return { ok: false, reason: 'missing inspection.inspectionId.' };
    }
    if (typeof insp.propertyAddress !== 'string') {
      return { ok: false, reason: 'missing inspection.propertyAddress.' };
    }
    if (typeof insp.createdAt !== 'string' || !insp.createdAt) {
      return { ok: false, reason: 'missing inspection.createdAt.' };
    }
    if (typeof insp.updatedAt !== 'string' || !insp.updatedAt) {
      return { ok: false, reason: 'missing inspection.updatedAt.' };
    }
    if (!isPlainObject(obj.values)) return { ok: false, reason: 'values must be an object.' };
    if (!isPlainObject(obj.fieldNotes)) return { ok: false, reason: 'fieldNotes must be an object.' };
    if (!isPlainObject(obj.otherText)) return { ok: false, reason: 'otherText must be an object.' };
    if (!isPlainObject(obj.disregarded)) return { ok: false, reason: 'disregarded must be an object.' };
    if (obj.photos !== undefined && !Array.isArray(obj.photos)) {
      return { ok: false, reason: 'photos must be an array.' };
    }
    // Milestone 22 #26: footprint is optional (older exports won't have
    // it) but if present must at least be the right shape at the top
    // level -- per-stroke validation happens in sanitizeFootprint()
    // (called from commitImport()), which drops any individual malformed
    // stroke rather than rejecting the whole file over one bad entry, the
    // same tolerance photos/externalPhotoManifest already get. This check
    // only guards against something wildly wrong (a string, a number, an
    // array) at the top level.
    if (obj.footprint !== undefined && (!isPlainObject(obj.footprint) || !Array.isArray(obj.footprint.strokes))) {
      return { ok: false, reason: 'footprint must be an object with a strokes array.' };
    }
    return { ok: true };
  }

  // Reads the picked file, validates it fully *before* touching
  // IndexedDB at all (so an invalid file can never partially import),
  // then either imports directly (no id collision) or hands off to the
  // duplicate-id choice modal. Every failure path (bad JSON, failed
  // validation, unreadable file) shows a plain alert() and returns
  // without writing anything.
  function handleImportFile(file) {
    if (dbUnavailable) {
      window.alert('Import isn\'t available in this browser (IndexedDB is blocked or unsupported).');
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch (e) {
        window.alert('Import failed: this file is not valid JSON.');
        return;
      }
      var validation = validateImportedInspection(parsed);
      if (!validation.ok) {
        window.alert('Import failed: ' + validation.reason);
        return;
      }
      proceedWithImport(parsed);
    };
    reader.onerror = function () {
      window.alert('Import failed: could not read the selected file.');
    };
    reader.readAsText(file);
  }

  function proceedWithImport(parsed) {
    idbGetInspection(parsed.inspection.inspectionId).then(function (existing) {
      if (existing) {
        openImportChoiceModal(existing, parsed);
      } else {
        commitImport(parsed, parsed.inspection.inspectionId, false);
      }
    }).catch(function (e) {
      window.console && console.error && console.error('Clipboard-Flux: import lookup failed', e);
      window.alert('Import failed: ' + e.message);
    });
  }

  function openImportChoiceModal(existing, parsed) {
    renderChoiceModal({
      title: 'Inspection Already Exists',
      message: 'An inspection named "' + (existing.propertyAddress || '(no address)') +
        '" already exists locally. How should this import be handled?',
      choices: [
        {
          label: 'Replace Existing',
          action: function () {
            closeInspectionModal();
            commitImport(parsed, parsed.inspection.inspectionId, false);
          }
        },
        {
          label: 'Import as Copy',
          action: function () {
            closeInspectionModal();
            commitImport(parsed, generateInspectionId(), true);
          }
        },
        { label: 'Cancel', action: closeInspectionModal }
      ]
    });
  }

  // Writes the imported inspection's metadata + data records and makes
  // it active -- never touches the `photos` store (see the module
  // comment on externalPhotoManifest): imported photo metadata is
  // informational reference data only, carried on the inspectionData
  // record, never used to fabricate a Blob-less photo record that would
  // render as a broken thumbnail. `isCopy` controls both the target id
  // (a fresh one vs. the imported/existing id) and createdAt (a new
  // timestamp for a genuinely new local copy vs. preserving the
  // imported file's original createdAt when replacing/recreating that
  // exact inspection).
  function commitImport(parsed, targetId, isCopy) {
    var now = new Date().toISOString();
    var meta = {
      inspectionId: targetId,
      propertyAddress: parsed.inspection.propertyAddress || '',
      createdAt: isCopy ? now : (parsed.inspection.createdAt || now),
      updatedAt: now
    };
    var data = {
      inspectionId: targetId,
      values: parsed.values || {},
      disregarded: parsed.disregarded || {},
      otherText: parsed.otherText || {},
      fieldNotes: parsed.fieldNotes || {},
      externalPhotoManifest: Array.isArray(parsed.photos) ? parsed.photos : [],
      // Milestone 22: sanitizeFootprint() drops any individual malformed
      // stroke and falls back to an empty document if `footprint` itself
      // is missing/malformed -- an imported file's drawing is never
      // trusted blindly, same posture as every other imported field.
      footprint: sanitizeFootprint(parsed.footprint),
      // Milestone 22.3 #21: deliberately always null here, regardless of
      // what `parsed.reference` contains -- the export only ever wrote
      // lightweight metadata, never the image Blob, so there is no
      // actual sketch to restore. Resurrecting `footprintReference` from
      // this metadata alone would be exactly the "JSON record that
      // pretends the reference image exists when the actual Blob is
      // absent" #21 explicitly forbids -- the user re-imports the
      // reference file itself if they want it back on this inspection.
      reference: null,
      // Milestone 22.4 #24: unlike `reference`, notes has no Blob to lose
      // -- sanitizeNotes() already drops anything malformed, so it's
      // safe to fully restore both typed text and hand strokes from an
      // imported file. #25: a file with no `notes` property at all
      // (pre-0.22.4) falls through sanitizeNotes(undefined) to a blank
      // default, never a failed import.
      notes: sanitizeNotes(parsed.notes)
    };
    idbPutInspection(meta)
      .then(function () { return idbPutInspectionData(data); })
      .then(function () { return switchToInspection(targetId); })
      .then(function () { render(); })
      .catch(function (e) {
        window.console && console.error && console.error('Clipboard-Flux: import write failed', e);
        window.alert('Import failed while writing to storage: ' + e.message);
      });
  }

  // ---- PDF export (Milestone 17) ----
  //
  // Same technique clipboard-test already uses (confirmed by reading it
  // read-only before starting this milestone, per instructions): a
  // printable HTML document + the browser's native print-to-PDF
  // (window.print()), never a PDF-generating library -- no new
  // dependency to justify, and it's the one approach that's reliably
  // available on Windows Chrome, iPad/iPhone Safari, and Android Chrome
  // without a backend. This is a fresh implementation, not a port --
  // clipboard-test's own release notes documented that an earlier
  // CSS `column-count` two-column layout's "full-width escape hatch
  // never actually fired" (long values got squeezed and wrapped instead
  // of spanning both columns), and that reduced page count only
  // marginally even after being replaced with a CSS Grid two-column
  // layout. This implementation goes straight to the CSS Grid approach
  // (`pdfRowHtml()`) for the same reason they ended up there, and keeps
  // every full-width-worthy item (LongText, notes, Other-text, photos)
  // on its own natural full-width row from the start.
  //
  // All pdf*() model-building functions below are deliberately pure and
  // parameterized (values/disregarded/otherText/fieldNotes passed in
  // explicitly, never reading the live module-level values/disregarded/
  // etc.) -- a PDF must be able to represent an arbitrary saved
  // snapshot (in particular "Export Last Saved" while the working draft
  // is dirty), not just whatever's currently on screen. They mirror the
  // shape of the live isFollowUpGroupActive()/activeFollowUpGroups()/
  // isShowWhenSatisfied()/exitInterviewQuestions() functions exactly,
  // just parameterized instead of closing over module state -- kept as
  // small, obviously-equivalent duplicates rather than refactoring the
  // heavily-exercised live versions to take parameters, which would
  // touch tested Milestone 7-15 code for no behavioral benefit.

  var PDF_LONG_VALUE_THRESHOLD = 40;

  function pdfHasAnswer(values, id) {
    if (!Object.prototype.hasOwnProperty.call(values, id)) return false;
    var v = values[id];
    if (v === null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'number') return true;
    return String(v).trim() !== '';
  }

  // "Exterior Walls: Other — Precast panels" -- the Other option's own
  // supplemental text is folded into the same value string (never
  // printed as if it were its own unrelated field), for both Button
  // (single Other answer) and MultiSelect/MultiSelect Dropdown (Other
  // coexisting with other selections). Always prints the full selected
  // set as plain text, joined by commas -- never the Dropdown's
  // collapsed "+N" screen summary, since that's purely a compact-UI
  // affordance with no bearing on the printed report.
  function pdfFieldValueText(f, values, otherText) {
    var v = values[f.id];
    if (isMultiSelectInputType(f.type)) {
      var arr = Array.isArray(v) ? v : [];
      var text = arr.join(', ');
      if (arr.indexOf(OTHER_OPTION) !== -1 && otherText[f.id]) {
        text += ' — ' + otherText[f.id];
      }
      return text;
    }
    if (f.type === 'Button' && v === OTHER_OPTION && otherText[f.id]) {
      return String(v) + ' — ' + otherText[f.id];
    }
    return String(v);
  }

  // One field's printable {html, fullWidth}. LongText always spans full
  // width; any other type spans full width too once its rendered value
  // text passes PDF_LONG_VALUE_THRESHOLD, so an unusually long Button/
  // MultiSelect/Text/Currency answer never gets squeezed into a half
  // column -- the exact defect clipboard-test's own release notes
  // documented and moved away from. A field's Note (More Text) always
  // renders directly beneath its value, inside the same cell/row, per
  // this milestone's "Roof Condition: Average / Note: ..." example.
  function pdfFieldPairHtml(f, values, otherText, fieldNotes) {
    var valueText = pdfFieldValueText(f, values, otherText);
    var noteText = fieldNotes[f.id];
    var isLong = f.type === 'LongText' || valueText.length > PDF_LONG_VALUE_THRESHOLD;
    var html = '<div class="pdf-field-label">' + esc(f.label) + '</div>' +
      '<div class="pdf-field-value">' + esc(valueText) + '</div>' +
      ((noteText && String(noteText).trim())
        ? '<div class="pdf-field-note">Note: ' + esc(noteText) + '</div>'
        : '');
    return { html: html, fullWidth: isLong };
  }

  // Pure mirrors of activeSourceFieldsForGroup()/isFollowUpGroupActive()/
  // activeFollowUpGroups()/findFollowUpGroup()/isShowWhenSatisfied() --
  // see this section's header comment for why these are separate,
  // parameterized copies rather than reusing the live versions directly.
  // Milestone 22.4.4: this had drifted out of sync with the live
  // activeSourceFieldsForGroup() -- the Milestone 22.4.3 fix for
  // MultiSelect-typed trigger fields (an array value activates the
  // group if *any* selected option matches a trigger value, not by
  // reference-equality against the whole array) only touched the live
  // version, so a MultiSelect/MultiSelect Dropdown trigger correctly
  // activated its group on screen but the PDF export's own "pure
  // mirror" copy still used the old scalar-only check and silently
  // omitted that group's content from the printed report.
  //
  // Milestone 22.4.5: both this and the live version now call the one
  // shared matchesConfiguredValues() helper instead of each keeping
  // their own array/scalar branch -- the exact duplication that caused
  // the 0.22.4.4 drift in the first place. Same helper also fixes
  // Counter's number-vs-string trigger mismatch here, for free.
  function pdfActiveSourceFieldsForGroup(groupName, values) {
    return CFG.main.fields.filter(function (f) {
      return f.followUpGroup === groupName && matchesConfiguredValues(values[f.id], f.followUpTrigger);
    });
  }

  function pdfIsFollowUpGroupActive(groupName, values) {
    return pdfActiveSourceFieldsForGroup(groupName, values).length > 0;
  }

  function pdfActiveFollowUpGroups(values) {
    var seen = {};
    var names = [];
    CFG.main.fields.forEach(function (f) {
      if (f.followUpGroup && !seen[f.followUpGroup]) {
        seen[f.followUpGroup] = true;
        names.push(f.followUpGroup);
      }
    });
    return names.filter(function (g) { return pdfIsFollowUpGroupActive(g, values); });
  }

  function pdfFindFollowUpGroup(groupName) {
    var groups = (CFG.followUp && CFG.followUp.groups) || [];
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].group === groupName) return groups[i];
    }
    return null;
  }

  // Milestone 22.4.5: was scalar-only (`q.showWhenValue.indexOf(values[...])`),
  // same bug class as the pdfActiveSourceFieldsForGroup() drift above --
  // an array-valued (MultiSelect/MultiSelect Dropdown) SHOW WHEN parent
  // would never satisfy the condition. Now shares matchesConfiguredValues()
  // with the live isShowWhenSatisfied(), so the two can't drift.
  function pdfIsShowWhenSatisfied(q, values) {
    if (q.showWhenInvalid) return false;
    if (!q.showWhenQuestionId) return true;
    return matchesConfiguredValues(values[q.showWhenQuestionId], q.showWhenValue);
  }

  // Packs a flat list of {html, fullWidth} pairs into CSS Grid rows --
  // two short pairs share one `.pdf-row` (grid-template-columns:1fr 1fr),
  // a full-width pair gets its own `.pdf-row-full` row, and a leftover
  // odd short pair renders alone (still inside a 2-col row, so its
  // column alignment matches every other row) rather than being forced
  // to pair with unrelated content. Deliberately row-by-row (grid), not
  // CSS multi-column (`column-count`) -- see this section's header
  // comment: clipboard-test tried multi-column first and moved away
  // from it because the full-width escape hatch didn't reliably work,
  // and per-row `break-inside:avoid` on ordinary block-flow rows is
  // also simply more predictable for print pagination than a
  // multi-column balancing algorithm.
  function pdfRowsHtml(pairs) {
    var rows = [];
    var pending = null;
    pairs.forEach(function (p) {
      if (p.fullWidth) {
        if (pending) { rows.push(pdfRowHtml([pending])); pending = null; }
        rows.push(pdfRowHtml([p], true));
      } else if (pending) {
        rows.push(pdfRowHtml([pending, p]));
        pending = null;
      } else {
        pending = p;
      }
    });
    if (pending) rows.push(pdfRowHtml([pending]));
    return rows.join('');
  }

  function pdfRowHtml(cells, fullWidth) {
    if (fullWidth) {
      return '<div class="pdf-row pdf-row-full">' + cells[0].html + '</div>';
    }
    var html = cells.map(function (c) { return '<div class="pdf-cell">' + c.html + '</div>'; }).join('');
    if (cells.length === 1) html += '<div class="pdf-cell pdf-cell-empty"></div>';
    return '<div class="pdf-row">' + html + '</div>';
  }

  // One TAB's worth of answered MAIN fields, in workbook order, plus any
  // Dynamic FOLLOW_UP groups triggered by a field in this tab -- printed
  // as their own full-width subsection (heading + two-column rows for
  // that group's own answered questions) right after the tab's MAIN
  // content, preserving "MAIN answer, then its own follow-up" order
  // within the section. `printedGroups` is shared across every tab (see
  // pdfBuildMainSectionsHtml()) so a group triggered by fields on two
  // different tabs still prints exactly once, under whichever tab its
  // first trigger field (in workbook order) belongs to -- the same
  // "first active source" convention fieldHtml()'s live Dynamic
  // placement already uses.
  function pdfBuildTabSectionHtml(tabName, values, otherText, fieldNotes, printedGroups) {
    var fields = CFG.main.fields.filter(function (f) { return f.tab === tabName; });
    var pairs = [];
    var dynamicHtml = '';
    fields.forEach(function (f) {
      if (pdfHasAnswer(values, f.id)) {
        pairs.push(pdfFieldPairHtml(f, values, otherText, fieldNotes));
      }
      if (f.followUpGroup && !printedGroups[f.followUpGroup] &&
          pdfIsFollowUpGroupActive(f.followUpGroup, values)) {
        printedGroups[f.followUpGroup] = true;
        var group = pdfFindFollowUpGroup(f.followUpGroup);
        var qs = group ? group.questions.filter(function (q) {
          return q.destination === 'Dynamic' && pdfIsShowWhenSatisfied(q, values) && pdfHasAnswer(values, q.id);
        }) : [];
        if (qs.length) {
          var qPairs = qs.map(function (q) { return pdfFieldPairHtml(q, values, otherText, fieldNotes); });
          dynamicHtml += '<div class="pdf-subsection">' +
            '<div class="pdf-subsection-heading">' + esc(humanizeGroupName(f.followUpGroup)) + '</div>' +
            pdfRowsHtml(qPairs) +
            '</div>';
        }
      }
    });
    if (!pairs.length && !dynamicHtml) return '';
    return '<div class="pdf-section">' +
      '<div class="pdf-section-heading">' + esc(tabName.toUpperCase()) + '</div>' +
      pdfRowsHtml(pairs) +
      dynamicHtml +
      '</div>';
  }

  function pdfBuildMainSectionsHtml(values, otherText, fieldNotes) {
    var printedGroups = {};
    return CFG.main.tabs.map(function (tabName) {
      return pdfBuildTabSectionHtml(tabName, values, otherText, fieldNotes, printedGroups);
    }).join('');
  }

  // Exit Interview groups that are active but Disregarded are excluded
  // entirely, by default, per this milestone's explicit instruction --
  // no "Disregarded" label, the group simply doesn't print, exactly as
  // it already doesn't render on the live Exit Interview tab.
  function pdfBuildExitInterviewSectionHtml(values, disregarded, otherText, fieldNotes) {
    var groupsHtml = pdfActiveFollowUpGroups(values)
      .filter(function (g) { return !disregarded[g]; })
      .map(function (groupName) {
        var group = pdfFindFollowUpGroup(groupName);
        var qs = group ? group.questions.filter(function (q) {
          return q.destination === 'Exit Interview' && pdfIsShowWhenSatisfied(q, values) && pdfHasAnswer(values, q.id);
        }) : [];
        if (!qs.length) return '';
        var qPairs = qs.map(function (q) { return pdfFieldPairHtml(q, values, otherText, fieldNotes); });
        return '<div class="pdf-subsection">' +
          '<div class="pdf-subsection-heading">' + esc(humanizeGroupName(groupName)) + '</div>' +
          pdfRowsHtml(qPairs) +
          '</div>';
      }).join('');
    if (!groupsHtml) return '';
    return '<div class="pdf-section">' +
      '<div class="pdf-section-heading">EXIT INTERVIEW</div>' +
      groupsHtml +
      '</div>';
  }

  // Looks a field/question id up by id across both MAIN fields and every
  // FOLLOW_UP question -- a photo's fieldId is always one or the other.
  // Shared by the PDF's field-photo captions (Milestone 17), the Photos
  // tab's "From: <field>" source note (Milestone 21.1), and the
  // MultiSelect Dropdown sheet (Milestone 22.4.4, which can be opened
  // from a Dynamic or Exit Interview FOLLOW_UP question just as easily
  // as a MAIN field) -- one resolver, so every surface agrees on a
  // field's identity and an orphaned/legacy fieldId degrades the same
  // safe way (null, never a thrown error) everywhere.
  function findFieldOrQuestionById(fieldId) {
    var f = CFG.main.fields.filter(function (x) { return x.id === fieldId; })[0];
    if (f) return f;
    var groups = (CFG.followUp && CFG.followUp.groups) || [];
    for (var i = 0; i < groups.length; i++) {
      var q = groups[i].questions.filter(function (x) { return x.id === fieldId; })[0];
      if (q) return q;
    }
    return null;
  }

  function fieldLabelById(fieldId) {
    var f = findFieldOrQuestionById(fieldId);
    return f ? f.label : null;
  }

  // Caption priority per this milestone's spec: (1) a user-entered photo
  // label, if the data model ever has one -- it doesn't yet (photo
  // captions/annotation are explicitly out of scope through Milestone
  // 17), so `p.label` is always undefined today, but checking it costs
  // nothing and means a future captions milestone doesn't have to touch
  // this function; (2) the photo's field's own human-readable label;
  // (3) "Unassigned Photo" if the fieldId doesn't resolve to anything
  // (an orphaned/corrupted record) -- never a raw photo id or field id.
  function pdfPhotoCaption(p) {
    if (p.label && String(p.label).trim()) return p.label;
    return fieldLabelById(p.fieldId) || 'Unassigned Photo';
  }

  // fieldIds belonging to an active-but-Disregarded Exit Interview
  // group -- photos attached to those fields are excluded from the
  // Photos section too, for the same reason and by the same rule as the
  // text sections above (a Disregarded group's photos would otherwise
  // inconsistently still appear even though its answers don't).
  function pdfDisregardedFieldIds(values, disregarded) {
    var ids = {};
    var groups = (CFG.followUp && CFG.followUp.groups) || [];
    groups.forEach(function (group) {
      if (disregarded[group.group] && pdfIsFollowUpGroupActive(group.group, values)) {
        group.questions.forEach(function (q) {
          if (q.destination === 'Exit Interview') ids[q.id] = true;
        });
      }
    });
    return ids;
  }

  // Workbook order (MAIN fields by tab, then FOLLOW_UP questions by
  // group), filtered down to only the fieldIds that actually have a
  // photo -- "preserve logical field order from the workbook" extended
  // to how the Photos section groups its content, same as the text
  // sections. Any fieldId that doesn't match a known field at all
  // (orphaned data) is still included, appended at the end, so a photo
  // is never silently dropped just because its field can't be found --
  // it prints under "Unassigned Photo" instead (see pdfPhotoCaption()).
  function pdfOrderedFieldIdsWithPhotos(photoRecords) {
    var hasPhoto = {};
    photoRecords.forEach(function (p) { hasPhoto[p.fieldId] = true; });
    var ordered = [];
    var seen = {};
    CFG.main.fields.forEach(function (f) {
      if (hasPhoto[f.id] && !seen[f.id]) { seen[f.id] = true; ordered.push(f.id); }
    });
    var groups = (CFG.followUp && CFG.followUp.groups) || [];
    groups.forEach(function (group) {
      group.questions.forEach(function (q) {
        if (hasPhoto[q.id] && !seen[q.id]) { seen[q.id] = true; ordered.push(q.id); }
      });
    });
    Object.keys(hasPhoto).forEach(function (fid) {
      if (!seen[fid]) { seen[fid] = true; ordered.push(fid); }
    });
    return ordered;
  }

  // Each photo appears exactly once, in exactly one field group, within
  // this one Photos section -- no per-field inline photos elsewhere in
  // the document, which is what actually guarantees "do not duplicate
  // the same photo in multiple PDF sections" (there's simply nowhere
  // else a photo is ever rendered from). 2 photos per row
  // (.pdf-photo-grid), aspect ratio preserved via object-fit:contain
  // (never stretched/distorted), each image+caption pair kept together
  // across a page break (`.pdf-photo-item{break-inside:avoid}`) --
  // the *group* itself is deliberately allowed to break across pages
  // (no break-inside:avoid on `.pdf-photo-group`), since forcing an
  // entire multi-photo group onto one page is exactly the kind of large
  // avoidable gap this milestone's layout rules call out.
  function pdfBuildPhotosSectionHtml(photoRecords, values, disregarded) {
    var excluded = pdfDisregardedFieldIds(values, disregarded);
    // Milestone 21: defensively excludes general photos (fieldId null)
    // even though buildPrintDocumentHtml() already only ever passes this
    // function field photos -- see pdfBuildGeneralPhotosSectionHtml()
    // for the separate general-photo section.
    var visible = photoRecords.filter(function (p) { return p.fieldId != null && !excluded[p.fieldId]; });
    if (!visible.length) return '';
    var byField = {};
    visible.forEach(function (p) {
      if (!byField[p.fieldId]) byField[p.fieldId] = [];
      byField[p.fieldId].push(p);
    });
    var groupsHtml = pdfOrderedFieldIdsWithPhotos(visible).map(function (fieldId) {
      var photos = byField[fieldId].slice().sort(function (a, b) { return a.order - b.order; });
      var label = fieldLabelById(fieldId) || 'Unassigned Photo';
      var itemsHtml = photos.map(function (p) {
        return '<div class="pdf-photo-item">' +
          '<img src="' + esc(p.objectUrl) + '" alt="">' +
          '<div class="pdf-photo-caption">' + esc(pdfPhotoCaption(p)) + '</div>' +
          '</div>';
      }).join('');
      return '<div class="pdf-photo-group">' +
        '<div class="pdf-photo-group-heading">' + esc(label) + '</div>' +
        '<div class="pdf-photo-grid">' + itemsHtml + '</div>' +
        '</div>';
    }).join('');
    return '<div class="pdf-section pdf-photos-section">' +
      '<div class="pdf-section-heading">PHOTOS</div>' +
      groupsHtml +
      '</div>';
  }

  // Milestone 21: general (report/documentation, fieldId null) photos,
  // as their own trailing section -- deliberately a separate heading
  // ("GENERAL PHOTOS") from the field-photo PHOTOS section above rather
  // than merged into it, since they're grouped by a completely different
  // axis (workbook PHOTO LABELS category/label, not MAIN/FOLLOW_UP field
  // order) and mixing the two under one heading would blur a real
  // distinction (Milestone 21 #14) rather than just declutter the
  // document. Reuses the exact same .pdf-subsection/.pdf-photo-group/
  // .pdf-photo-grid CSS the field-photo section already established --
  // no new PDF styling for this milestone. Categories render in
  // CFG.photoLabels' own workbook order, labels within a category in
  // their own workbook order, and Unassigned -- deliberately never
  // silently dropped, per #6/#13 -- always last if any exist. A photo
  // with no label displays its original filename as a caption so
  // multiple Unassigned photos in the same PDF are still distinguishable
  // from each other, without printing an internal photo id.
  function pdfBuildGeneralPhotosSectionHtml(generalPhotoRecords) {
    if (!generalPhotoRecords.length) return '';
    var byKey = {};
    generalPhotoRecords.forEach(function (p) {
      var key = p.label ? (p.category + ' ' + p.label) : '';
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(p);
    });
    var subsectionsHtml = '';
    (CFG.photoLabels.categories || []).forEach(function (cat) {
      var groupsHtml = '';
      CFG.photoLabels.labels.filter(function (l) { return l.category === cat; }).forEach(function (l) {
        var photos = byKey[cat + ' ' + l.label];
        if (!photos || !photos.length) return;
        groupsHtml += pdfGeneralPhotoGroupHtml(l.label, photos, false);
      });
      if (groupsHtml) {
        subsectionsHtml += '<div class="pdf-subsection">' +
          '<div class="pdf-subsection-heading">' + esc(cat) + '</div>' +
          groupsHtml +
          '</div>';
      }
    });
    var unassigned = byKey[''];
    if (unassigned && unassigned.length) {
      subsectionsHtml += '<div class="pdf-subsection">' +
        '<div class="pdf-subsection-heading">Unassigned</div>' +
        pdfGeneralPhotoGroupHtml(null, unassigned, true) +
        '</div>';
    }
    if (!subsectionsHtml) return '';
    return '<div class="pdf-section pdf-photos-section">' +
      '<div class="pdf-section-heading">GENERAL PHOTOS</div>' +
      subsectionsHtml +
      '</div>';
  }

  // One label's (or, for Unassigned, one flat list's) photo grid, sorted
  // by capture/import order. `captionByFilename` is only true for the
  // Unassigned group -- a labeled group's own heading already says the
  // label, so per-photo captions there would just repeat it.
  function pdfGeneralPhotoGroupHtml(label, photos, captionByFilename) {
    var sorted = photos.slice().sort(function (a, b) { return a.order - b.order; });
    var itemsHtml = sorted.map(function (p) {
      var caption = captionByFilename ? (p.originalFileName || 'Unassigned') : '';
      return '<div class="pdf-photo-item">' +
        '<img src="' + esc(p.objectUrl) + '" alt="">' +
        (caption ? '<div class="pdf-photo-caption">' + esc(caption) + '</div>' : '') +
        '</div>';
    }).join('');
    return '<div class="pdf-photo-group">' +
      (label ? '<div class="pdf-photo-group-heading">' + esc(label) + '</div>' : '') +
      '<div class="pdf-photo-grid">' + itemsHtml + '</div>' +
      '</div>';
  }

  // Letter portrait, compact margins, dense-but-legible type -- see this
  // section's header comment for why CSS Grid rows (not multi-column)
  // back the two-column layout. True "Page X of Y" numbering is
  // deliberately NOT attempted here: browsers' print engines don't
  // expose printed-page-count to page content at all (CSS Paged Media's
  // @page margin-box `counter(pages)` is not implemented by Chrome or
  // Safari's print pipelines), so faking it would just be wrong output
  // dressed up to look like it works. `document.title` is set to the
  // desired filename instead (see buildPdfFilenameBase()) since that's
  // the one lever browsers' native print-to-PDF actually honors for the
  // suggested save filename, and Chrome's own optional "Headers and
  // footers" print-dialog setting already adds real page numbers/title/
  // date if the user enables it -- a native capability, not something
  // this document needs to reimplement.
  var PDF_PRINT_CSS =
    '@page{size:letter portrait;margin:0.5in 0.6in}' +
    '*{box-sizing:border-box}' +
    'body{margin:0;font-family:Arial,Helvetica,sans-serif;font-size:9.5pt;color:#1a2733;line-height:1.35}' +
    '.pdf-header{border-bottom:2px solid #17324d;padding-bottom:8px;margin-bottom:14px}' +
    '.pdf-header-title{font-size:16pt;font-weight:800;color:#17324d}' +
    '.pdf-header-address{font-size:12pt;font-weight:700;margin-top:2px}' +
    '.pdf-header-meta{font-size:8.5pt;color:#66727e;margin-top:3px}' +
    '.pdf-section{margin-bottom:14px}' +
    '.pdf-section-heading{font-size:11pt;font-weight:800;color:#fff;background:#17324d;padding:4px 8px;' +
      'margin-bottom:6px;break-after:avoid;page-break-after:avoid;letter-spacing:.03em}' +
    '.pdf-subsection{margin:8px 0}' +
    '.pdf-subsection-heading{font-size:9.5pt;font-weight:800;color:#17324d;border-bottom:1px solid #d9e0e6;' +
      'padding-bottom:2px;margin-bottom:5px;break-after:avoid;page-break-after:avoid}' +
    '.pdf-row{display:grid;grid-template-columns:1fr 1fr;gap:0 16px;break-inside:avoid;' +
      'page-break-inside:avoid;margin-bottom:4px}' +
    '.pdf-row-full{display:block}' +
    '.pdf-cell{min-width:0}' +
    '.pdf-field-label{font-weight:700;font-size:8.5pt;color:#66727e}' +
    '.pdf-field-value{font-size:9.5pt;margin-top:1px;word-wrap:break-word}' +
    '.pdf-field-note{font-size:8.5pt;font-style:italic;color:#4a5660;margin-top:2px}' +
    '.pdf-photos-section .pdf-section-heading{margin-bottom:8px}' +
    '.pdf-photo-group{margin-bottom:10px}' +
    '.pdf-photo-group-heading{font-size:9pt;font-weight:700;color:#17324d;margin-bottom:4px;' +
      'break-after:avoid;page-break-after:avoid}' +
    '.pdf-photo-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
    '.pdf-photo-item{break-inside:avoid;page-break-inside:avoid;border:1px solid #d9e0e6;' +
      'border-radius:4px;padding:4px;text-align:center}' +
    '.pdf-photo-item img{width:100%;max-height:2.6in;object-fit:contain;display:block}' +
    '.pdf-photo-caption{font-size:8pt;color:#4a5660;margin-top:3px}' +
    '.pdf-footprint-image{width:100%;max-height:8.5in;object-fit:contain;display:block;' +
      'border:1px solid #d9e0e6;border-radius:4px}' +
    '.pdf-notes-text{font-size:9.5pt;white-space:pre-wrap;word-wrap:break-word}' +
    '.pdf-notes-hand-image{width:100%;display:block;border:1px solid #d9e0e6;border-radius:4px;margin-bottom:8px}' +
    '.pdf-notes-hand-page-break{break-after:page;page-break-after:always}' +
    '.pdf-empty-note{font-size:10pt;color:#66727e;font-style:italic}' +
    '.pdf-footer-note{margin-top:16px;padding-top:6px;border-top:1px solid #d9e0e6;font-size:7pt;color:#9aa5ad}';

  // Milestone 22 #24: full-bounds Footprint PDF export -- computed from
  // the drawing's own stroke geometry, never the live on-screen viewport
  // (footprintView is never read anywhere in this section), so a sketch
  // panned/zoomed to show only one corner on screen still exports
  // completely. Rendered onto a fresh offscreen canvas the same way
  // clipboard-test's own Footprint prototype does (confirmed read-only
  // before this milestone): rasterized to a PNG and embedded as a plain
  // `<img>`, exactly like every field/general photo in this same PDF
  // already is -- this print pipeline is HTML+CSS-based
  // (window.print()), not a vector PDF generator, so a raster image is
  // the correct, already-established mechanism here, not a compromise.
  // The grid is never part of this render (drawFootprintGrid() is simply
  // never called in this path) -- excluded from export by default, #17.
  var FOOTPRINT_EXPORT_TARGET_LONG_EDGE = 1600;
  var FOOTPRINT_EXPORT_PADDING_RATIO = 0.08;

  function footprintComputeBounds(strokes) {
    if (!strokes.length) return null;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    strokes.forEach(function (s) {
      var pts = s.type === 'line' ? [s.a, s.b] : s.points;
      pts.forEach(function (p) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });
    });
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  // Returns null when there's nothing to draw (#25 -- no empty Footprint
  // page/whitespace in the PDF). Reuses footprintDrawOneStroke() exactly
  // as the live canvas does, so a stroke's appearance in the PDF is
  // guaranteed consistent with how it looks on screen, not a
  // reimplementation that could quietly drift out of sync.
  function footprintRenderExportCanvas(footprintDoc) {
    var bounds = footprintComputeBounds(footprintDoc.strokes);
    if (!bounds) return null;
    var w = bounds.maxX - bounds.minX;
    var h = bounds.maxY - bounds.minY;
    var longEdge = Math.max(w, h, 1);
    var pad = Math.max(longEdge * FOOTPRINT_EXPORT_PADDING_RATIO, 10);
    var totalW = w + pad * 2, totalH = h + pad * 2;
    var scale = FOOTPRINT_EXPORT_TARGET_LONG_EDGE / Math.max(totalW, totalH);
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(totalW * scale));
    canvas.height = Math.max(1, Math.round(totalH * scale));
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate((pad - bounds.minX) * scale, (pad - bounds.minY) * scale);
    ctx.scale(scale, scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1c3a52';
    footprintDoc.strokes.forEach(function (s) { footprintDrawOneStroke(ctx, s); });
    return canvas;
  }

  function footprintExportImageBlob(footprintDoc) {
    var canvas = footprintRenderExportCanvas(footprintDoc);
    if (!canvas) return Promise.resolve(null);
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) { resolve(blob); }, 'image/png');
    });
  }

  function pdfBuildFootprintSectionHtml(footprintImageUrl) {
    if (!footprintImageUrl) return '';
    return '<div class="pdf-section pdf-footprint-section">' +
      '<div class="pdf-section-heading">FOOTPRINT</div>' +
      '<img class="pdf-footprint-image" src="' + esc(footprintImageUrl) + '" alt="">' +
      '</div>';
  }

  // Milestone 22.4 #22/#23: NOTES section -- typed text (line breaks
  // preserved via esc() then a literal <br> insertion, never raw
  // unescaped text) and/or a raster of the hand-note strokes, generated
  // fresh at export time from the same vector data the app itself draws
  // from (never a screenshot of the live canvas), so no toolbar/UI/
  // canvas chrome can ever leak into the PDF. Omitted entirely when
  // there's nothing to show, same "no empty section" convention
  // pdfBuildFootprintSectionHtml() already uses.
  // Milestone 22.4.2 (#21): `handImageUrls` is now an array (one per
  // paginated slice, see notesHandRenderExportPages()) rather than a
  // single image -- every slice but the last forces a page break right
  // after it (.pdf-notes-hand-page-break), so a long handwritten
  // document prints across as many physical pages as it actually needs
  // instead of being squashed onto one. The live Notes UI itself stays
  // completely continuous either way -- pagination is purely a PDF
  // rendering concern, never surfaced in the app (#21's explicit
  // requirement).
  function pdfBuildNotesSectionHtml(notesText, handImageUrls) {
    var hasText = !!(notesText && notesText.trim());
    var hasHand = handImageUrls && handImageUrls.length > 0;
    if (!hasText && !hasHand) return '';
    var textHtml = hasText
      ? '<div class="pdf-subsection">' +
          '<div class="pdf-subsection-heading">Inspection Notes</div>' +
          '<div class="pdf-notes-text">' + esc(notesText).replace(/\n/g, '<br>') + '</div>' +
        '</div>'
      : '';
    var handHtml = hasHand
      ? '<div class="pdf-subsection">' +
          '<div class="pdf-subsection-heading">Handwritten Notes</div>' +
          handImageUrls.map(function (url, i) {
            var breakClass = i < handImageUrls.length - 1 ? ' pdf-notes-hand-page-break' : '';
            return '<img class="pdf-notes-hand-image' + breakClass + '" src="' + esc(url) + '" alt="">';
          }).join('') +
        '</div>'
      : '';
    return '<div class="pdf-section pdf-notes-section">' +
      '<div class="pdf-section-heading">NOTES</div>' +
      textHtml + handHtml +
      '</div>';
  }

  function buildPdfFilenameBase(meta) {
    var base = sanitizeForFilename(meta.propertyAddress) || sanitizeForFilename(meta.inspectionId) || 'inspection';
    var now = new Date();
    var stamp = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
    return base + '_' + stamp + '_Inspection';
  }

  function buildPrintDocumentHtml(meta, data, photosWithUrls, footprintImageUrl, notesHandImageUrls) {
    var values = data.values || {};
    var disregarded = data.disregarded || {};
    var otherText = data.otherText || {};
    var fieldNotes = data.fieldNotes || {};
    var addr = meta.propertyAddress || '(no address)';
    var mainHtml = pdfBuildMainSectionsHtml(values, otherText, fieldNotes);
    var eiHtml = pdfBuildExitInterviewSectionHtml(values, disregarded, otherText, fieldNotes);
    // Milestone 21: photosWithUrls holds both field and general photos
    // (generatePdfExport() fetches everything for the inspection in one
    // read, same as it always has) -- split here, once, so each section
    // builder only ever sees its own kind.
    //
    // Milestone 21.1: a field-linked photo can now also carry a report
    // label (Photos-tab #4), so the split is no longer purely by
    // fieldId -- it's "has a report label" that decides where a photo
    // prints, never both. A labeled photo (field-linked or not) goes to
    // GENERAL PHOTOS, grouped by that label -- the more specific,
    // user-chosen fact wins over field-association, per #12's "prefer
    // report label grouping when one exists." An unlabeled field photo
    // still prints under PHOTOS, field-grouped, exactly as before. Every
    // photo lands in exactly one of these two filters (the label check
    // is identical, just negated), so no photo can ever print twice.
    var fieldPhotos = photosWithUrls.filter(function (p) { return p.fieldId != null && !(p.category && p.label); });
    var generalPhotosForPdf = photosWithUrls.filter(function (p) { return p.fieldId == null || (p.category && p.label); });
    var photosHtml = pdfBuildPhotosSectionHtml(fieldPhotos, values, disregarded);
    var generalPhotosHtml = pdfBuildGeneralPhotosSectionHtml(generalPhotosForPdf);
    var footprintHtml = pdfBuildFootprintSectionHtml(footprintImageUrl);
    var notesHtml = pdfBuildNotesSectionHtml(data.notes && data.notes.text, notesHandImageUrls);
    var bodyHtml = mainHtml + eiHtml + photosHtml + generalPhotosHtml + footprintHtml + notesHtml;
    if (!bodyHtml) {
      bodyHtml = '<div class="pdf-empty-note">No inspection content has been entered yet.</div>';
    }
    var exportedAt = new Date().toISOString();
    var titleBase = buildPdfFilenameBase(meta);
    return '<!doctype html><html><head><meta charset="utf-8">' +
      '<title>' + esc(titleBase) + '</title>' +
      '<style>' + PDF_PRINT_CSS + '</style>' +
      '</head><body>' +
      '<div class="pdf-header">' +
        '<div class="pdf-header-title">Clipboard-Flux Inspection</div>' +
        '<div class="pdf-header-address">' + esc(addr) + '</div>' +
        '<div class="pdf-header-meta">Created ' + esc(formatDate(meta.createdAt)) +
          ' &middot; Updated ' + esc(formatDate(meta.updatedAt)) +
          ' &middot; Exported ' + esc(formatDate(exportedAt)) + '</div>' +
      '</div>' +
      bodyHtml +
      '<div class="pdf-footer-note">Clipboard-Flux &middot; ' + esc(formatDate(exportedAt)) +
        ' &middot; ID: ' + esc(meta.inspectionId || '') + '</div>' +
      '</body></html>';
  }

  // Tears down the current print iframe (if any) and revokes the
  // full-resolution photo object URLs it was holding -- called both
  // defensively before starting a new export (so repeat exports, matrix
  // test #26, can never stack iframes) and after a print completes.
  // Safe to call when there's nothing to clean up.
  function cleanupPdfPrintIframe() {
    if (!pdfPrintIframe) return;
    (pdfPrintIframe.__objectUrls || []).forEach(function (u) { URL.revokeObjectURL(u); });
    if (pdfPrintIframe.parentNode) pdfPrintIframe.parentNode.removeChild(pdfPrintIframe);
    pdfPrintIframe = null;
  }

  // Milestone 19 #4/#5: prints the already-built document via a hidden
  // same-page <iframe> instead of a separate popup window -- see this
  // file's top comment for the mobile-hang diagnosis this replaces.
  // 0x0 and position:fixed, never display:none (some engines skip
  // rendering/printing display:none content entirely), so it's visually
  // imperceptible but still a real part of the page the print pipeline
  // can render from. Printed via iframe.contentWindow.print(), the
  // standard cross-browser technique for exactly this -- the native
  // print/share sheet then simply overlays the current page, and
  // Clipboard-Flux's own document/tab is never navigated away from, so
  // there is nothing for the user to need to "return" from. Cleanup
  // fires on `afterprint` (reliable on desktop) with a generous fallback
  // timer as a safety net for engines where it doesn't fire, exactly
  // like the print-content-load safety net below it -- not the primary
  // mechanism either way, so this isn't "blindly adding a delay" as the
  // fix itself.
  function printViaHiddenIframe(html, photosWithUrls, footprintImageUrl, notesHandImageUrls) {
    cleanupPdfPrintIframe();
    var iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    // Milestone 22: the Footprint export image's object URL (if any)
    // rides along in the exact same cleanup array as every photo's --
    // one list, one revoke pass, so a Footprint export can never leak an
    // object URL any more than a photo-heavy export already couldn't.
    // Milestone 22.4/22.4.2: every hand-notes page image's object URL
    // (now possibly several, one per paginated slice) joins the same
    // list, same reasoning.
    iframe.__objectUrls = photosWithUrls.map(function (p) { return p.objectUrl; });
    if (footprintImageUrl) iframe.__objectUrls.push(footprintImageUrl);
    if (notesHandImageUrls) iframe.__objectUrls = iframe.__objectUrls.concat(notesHandImageUrls);
    document.body.appendChild(iframe);
    pdfPrintIframe = iframe;

    var win = iframe.contentWindow;
    win.document.open();
    win.document.write(html);
    win.document.close();

    var printed = false;
    var doPrint = function () {
      if (printed) return;
      printed = true;
      win.focus();
      win.print();
      win.addEventListener('afterprint', function () { cleanupPdfPrintIframe(); });
      setTimeout(function () {
        // Fallback only -- if afterprint already ran, pdfPrintIframe is
        // already null and cleanupPdfPrintIframe() is a no-op.
        cleanupPdfPrintIframe();
      }, 60000);
    };
    iframe.onload = doPrint;
    setTimeout(doPrint, 2000);
  }

  // Builds and prints the PDF for `inspectionId` -- always reads fresh
  // from IndexedDB, same convention as exportInspectionJson(). Callers
  // are expected to have already flushed any pending autosave (see
  // handleExportPdfClick()) since there's no popup-timing constraint
  // left to work around -- printViaHiddenIframe() never needs to be
  // reached synchronously from the click the way window.open() once did.
  function generatePdfExport(inspectionId) {
    Promise.all([
      idbGetInspection(inspectionId),
      idbGetInspectionData(inspectionId),
      idbGetAllPhotosForInspection(inspectionId)
    ]).then(function (results) {
      var meta = results[0];
      var data = results[1];
      var photoRecords = results[2];
      if (!meta || !data) throw new Error('Inspection not found in storage.');
      // Full-resolution blob, never the thumbnail, per Milestone 17's
      // explicit instruction -- the thumbnail exists only for the fast
      // in-app photo strip.
      var photosWithUrls = photoRecords.map(function (p) {
        return {
          id: p.id,
          fieldId: p.fieldId,
          category: p.category || null,
          label: p.label || null,
          originalFileName: p.originalFileName || '',
          order: p.order,
          objectUrl: URL.createObjectURL(p.blob)
        };
      });
      // Milestone 22: rasterizing the full-bounds Footprint image is
      // itself async (canvas.toBlob()), so it's resolved here before
      // building the printable document -- buildPrintDocumentHtml()
      // stays synchronous otherwise, same as every other section.
      // Milestone 22.4/22.4.2: the hand-notes pages are the exact same
      // kind of async rasterization (now possibly several images, one
      // per paginated slice), resolved alongside the Footprint image via
      // Promise.all rather than chained serially -- the two exports are
      // independent of each other, so there's no reason to wait on one
      // before starting the other.
      return Promise.all([
        footprintExportImageBlob(sanitizeFootprint(data.footprint)),
        notesHandExportImagePages(sanitizeNotes(data.notes).hand)
      ]).then(function (results) {
        var footprintImageUrl = results[0] ? URL.createObjectURL(results[0]) : null;
        var notesHandImageUrls = results[1].map(function (blob) { return URL.createObjectURL(blob); });
        var html = buildPrintDocumentHtml(meta, data, photosWithUrls, footprintImageUrl, notesHandImageUrls);
        printViaHiddenIframe(html, photosWithUrls, footprintImageUrl, notesHandImageUrls);
      });
    }).catch(function (e) {
      window.console && console.error && console.error('Clipboard-Flux: PDF export failed', e);
      window.alert('Could not generate the PDF: ' + e.message);
    });
  }

  // Symmetric with handleExportInspectionClick() now that PDF export no
  // longer needs to open anything synchronously with the click (see
  // printViaHiddenIframe()) -- flush any pending autosave first, then
  // generate. If the flush itself fails, still export -- the last
  // successfully saved snapshot is better than no export at all, and the
  // failure is already visible via the 'Save failed' status.
  function handleExportPdfClick() {
    if (dbUnavailable) {
      window.alert('PDF export isn\'t available in this browser (IndexedDB is blocked or unsupported).');
      return;
    }
    if (!ensureBootReadyForAction('export')) return;
    var id = activeInspection.inspectionId;
    flushPendingSave().then(function () {
      generatePdfExport(id);
    }, function (e) {
      window.console && console.error && console.error('Clipboard-Flux: could not save latest changes before PDF export', e);
      window.alert('Could not save your latest changes (' + e.message + '). Exporting the last successfully saved version instead.');
      generatePdfExport(id);
    });
  }

  // Compact, always-visible strip showing which inspection is active
  // (address, truncated by CSS rather than JS) and the current save
  // status word -- no buttons here any more (Milestone 18 #5 moved all
  // of New/Save/Load/Reset/Export into the Inspection tab, see
  // renderInspectionTabHtml()). Lives outside #screen (its own
  // #inspection-bar element) specifically so setSaveStatus() can redraw
  // just this on every keystroke without ever touching a focused field
  // input elsewhere on the page. Called both from here directly (the
  // fast, focus-safe path) and from the bottom of the main render() (so
  // a full re-render, e.g. after Load/tab switch, always reflects the
  // current activeInspection too).
  // Milestone 22.4.1: the one place that turns bootState + activeInspection
  // into what the user actually sees for "which inspection is this" --
  // used by both renderInspectionBar() and renderInspectionTabHtml() so
  // they can never disagree. 'restoring' always shows "Loading…" (the
  // truthful, still-in-progress state, never conflated with "no
  // inspection" the way a bare `activeInspection` null-check used to);
  // 'error' with no activeInspection yet (the blocked-storage case, see
  // bootState's own comment -- no pseudo-inspection was fabricated) shows
  // the specific bootErrorMessage instead of a misleading address; every
  // other case (ready, or error with the pre-existing degraded pseudo-
  // inspection) shows the real address exactly as before this milestone.
  function inspectionAddressLabel() {
    if (bootState === 'restoring') return 'Loading…';
    if (bootState === 'error' && !activeInspection) return bootErrorMessage || 'Inspection could not be restored.';
    return activeInspection ? (activeInspection.propertyAddress || '(no address)') : 'Loading…';
  }

  function renderInspectionBar() {
    var el = document.getElementById('inspection-bar');
    if (!el) return;
    var addr = inspectionAddressLabel();
    var addrErrorClass = (bootState === 'error' && !activeInspection) ? ' error' : '';
    var statusHtml = '<span class="save-status save-status-' + saveStatus + '">' + esc(saveStatusLabel()) + '</span>';
    var warningHtml = dbUnavailable
      ? '<div class="shell-note error">Inspection save/load isn\'t available in this browser ' +
        '(IndexedDB is blocked or unsupported) -- changes will only last for this session.</div>'
      : '';
    el.innerHTML =
      '<div class="inspection-bar-row">' +
        '<span class="inspection-address' + addrErrorClass + '">' + esc(addr) + '</span>' +
        statusHtml +
      '</div>' + warningHtml;
  }

  // ---- Photos tab (Milestone 21, unified Milestone 21.1) ----
  //
  // "Capture first. Organize later." -- Photo Library and Take Photo are
  // the two most prominent controls on this tab (same two-button pattern
  // every per-field photo panel already uses, see photoPanelHtml()), and
  // neither auto-launches or forces a label. A freshly captured/imported
  // general photo is Unassigned (category/label both null) until the
  // appraiser deliberately assigns one from the picker on its thumbnail.
  //
  // Below the capture buttons: a compact checklist (one line per
  // workbook PHOTO LABELS row, grouped by category, in workbook order,
  // Field Photos and Unassigned always last) showing a live count per
  // label -- and below that, the review list (Milestone 21.1: every
  // photo in the inspection, field-linked and general alike -- see
  // renderPhotoReviewListHtml()). Reassigning a label never moves a
  // photo within its own grid row order (only its caption/count/section
  // changes), so tapping a picker never makes the item you just touched
  // jump somewhere unexpected.

  // Milestone 21.1: a photo counts toward a category+label pair the
  // moment both are set, regardless of whether it's also field-linked
  // (#6 -- "count photos assigned that label regardless of whether they
  // are also linked to a field"); toward Field Photos if it's
  // field-linked and still has no report label; toward Unassigned only
  // if it's neither. Every photo in allPhotoCacheEntries() matches
  // exactly one of these three checks, so the three counts (plus the
  // per-label counts, which are mutually exclusive with each other by
  // definition) can never double-count or drop a photo. These, plus
  // generalPhotoLabelSelectHtml()'s own "current selection" check, are
  // the single source of truth the checklist and the picker both read
  // from, so they can never drift out of sync with each other.
  function photoCountForLabel(category, label) {
    return allPhotoCacheEntries().filter(function (p) { return p.category === category && p.label === label; }).length;
  }

  function fieldPhotoNoLabelCount() {
    return allPhotoCacheEntries().filter(function (p) { return p.fieldId != null && !(p.category && p.label); }).length;
  }

  function unassignedPhotoCount() {
    return allPhotoCacheEntries().filter(function (p) { return p.fieldId == null && !(p.category && p.label); }).length;
  }

  // Compact checklist -- Milestone 21 #7's worked example, extended by
  // Milestone 21.1 #6 with a Field Photos row (field-linked photos that
  // don't yet have a report label) ahead of Unassigned. Zero-count rows
  // get a muted class (`.photo-checklist-row` alone) so they stay
  // legible but never visually compete with rows that actually have
  // photos (`.has-photos`); this is deliberately the only thing that
  // distinguishes them; there's no separate "hide empty rows" mode,
  // since the whole point is a quick, complete visual checklist.
  function renderPhotoChecklistHtml() {
    var html = '<div class="photo-checklist">';
    (CFG.photoLabels.categories || []).forEach(function (cat) {
      html += '<div class="photo-checklist-category">' + esc(cat) + '</div>';
      CFG.photoLabels.labels.filter(function (l) { return l.category === cat; }).forEach(function (l) {
        var n = photoCountForLabel(cat, l.label);
        html += '<div class="photo-checklist-row' + (n > 0 ? ' has-photos' : '') + '">' +
          '<span>' + esc(l.label) + '</span><span class="photo-checklist-count">' + n + '</span>' +
          '</div>';
      });
    });
    var fCount = fieldPhotoNoLabelCount();
    html += '<div class="photo-checklist-category">Field Photos</div>' +
      '<div class="photo-checklist-row' + (fCount > 0 ? ' has-photos' : '') + '">' +
        '<span>Field Photos</span><span class="photo-checklist-count">' + fCount + '</span>' +
      '</div>';
    var uCount = unassignedPhotoCount();
    html += '<div class="photo-checklist-category">Unassigned</div>' +
      '<div class="photo-checklist-row' + (uCount > 0 ? ' has-photos' : '') + '">' +
        '<span>Unassigned</span><span class="photo-checklist-count">' + uCount + '</span>' +
      '</div>';
    return html + '</div>';
  }

  // Native <select> as the label picker -- deliberately not a custom
  // modal (Milestone 21 #8's "avoid a large modal... if a compact mobile
  // control is cleaner"): a native select opens the OS's own compact
  // picker on iOS/Android, needs no extra markup or backdrop, and is
  // exactly as fast to use one-handed as a picker gets. Options are
  // indexed by position in CFG.photoLabels.labels (never by re-encoding
  // category/label text into the option value), so there's no delimiter
  // to ever collide with a label's own text -- see the onchange handler
  // in wirePhotosTabControls().
  function generalPhotoLabelSelectHtml(photo) {
    var html = '<option value=""' + (!photo.label ? ' selected' : '') + '>Unassigned</option>';
    var byCategory = {};
    (CFG.photoLabels.labels || []).forEach(function (l, idx) {
      if (!byCategory[l.category]) byCategory[l.category] = [];
      byCategory[l.category].push({ label: l.label, idx: idx });
    });
    (CFG.photoLabels.categories || []).forEach(function (cat) {
      html += '<optgroup label="' + esc(cat) + '">';
      (byCategory[cat] || []).forEach(function (entry) {
        var isSel = photo.category === cat && photo.label === entry.label;
        html += '<option value="' + entry.idx + '"' + (isSel ? ' selected' : '') + '>' + esc(entry.label) + '</option>';
      });
      html += '</optgroup>';
    });
    return html;
  }

  // Milestone 21.1: one grid item, used for both field-linked and
  // general photos in the unified review list -- carries data-field-id
  // (empty string for a general photo, never absent) so
  // wirePhotosTabControls() can tell which cache array/delete path a
  // given item belongs to without a second lookup. A labeled photo shows
  // its report label as the primary caption plus a secondary "From:
  // <field>" note when it's also field-linked (#5); an unlabeled
  // field-linked photo shows just the source field as a compact
  // secondary line (#3) -- both via fieldLabelById()'s own safe
  // 'Field Photo' fallback for an orphaned/legacy fieldId, so a bad id
  // can never break rendering here any more than it already couldn't in
  // the PDF.
  function photoItemHtml(p) {
    var sourceLabel = p.fieldId != null ? (fieldLabelById(p.fieldId) || 'Field Photo') : null;
    var captionHtml = '';
    if (p.category && p.label) {
      captionHtml = '<div class="general-photo-caption">' + esc(p.category) + ' &rarr; ' + esc(p.label) + '</div>';
      if (sourceLabel) captionHtml += '<div class="general-photo-source">From: ' + esc(sourceLabel) + '</div>';
    } else if (sourceLabel) {
      captionHtml = '<div class="general-photo-source">' + esc(sourceLabel) + '</div>';
    }
    return '<div class="general-photo-item" data-field-id="' + esc(p.fieldId == null ? '' : p.fieldId) + '">' +
      '<img src="' + esc(p.thumbnailUrl) + '" alt="" data-role="general-photo-view" data-photo-id="' + esc(p.id) + '">' +
      '<button type="button" class="photo-delete-btn" data-role="general-photo-delete" ' +
        'data-photo-id="' + esc(p.id) + '" aria-label="Delete photo">&times;</button>' +
      captionHtml +
      '<select class="general-photo-label-select" data-role="general-photo-label-select" ' +
        'data-photo-id="' + esc(p.id) + '">' +
        generalPhotoLabelSelectHtml(p) +
      '</select>' +
      '</div>';
  }

  // Milestone 21.1 #5/#11: the Photos tab's single review list, covering
  // every photo in the inspection exactly once -- field-linked and
  // general alike. Bucketed the same three ways as
  // renderPhotoChecklistHtml()'s own counts, in the same order (labeled
  // first -- a report label is the more specific, deliberately-chosen
  // fact, so it wins over field-association per the PDF's identical
  // #12 rule; then field-linked-no-label; then Unassigned), so the
  // checklist above and the grid below can never disagree about which
  // section a given photo belongs to. Each of the three filters is
  // mutually exclusive with the other two, so no photo can ever appear
  // twice or be silently dropped. Sorted within each section by
  // capture/import time (see sortByAddedAt()'s comment for why `order`
  // itself can't be used across a merged list).
  function renderPhotoReviewListHtml() {
    var all = allPhotoCacheEntries();
    if (!all.length) {
      return '<div class="shell-note">No photos yet -- field photos and general photos (Front, Rear, Kitchen, Street Scene, etc.) will appear here.</div>';
    }
    var labeled = sortByAddedAt(all.filter(function (p) { return p.category && p.label; }));
    var fieldOnly = sortByAddedAt(all.filter(function (p) { return p.fieldId != null && !(p.category && p.label); }));
    var unassigned = sortByAddedAt(all.filter(function (p) { return p.fieldId == null && !(p.category && p.label); }));
    var html = '';
    if (labeled.length) {
      html += '<div class="photo-checklist-category">Report Photos</div>' +
        '<div class="general-photo-grid">' + labeled.map(photoItemHtml).join('') + '</div>';
    }
    if (fieldOnly.length) {
      html += '<div class="photo-checklist-category">Field Photos</div>' +
        '<div class="general-photo-grid">' + fieldOnly.map(photoItemHtml).join('') + '</div>';
    }
    if (unassigned.length) {
      html += '<div class="photo-checklist-category">Unassigned</div>' +
        '<div class="general-photo-grid">' + unassigned.map(photoItemHtml).join('') + '</div>';
    }
    return html;
  }

  function renderPhotosTabHtml() {
    var warningHtml = dbUnavailable
      ? '<div class="shell-note error">Photos aren\'t available in this browser ' +
        '(IndexedDB is blocked or unsupported).</div>'
      : '';
    var actionsHtml =
      '<div class="insp-tab-group">' +
        '<button type="button" class="insp-tab-btn" data-role="general-photo-library">Photo Library</button>' +
        '<button type="button" class="insp-tab-btn" data-role="general-take-photo">Take Photo</button>' +
      '</div>' +
      '<input type="file" accept="image/*" multiple data-role="general-photo-library-input" hidden>' +
      '<input type="file" accept="image/*" capture="environment" data-role="general-take-photo-input" hidden>';
    return warningHtml + actionsHtml + renderPhotoChecklistHtml() + renderPhotoReviewListHtml();
  }

  function wirePhotosTabControls() {
    var libBtn = $('[data-role="general-photo-library"]');
    var libInput = $('[data-role="general-photo-library-input"]');
    if (libBtn && libInput) {
      libBtn.onclick = function () { libInput.click(); };
      libInput.onchange = function () {
        if (libInput.files && libInput.files.length) addGeneralPhotos(libInput.files);
        libInput.value = '';
      };
    }
    var takeBtn = $('[data-role="general-take-photo"]');
    var takeInput = $('[data-role="general-take-photo-input"]');
    if (takeBtn && takeInput) {
      takeBtn.onclick = function () { takeInput.click(); };
      takeInput.onchange = function () {
        if (takeInput.files && takeInput.files.length) addGeneralPhotos(takeInput.files);
        takeInput.value = '';
      };
    }
    // Milestone 21.1: the review list now mixes field-linked and general
    // photos in one grid (see photoItemHtml()), so every handler below
    // first reads which field (if any) this particular item belongs to
    // off its own wrapper's data-field-id -- set once per item at render
    // time, never re-derived -- and dispatches to whichever existing,
    // already-tested function actually owns that photo's storage: a
    // field-linked photo's view/delete reuse the exact same
    // openFullPhotoViewer()/deletePhoto() the per-field panel itself
    // calls (so "delete from Photos" *is* "delete from the field," not a
    // parallel path that could disagree with it), a general photo's
    // reuse openFullPhotoViewer()/deleteGeneralPhoto() unchanged from
    // Milestone 21.
    Array.prototype.forEach.call(document.querySelectorAll('[data-role="general-photo-view"]'), function (img) {
      img.onclick = function () {
        var itemEl = img.closest('.general-photo-item');
        var fieldId = (itemEl && itemEl.dataset.fieldId) || null;
        openFullPhotoViewer(fieldId, img.dataset.photoId);
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-role="general-photo-delete"]'), function (btn) {
      btn.onclick = function () {
        // Same lightweight native-confirm guard as a field photo's own
        // delete button -- see wireFields()'s [data-role="photo-delete"]
        // handler. Deleting a field-linked photo from here goes through
        // the same idbDelete()+photosByField-cache-removal deletePhoto()
        // always has -- there is no separate "Photos tab copy" of the
        // record to fall out of sync, so this always also removes it
        // from its original field (Milestone 21.1 #7).
        if (!window.confirm('Delete this photo?')) return;
        var itemEl = btn.closest('.general-photo-item');
        var fieldId = (itemEl && itemEl.dataset.fieldId) || null;
        if (fieldId) {
          deletePhoto(fieldId, btn.dataset.photoId);
        } else {
          deleteGeneralPhoto(btn.dataset.photoId);
        }
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-role="general-photo-label-select"]'), function (sel) {
      sel.onchange = function () {
        var id = sel.dataset.photoId;
        var itemEl = sel.closest('.general-photo-item');
        var fieldId = (itemEl && itemEl.dataset.fieldId) || null;
        if (sel.value === '') {
          assignPhotoLabel(id, fieldId, null, null);
          return;
        }
        var entry = CFG.photoLabels.labels[Number(sel.value)];
        if (entry) assignPhotoLabel(id, fieldId, entry.category, entry.label);
      };
    });
  }

  // ---- Footprint tab (Milestone 22) ----
  //
  // "Digital graph paper, not CAD." Draw first, organize later: the
  // appraiser never enters a dimension, never confirms a line, never
  // sees a dialog while sketching. A completed freehand stroke is
  // analyzed once, at pointer-lift, and either kept as drawn (curves,
  // arcs, circles, handwriting) or replaced with a clean straight
  // segment between its own actual start/end points (see
  // classifyStroke()) -- never a best-fit-line endpoint, never snapped
  // to horizontal/vertical/45 degrees. Inventory before this milestone
  // (read-only look at clipboard-test's own "Footprint" prototype, plus
  // this project's own workbook/config) found no straight-line assist
  // anywhere to build on, and no existing Sketch-type field in either
  // MAIN or FOLLOW_UP for this to attach to -- see FOOTPRINT_TAB's own
  // comment for why this is a synthetic tab rather than a workbook-driven
  // one. clipboard-test's world-space coordinate pipeline, pinch-zoom
  // math, whole-snapshot undo, and world-space grid were sound patterns
  // worth adapting (documented per-function below); its two other,
  // CAD-like sketch systems (a wall tracer with angle-snapping/closure
  // assist, an object-based annotator with select/resize) were
  // deliberately NOT ported -- overbuilt for a footprint sketch, and
  // explicitly out of scope (#28).
  //
  // Rendering model: every other tab in this file follows one rule --
  // mutate state, call the global render(), which replaces #screen's
  // entire innerHTML and rewires every control fresh. That rule still
  // holds here at the *boundaries* of a drawing action (a completed
  // stroke, an undo, a tool change) -- but the interior of a drag
  // (dozens of pointermove events while a finger is still down) never
  // calls render() or touches innerHTML at all, since recreating the
  // <canvas> element mid-stroke would either freeze/flicker the draft
  // line or lose it outright. Instead, wireFootprintTabControls() wires
  // raw pointer* handlers directly onto the canvas once per tab-visit,
  // and everything during a drag talks straight to the canvas's own 2D
  // context (drawFootprintCanvas()) -- render() only runs again once the
  // pointer lifts and the new stroke has already been committed to
  // `footprint.strokes`, at which point recreating the canvas and
  // redrawing from that state is correct and (per #34) cheap even at
  // 100+ strokes, since every redraw is one straight pass over the
  // strokes array with no per-stroke work heavier than a handful of
  // ctx.lineTo() calls.
  //
  // Coordinate system: `footprint.strokes` are stored in one fixed
  // world-space (never screen pixels, never affected by pan/zoom/canvas
  // resize/orientation change -- see #33). footprintView ({scale,x,y})
  // is the *only* thing that changes when the user pans or pinches;
  // footprintScreenToWorld()/footprintWorldToScreen() are the sole
  // conversion points, and drawFootprintCanvas() applies the exact same
  // transform via ctx.translate/ctx.scale that clipboard-test's own
  // Footprint prototype used (confirmed by reading it read-only) --
  // proven to keep strokes, grid, and pointer math all agreeing with
  // each other with no separate bookkeeping. The canvas's backing-store
  // resolution (devicePixelRatio) is a completely separate, permanent
  // transform applied once in setupFootprintCanvasBackingStore() --
  // never confused with the world-view transform, which is reset and
  // reapplied every single redraw via ctx.setTransform() (absolute, not
  // relative) so the two can never compound into a corrupted transform
  // after repeated resizes.

  var FOOTPRINT_LINE_WIDTHS = { thin: 2.5, medium: 4.5, thick: 7.5 };
  // A stroke whose total on-screen travel never exceeded this many CSS
  // pixels is an accidental tap, not a drawing action -- discarded
  // entirely (#5's one explicit exception to "no length threshold").
  // Deliberately measured in screen pixels (a physical gesture-size
  // concept), unlike the line-intent ratios below, which are unitless
  // and therefore scale-invariant by construction.
  var FOOTPRINT_NOISE_SCREEN_PX = 6;
  // Only append a new sampled point once the pointer has moved at least
  // this many CSS-pixel-equivalents in world space -- keeps a slow,
  // careful stroke's point array from ballooning with near-duplicate
  // samples, without any visible loss of fidelity.
  var FOOTPRINT_MIN_SAMPLE_SCREEN_PX = 2.5;
  // Line-intent tolerances (#7): a stroke is treated as an intended
  // straight line when its worst perpendicular wobble away from the
  // straight line between its own first/last point is no more than this
  // fraction of that line's own length (relative, not a fixed pixel
  // value -- #5's explicit requirement, so a 2-foot-looking wobble and a
  // 40-foot-looking wobble are judged by the same standard), AND its
  // actual sampled path isn't much longer than that straight-line
  // distance (catches gentle S-wobbles/near-closed loops a pure
  // max-deviation check alone could miss -- see classifyStroke()).
  // Starting values based on reasoning about typical touchscreen
  // freehand wobble vs. a deliberate curve/arc; flagged in the
  // completion report as needing physical stylus/finger validation per
  // #36 -- kept as the two named constants here specifically so they're
  // easy to retune later without touching the algorithm itself.
  var FOOTPRINT_STRAIGHT_DEVIATION_RATIO = 0.07;
  var FOOTPRINT_STRAIGHT_LENGTH_RATIO = 1.12;
  var FOOTPRINT_MIN_SCALE = 0.15;
  var FOOTPRINT_MAX_SCALE = 10;
  var FOOTPRINT_GRID_MINOR_WORLD = 24;
  var FOOTPRINT_GRID_MAJOR_EVERY = 5;

  function footprintLineWidthValue(width) {
    return FOOTPRINT_LINE_WIDTHS[width] || FOOTPRINT_LINE_WIDTHS.medium;
  }

  // Perpendicular distance from p to the *infinite* line through a/b --
  // used only for the straight-line deviation test, where "how far did
  // the stroke wander from the chord" is the question, not "how close
  // is p to the nearest point of the bounded segment" (that's
  // footprintDistToSegment(), used for erasing).
  function footprintPerpDist(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / Math.sqrt(lenSq);
  }

  // Distance from p to the closest point on the bounded segment a-b --
  // the eraser's own hit test, deliberately different from
  // footprintPerpDist() above (a point "past the end" of a short
  // segment shouldn't register as a hit just because it's near the
  // segment's infinite extension).
  function footprintDistToSegment(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    var t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  // The core line-intent test (#4/#7). `points` is the raw sampled
  // world-space stroke, already past the noise threshold (length >= 2).
  // devRatio catches a stroke that wanders far from its own chord at any
  // single point (an arc, a bulge); lenRatio catches one that stays
  // deceptively close to the chord along the way but travels a much
  // longer path getting there (a shallow S, a near-closed loop -- a true
  // circle has start≈end, so straightDist≈0 and is rejected outright
  // below, exactly the "circles must survive" case in #8 with no special
  // casing needed). Both are unitless ratios, so a short "2-foot" stroke
  // and a long "40-foot" one are held to the identical standard --
  // there is no absolute length involved anywhere in this function,
  // satisfying #5 by construction, not by a length cutoff. Returns the
  // stroke's own actual first/last sampled points as a/b when it *is*
  // line-like -- never a computed best-fit endpoint (#30).
  function classifyStroke(points) {
    var a = points[0], b = points[points.length - 1];
    var straightDist = Math.hypot(b.x - a.x, b.y - a.y);
    if (straightDist <= 0) return { isLine: false };
    var pathLen = 0;
    var maxDev = 0;
    for (var i = 0; i < points.length; i++) {
      var d = footprintPerpDist(points[i], a, b);
      if (d > maxDev) maxDev = d;
      if (i > 0) pathLen += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    var devRatio = maxDev / straightDist;
    var lenRatio = pathLen / straightDist;
    var isLine = devRatio <= FOOTPRINT_STRAIGHT_DEVIATION_RATIO && lenRatio <= FOOTPRINT_STRAIGHT_LENGTH_RATIO;
    return { isLine: isLine, a: a, b: b };
  }

  // Restrained one-pass weighted-average smoothing (#9) for a freehand
  // stroke that isn't line-like but is visibly jittery -- reduces
  // sample-to-sample hand tremor without materially reshaping deliberate
  // curvature or corners (a single 0.25/0.5/0.25 pass moves each interior
  // point only partway toward its neighbors' average, never iterated).
  // First and last points are always left exactly as sampled, the same
  // endpoint-fidelity discipline classifyStroke() uses for lines --
  // smoothing a freehand stroke's endpoints would be exactly the kind of
  // "alter the stopping point to make it nicer" #4 forbids for lines, and
  // there's no reason to treat freehand differently. Skipped entirely
  // for a very short stroke (< 5 points) -- too little data to smooth
  // safely without risking exactly the kind of over-smoothing #9 warns
  // against for a small deliberate mark/symbol.
  function smoothFreehandPoints(points) {
    if (points.length < 5) return points;
    var out = [points[0]];
    for (var i = 1; i < points.length - 1; i++) {
      var p0 = points[i - 1], p1 = points[i], p2 = points[i + 1];
      out.push({ x: p0.x * 0.25 + p1.x * 0.5 + p2.x * 0.25, y: p0.y * 0.25 + p1.y * 0.5 + p2.y * 0.25 });
    }
    out.push(points[points.length - 1]);
    return out;
  }

  function footprintScreenToWorld(clientX, clientY) {
    var rect = footprintCanvasEl.getBoundingClientRect();
    return {
      x: (clientX - rect.left - footprintView.x) / footprintView.scale,
      y: (clientY - rect.top - footprintView.y) / footprintView.scale
    };
  }

  // Sets (never incrementally adjusts) the canvas's backing-store
  // resolution from its current CSS size * devicePixelRatio, and resets
  // the context's base transform to match -- called on first wiring and
  // on every resize/orientation change. Uses ctx.setTransform() (an
  // absolute reset), not ctx.scale() (relative/compounding), specifically
  // so calling this repeatedly across resizes can never stack DPR scale
  // factors on top of each other -- the one failure mode that would
  // silently corrupt every subsequent draw.
  function setupFootprintCanvasBackingStore() {
    var dpr = window.devicePixelRatio || 1;
    var rect = footprintCanvasEl.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width * dpr));
    var h = Math.max(1, Math.round(rect.height * dpr));
    if (footprintCanvasEl.width !== w) footprintCanvasEl.width = w;
    if (footprintCanvasEl.height !== h) footprintCanvasEl.height = h;
    footprintCtx = footprintCanvasEl.getContext('2d');
    footprintCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // World-space grid (#17): drawn through the exact same
  // translate/scale the strokes themselves use, so it pans and zooms
  // with the drawing rather than drifting as a fixed screen overlay.
  // Only the visible world-space extent is iterated (derived from the
  // current viewport, not the whole infinite canvas), so cost stays
  // bounded regardless of how far the user has panned. Skipped entirely
  // once zoomed out far enough that minor lines would render closer than
  // 6 backing px apart -- avoids both a visually noisy mush and
  // unbounded line counts at extreme zoom-out, rather than special-casing
  // a zoom-level cutoff separately.
  function drawFootprintGrid(ctx, cssW, cssH) {
    var scale = footprintView.scale;
    if (FOOTPRINT_GRID_MINOR_WORLD * scale < 6) return;
    var left = -footprintView.x / scale;
    var top = -footprintView.y / scale;
    var right = (cssW - footprintView.x) / scale;
    var bottom = (cssH - footprintView.y) / scale;
    var startCol = Math.floor(left / FOOTPRINT_GRID_MINOR_WORLD);
    var endCol = Math.ceil(right / FOOTPRINT_GRID_MINOR_WORLD);
    var startRow = Math.floor(top / FOOTPRINT_GRID_MINOR_WORLD);
    var endRow = Math.ceil(bottom / FOOTPRINT_GRID_MINOR_WORLD);
    var top_ = startRow * FOOTPRINT_GRID_MINOR_WORLD, bottom_ = endRow * FOOTPRINT_GRID_MINOR_WORLD;
    var left_ = startCol * FOOTPRINT_GRID_MINOR_WORLD, right_ = endCol * FOOTPRINT_GRID_MINOR_WORLD;
    ctx.save();
    ctx.translate(footprintView.x, footprintView.y);
    ctx.scale(scale, scale);
    ctx.lineWidth = 1 / scale;
    [{ mod: false, color: 'rgba(28,58,82,0.07)' }, { mod: true, color: 'rgba(28,58,82,0.15)' }].forEach(function (pass) {
      ctx.strokeStyle = pass.color;
      ctx.beginPath();
      for (var c = startCol; c <= endCol; c++) {
        if ((c % FOOTPRINT_GRID_MAJOR_EVERY === 0) !== pass.mod) continue;
        var x = c * FOOTPRINT_GRID_MINOR_WORLD;
        ctx.moveTo(x, top_);
        ctx.lineTo(x, bottom_);
      }
      for (var r = startRow; r <= endRow; r++) {
        if ((r % FOOTPRINT_GRID_MAJOR_EVERY === 0) !== pass.mod) continue;
        var y = r * FOOTPRINT_GRID_MINOR_WORLD;
        ctx.moveTo(left_, y);
        ctx.lineTo(right_, y);
      }
      ctx.stroke();
    });
    ctx.restore();
  }

  function footprintDrawOneStroke(ctx, s) {
    ctx.lineWidth = footprintLineWidthValue(s.width);
    ctx.beginPath();
    if (s.type === 'line') {
      ctx.moveTo(s.a.x, s.a.y);
      ctx.lineTo(s.b.x, s.b.y);
    } else {
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (var i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
    }
    ctx.stroke();
  }

  // Full redraw from state -- committed strokes plus, mid-drag, the
  // live in-progress draft -- never partial/incremental. Called
  // continuously during a drag (cheap: a canvas clear + one pass over
  // however many strokes currently exist, no heavier per-stroke work
  // than a handful of ctx.lineTo() calls, comfortably within #34's
  // "100+ strokes stay responsive" even at 60fps) and once after any
  // discrete state change (undo, tool change, completed stroke via the
  // global render() recreating the canvas fresh).
  function drawFootprintCanvas() {
    if (!footprintCtx || !footprintCanvasEl) return;
    var dpr = window.devicePixelRatio || 1;
    var cssW = footprintCanvasEl.width / dpr;
    var cssH = footprintCanvasEl.height / dpr;
    var ctx = footprintCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    drawFootprintGrid(ctx, cssW, cssH);
    ctx.save();
    ctx.translate(footprintView.x, footprintView.y);
    ctx.scale(footprintView.scale, footprintView.scale);
    // Milestone 22.3: reference underlay drawn *after* the grid but
    // *before* strokes -- visually secondary to Flux drawing (#18) but
    // still above the grid, inside the exact same view transform every
    // stroke uses (see this section's own header comment on world-
    // coordinate registration). ctx.save()/restore() scoped tightly
    // around just this draw so globalAlpha never leaks into the
    // full-opacity strokes drawn immediately after.
    if (footprintReference && footprintReference.visible && footprintReferenceBitmap) {
      ctx.save();
      ctx.globalAlpha = footprintReference.opacity;
      ctx.translate(footprintReference.transform.x, footprintReference.transform.y);
      ctx.rotate(footprintReference.transform.rotation);
      var refW = footprintReference.width * footprintReference.transform.scale;
      var refH = footprintReference.height * footprintReference.transform.scale;
      ctx.drawImage(footprintReferenceBitmap, -refW / 2, -refH / 2, refW, refH);
      ctx.restore();
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1c3a52';
    footprint.strokes.forEach(function (s) { footprintDrawOneStroke(ctx, s); });
    if (footprintDraft && footprintDraft.mode === 'draw' && footprintDraft.points.length > 1) {
      footprintDrawOneStroke(ctx, { type: 'freehand', points: footprintDraft.points, width: footprintLineWidth });
    }
    ctx.restore();
  }

  // Shallow copy of the strokes array only -- individual stroke objects
  // are treated as immutable once created (drawing pushes a new object,
  // erasing filters the array down, neither ever mutates an existing
  // stroke's own fields in place), so a shallow `.slice()` is a complete,
  // correct point-in-time snapshot without the cost of deep-cloning every
  // stroke's point list on every single action.
  function footprintPushUndoSnapshot() {
    footprintUndoStack.push(footprint.strokes.slice());
    if (footprintUndoStack.length > FOOTPRINT_UNDO_LIMIT) footprintUndoStack.shift();
  }

  // Reverses exactly one prior committed action -- a completed line, a
  // completed freehand stroke, or one whole erase gesture (#14) -- never
  // a partial step, since footprintPushUndoSnapshot() is only ever called
  // once per completed user action (see footprintCommitDrawDraft()/the
  // eraser's lazy-snapshot-on-first-hit below), not once per point or
  // per stroke removed. Straightening specifically never creates a
  // second undo step: classification happens *before* the stroke is
  // ever pushed to `footprint.strokes`, so there is exactly one array
  // mutation, and therefore exactly one snapshot, per rough-stroke-
  // becomes-straight-line action.
  function footprintUndo() {
    if (!footprintUndoStack.length) return;
    footprint.strokes = footprintUndoStack.pop();
    scheduleAutoSave();
    render();
  }

  // Finalizes a completed Pencil drag into either a straight `line`
  // (endpoints = the actual first/last sampled points, never a
  // recomputed best-fit endpoint -- #30) or a `freehand` stroke
  // (optionally lightly smoothed -- #9), and pushes it onto
  // `footprint.strokes`. The noise threshold is measured in screen
  // pixels (multiplying world-space deltas back out by the scale the
  // stroke was drawn at -- pan/zoom can't happen mid-single-pointer-drag,
  // so this scale is stable for the whole gesture) since "was this an
  // accidental tap" is inherently a physical-gesture-size question, not
  // a world-space one.
  function footprintCommitDrawDraft(draft) {
    var pts = draft.points;
    if (pts.length < 2) return;
    var scale = draft.startScale;
    var pathLenPx = 0;
    for (var i = 1; i < pts.length; i++) {
      pathLenPx += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) * scale;
    }
    if (pathLenPx < FOOTPRINT_NOISE_SCREEN_PX) return;

    footprintPushUndoSnapshot();
    var classification = footprintStraightenEnabled ? classifyStroke(pts) : { isLine: false };
    var stroke;
    if (classification.isLine) {
      stroke = { id: generateFootprintStrokeId(), type: 'line', a: classification.a, b: classification.b, width: footprintLineWidth };
    } else {
      stroke = { id: generateFootprintStrokeId(), type: 'freehand', points: smoothFreehandPoints(pts), width: footprintLineWidth };
    }
    footprint.strokes.push(stroke);
    scheduleAutoSave();
  }

  function footprintStrokeHit(s, p, radius) {
    if (s.type === 'line') return footprintDistToSegment(p, s.a, s.b) <= radius;
    var pts = s.points;
    if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y) <= radius;
    for (var i = 1; i < pts.length; i++) {
      if (footprintDistToSegment(p, pts[i - 1], pts[i]) <= radius) return true;
    }
    return false;
  }

  // Removes every stroke under the pointer at (clientX, clientY) --
  // usually zero or one per call, but a drag can sweep over several in
  // one motion, which is fine: the *undo* snapshot for this whole erase
  // gesture is taken lazily, once, the first time this call actually
  // removes anything (draft.snapshotTaken), so one drag that erases five
  // overlapping strokes is still exactly one undo step (#14), and an
  // eraser tap that hits nothing never pollutes undo history with a
  // no-op snapshot. Hit radius is generous relative to each stroke's own
  // width (easier to hit-and-remove than to draw precisely on a
  // touchscreen) and converted through the current view scale so it
  // feels consistent regardless of zoom level.
  function footprintEraseAt(clientX, clientY) {
    var wp = footprintScreenToWorld(clientX, clientY);
    var scale = footprintView.scale;
    var changedAny = false;
    var kept = [];
    footprint.strokes.forEach(function (s) {
      var r = Math.max(14, footprintLineWidthValue(s.width) * 3) / scale;
      if (footprintStrokeHit(s, wp, r)) {
        if (!footprintDraft.snapshotTaken) {
          footprintPushUndoSnapshot();
          footprintDraft.snapshotTaken = true;
        }
        changedAny = true;
      } else {
        kept.push(s);
      }
    });
    if (changedAny) {
      footprint.strokes = kept;
      drawFootprintCanvas();
    }
  }

  // Two-pointer pinch-zoom-and-pan, unified into one gesture (#15): the
  // world point that was under the pinch's starting midpoint stays
  // anchored under its current midpoint as scale changes, which is what
  // makes a pure two-finger drag (near-constant distance) read as a pan
  // and a genuine pinch read as a zoom, from the exact same math -- the
  // same technique confirmed in clipboard-test's own Footprint prototype
  // (read read-only before this milestone), extended here to also cover
  // plain panning, not just zoom.
  function footprintComputePinchState() {
    var ids = Object.keys(footprintPointers);
    var p0 = footprintPointers[ids[0]], p1 = footprintPointers[ids[1]];
    var rect = footprintCanvasEl.getBoundingClientRect();
    return {
      startDist: Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1,
      startScale: footprintView.scale,
      startMidClientX: (p0.x + p1.x) / 2,
      startMidClientY: (p0.y + p1.y) / 2,
      startViewX: footprintView.x,
      startViewY: footprintView.y,
      rectLeft: rect.left,
      rectTop: rect.top
    };
  }

  function footprintApplyPinchPan() {
    var ids = Object.keys(footprintPointers);
    if (ids.length < 2 || !footprintPinchState) return;
    var p0 = footprintPointers[ids[0]], p1 = footprintPointers[ids[1]];
    var midX = (p0.x + p1.x) / 2, midY = (p0.y + p1.y) / 2;
    var dist = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
    var ps = footprintPinchState;
    var newScale = Math.max(FOOTPRINT_MIN_SCALE, Math.min(FOOTPRINT_MAX_SCALE, ps.startScale * (dist / ps.startDist)));
    var anchorWorldX = (ps.startMidClientX - ps.rectLeft - ps.startViewX) / ps.startScale;
    var anchorWorldY = (ps.startMidClientY - ps.rectTop - ps.startViewY) / ps.startScale;
    footprintView.scale = newScale;
    footprintView.x = (midX - ps.rectLeft) - anchorWorldX * newScale;
    footprintView.y = (midY - ps.rectTop) - anchorWorldY * newScale;
  }

  // Milestone 22.3: the reference's own two-finger scale+rotate gesture
  // -- deliberately separate from footprintComputePinchState()/
  // footprintApplyPinchPan() above (which pan/zoom the *canvas view*),
  // since transforming the reference and navigating the canvas are
  // mutually exclusive modes (#7) that happen to share the same "two
  // fingers, track distance and angle" shape but never run at the same
  // time -- footprintPointerDown() branches to one or the other, never
  // both. Unlike the canvas's own pinch-pan, this deliberately keeps the
  // reference's own center (transform.x/y) fixed during a 2-finger
  // gesture -- simpler than also anchoring under the fingers, and the
  // user can always follow up with a 1-finger move afterward.
  function footprintComputeReferenceGestureState() {
    var ids = Object.keys(footprintPointers);
    var p0 = footprintPointers[ids[0]], p1 = footprintPointers[ids[1]];
    return {
      startDist: Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1,
      startAngle: Math.atan2(p1.y - p0.y, p1.x - p0.x),
      startScale: footprintReference.transform.scale,
      startRotation: footprintReference.transform.rotation
    };
  }

  function footprintApplyReferenceGesture() {
    var ids = Object.keys(footprintPointers);
    if (ids.length < 2 || !footprintReferenceGestureState || !footprintReference) return;
    var p0 = footprintPointers[ids[0]], p1 = footprintPointers[ids[1]];
    var dist = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
    var angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    var gs = footprintReferenceGestureState;
    var newScale = gs.startScale * (dist / gs.startDist);
    footprintReference.transform.scale = Math.max(0.001, Math.min(1000, newScale));
    // Arbitrary rotation, never snapped to 90/45-degree increments (#8) --
    // the raw accumulated angle delta, full stop.
    footprintReference.transform.rotation = gs.startRotation + (angle - gs.startAngle);
    footprintReferenceTransformDirty = true;
  }

  // pointerdown: a second concurrent pointer always wins over drawing
  // (#15 -- "avoid accidental drawing during two-finger navigation") --
  // any in-progress single-pointer draft is simply abandoned (never
  // partially committed) the instant a second pointer arrives, and the
  // gesture becomes pinch/pan for its remainder. setPointerCapture keeps
  // move/up events targeted at the canvas even if a finger drifts outside
  // its bounds mid-drag, which is what lets a single pointerup/
  // pointercancel handler be the one reliable end-of-gesture signal
  // regardless of exactly where the finger lifted (#31). Wrapped in
  // try/catch: capture is a reliability enhancement, not a strict
  // prerequisite for drawing to work at all, and an uncaught exception
  // here (observed in testing with a platform that rejected the
  // pointerId) would otherwise abort this whole handler before
  // footprintPointers[ev.pointerId] is ever set -- silently swallowing
  // the entire gesture and leaving exactly the "stuck drawing state"
  // #31 warns against, for no benefit.
  function footprintPointerDown(ev) {
    try { footprintCanvasEl.setPointerCapture(ev.pointerId); } catch (e) { /* proceed uncaptured */ }
    footprintPointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
    var count = Object.keys(footprintPointers).length;

    // Milestone 22.3: an *unlocked* reference intercepts every canvas
    // gesture before normal tool-based handling ever runs -- one finger
    // moves it, two fingers scale+rotate it, and neither drawing, the
    // eraser, nor canvas pan/zoom can happen at the same time (#7). This
    // check comes first, unconditionally, so it can never be bypassed by
    // whatever footprintTool happens to be selected.
    if (footprintReference && !footprintReference.locked) {
      if (count >= 2) {
        footprintDraft = null;
        footprintReferenceGestureState = footprintComputeReferenceGestureState();
        return;
      }
      var refWp = footprintScreenToWorld(ev.clientX, ev.clientY);
      footprintDraft = {
        mode: 'reference-move',
        startWorld: refWp,
        startTransformX: footprintReference.transform.x,
        startTransformY: footprintReference.transform.y
      };
      return;
    }

    if (count >= 2) {
      footprintDraft = null;
      footprintPinchState = footprintComputePinchState();
      return;
    }

    if (footprintTool === 'hand') {
      footprintDraft = { mode: 'pan', lastX: ev.clientX, lastY: ev.clientY };
      return;
    }
    if (footprintTool === 'eraser') {
      footprintDraft = { mode: 'erase', snapshotTaken: false };
      footprintEraseAt(ev.clientX, ev.clientY);
      return;
    }
    var wp = footprintScreenToWorld(ev.clientX, ev.clientY);
    footprintDraft = { mode: 'draw', points: [wp], startScale: footprintView.scale };
    drawFootprintCanvas();
  }

  function footprintPointerMove(ev) {
    if (!(ev.pointerId in footprintPointers)) return;
    footprintPointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };

    if (footprintReference && !footprintReference.locked) {
      if (Object.keys(footprintPointers).length >= 2) {
        footprintApplyReferenceGesture();
        drawFootprintCanvas();
        return;
      }
      if (footprintDraft && footprintDraft.mode === 'reference-move') {
        var refWp = footprintScreenToWorld(ev.clientX, ev.clientY);
        footprintReference.transform.x = footprintDraft.startTransformX + (refWp.x - footprintDraft.startWorld.x);
        footprintReference.transform.y = footprintDraft.startTransformY + (refWp.y - footprintDraft.startWorld.y);
        footprintReferenceTransformDirty = true;
        drawFootprintCanvas();
      }
      return;
    }

    if (Object.keys(footprintPointers).length >= 2) {
      footprintApplyPinchPan();
      drawFootprintCanvas();
      return;
    }
    if (!footprintDraft) return;

    if (footprintDraft.mode === 'pan') {
      footprintView.x += ev.clientX - footprintDraft.lastX;
      footprintView.y += ev.clientY - footprintDraft.lastY;
      footprintDraft.lastX = ev.clientX;
      footprintDraft.lastY = ev.clientY;
      drawFootprintCanvas();
      return;
    }
    if (footprintDraft.mode === 'erase') {
      footprintEraseAt(ev.clientX, ev.clientY);
      return;
    }
    if (footprintDraft.mode === 'draw') {
      var wp = footprintScreenToWorld(ev.clientX, ev.clientY);
      var last = footprintDraft.points[footprintDraft.points.length - 1];
      var minDist = FOOTPRINT_MIN_SAMPLE_SCREEN_PX / footprintView.scale;
      if (Math.hypot(wp.x - last.x, wp.y - last.y) >= minDist) {
        footprintDraft.points.push(wp);
        drawFootprintCanvas();
      }
    }
  }

  // The one function both pointerup and pointercancel/lostpointercapture
  // funnel into (#31 -- "handle pointercancel safely... prevent stuck
  // drawing state"). `commit` distinguishes a normal lift (finalize
  // whatever was in progress) from a cancellation (discard it outright --
  // never try to guess a sensible endpoint for a gesture the platform
  // itself interrupted, e.g. an incoming call or a palm-rejection event).
  // If a second pointer lifts first during a pinch, the *other* pointer
  // remaining down does not resume drawing from wherever it happens to
  // be -- it takes a fresh pointerdown to start a new stroke, avoiding a
  // surprise stroke continuing mid-gesture from an unrelated finger.
  //
  // Milestone 22.1: explicitly releases capture for this pointerId,
  // rather than relying solely on the browser's own implicit release on
  // pointerup/pointercancel. The spec says capture auto-releases in both
  // cases, but a field report of the Footprint Settings button not
  // responding to a first real tap -- immediately after a drawing/pan
  // gesture, on physical touch hardware synthetic testing can't fully
  // reproduce -- is exactly the symptom a mobile browser that's slow or
  // inconsistent about that implicit release would produce: the canvas
  // keeps (or briefly appears to keep) claiming this pointerId's events
  // after the finger has already lifted, so the *next* tap elsewhere
  // (Settings) doesn't land cleanly on the first attempt. Explicit
  // release removes the dependency on that implicit behavior entirely.
  // Wrapped in try/catch since releasing a pointerId that was never
  // captured (setPointerCapture() failed, or the browser already
  // released it itself, e.g. right before onlostpointercapture fires
  // this same function) throws rather than no-ops.
  function footprintEndPointer(pointerId, commit) {
    if (!(pointerId in footprintPointers)) return;
    try { footprintCanvasEl.releasePointerCapture(pointerId); } catch (e) { /* already released/uncaptured */ }
    delete footprintPointers[pointerId];
    if (Object.keys(footprintPointers).length >= 1) {
      footprintPinchState = null;
      footprintReferenceGestureState = null;
      footprintDraft = null;
      return;
    }

    footprintPinchState = null;
    footprintReferenceGestureState = null;
    var draft = footprintDraft;
    footprintDraft = null;
    // Milestone 22.3: footprintReferenceTransformDirty deliberately
    // survives the "still 1+ pointers remaining" branch above (see its
    // own comment) -- it's the one reliable signal that a move or
    // scale+rotate gesture actually changed footprintReference.transform
    // at some point during this whole interaction, read only now that
    // every pointer has genuinely lifted. Covers both gesture shapes
    // (1-finger move, 2-finger scale+rotate) uniformly, since both set
    // this same flag rather than needing their own separate checks here.
    var referenceTransformChanged = footprintReferenceTransformDirty;
    footprintReferenceTransformDirty = false;
    if (!draft && !referenceTransformChanged) { drawFootprintCanvas(); return; }

    if (referenceTransformChanged && commit && footprintReference) {
      footprintReference.updatedAt = new Date().toISOString();
      scheduleAutoSave();
    } else if (draft && draft.mode === 'draw' && commit) {
      footprintCommitDrawDraft(draft);
    } else if (draft && draft.mode === 'erase' && commit && draft.snapshotTaken) {
      scheduleAutoSave();
    }
    render();
  }

  function footprintPointerUp(ev) { footprintEndPointer(ev.pointerId, true); }
  function footprintPointerCancel(ev) { footprintEndPointer(ev.pointerId, false); }

  // Milestone 22.1 #3/#9: a defensive belt-and-suspenders guard called
  // at the top of every toolbar control's own handler (tool buttons,
  // Undo, Settings, Straighten toggle, width buttons) -- toolbar and
  // canvas are separate sibling elements, so a toolbar tap can't
  // *structurally* be misrouted into canvas gesture handling, but this
  // makes the "toolbar interaction always wins" requirement true by
  // construction rather than by relying on that structural argument
  // alone: whatever the canvas's own pointer/capture state happens to
  // be at the instant a toolbar control is actually activated, it's
  // discarded outright first, never partially committed. Uncaptures any
  // pointerId the canvas still (correctly or not) believes it holds --
  // harmless/no-op if nothing was captured.
  function footprintAbortActiveGesture() {
    if (footprintCanvasEl) {
      Object.keys(footprintPointers).forEach(function (pid) {
        try { footprintCanvasEl.releasePointerCapture(Number(pid)); } catch (e) { /* already released/uncaptured */ }
      });
    }
    footprintPointers = {};
    footprintDraft = null;
    footprintPinchState = null;
    // Milestone 22.3: an in-progress reference move/scale/rotate gesture
    // is exactly the same category of "canvas gesture state a toolbar
    // tap must always win over" as footprintDraft/footprintPinchState.
    // Not reverting footprintReference.transform itself here (whatever
    // partial change already happened stays exactly as the user last
    // saw it) -- just clearing the *tracking* state, matching how an
    // aborted draw/erase draft is discarded, not undone stroke-by-stroke.
    // Any real change is still captured by the next save regardless
    // (saveCurrentInspection() always writes the current reference
    // wholesale, not conditionally), so nothing is silently lost.
    footprintReferenceGestureState = null;
    footprintReferenceTransformDirty = false;
  }

  // ---- Footprint reference-sketch underlay (Milestone 22.3) ----
  //
  // A county/property-appraiser sketch, imported as an image or PDF page
  // and traced *behind* the actual Flux drawing -- never Flux geometry
  // itself (#2). Architecturally kept separate from `footprint.strokes`
  // at every layer: its own metadata object (footprintReference), its
  // own Blob store (footprintReferenceBlobs, never the same IndexedDB
  // record `footprint` lives on), its own gesture mode (entered only
  // when unlocked, mutually exclusive with normal drawing/pan), never
  // touched by Undo (footprintPushUndoSnapshot() is never called
  // anywhere in this section) or the Eraser (footprintEraseAt() only
  // ever iterates `footprint.strokes`), and never read by the PDF
  // export's bounds/render path (footprintComputeBounds()/
  // footprintRenderExportCanvas() only ever see `footprint.strokes` --
  // see that section's own code, unchanged by this milestone). Tracing
  // over the reference produces ordinary Pencil strokes through the
  // exact same footprintCommitDrawDraft()/classifyStroke() pipeline
  // every other stroke already goes through; moving, hiding, or
  // deleting the reference can therefore never alter a single already-
  // traced stroke, by construction rather than by a separate guard.
  //
  // PDF rendering uses a locally vendored copy of pdf.js
  // (app_template/vendor/pdfjs/{pdf.mjs,pdf.worker.mjs}, MPL-2.0,
  // fetched once at build time from an official Mozilla release, never
  // loaded from a CDN at runtime -- #4's explicit "prefer a stable
  // local/project-controlled solution"). Loaded lazily via a dynamic
  // import() the first time the user actually picks a PDF, not on every
  // page load, so the ~3MB library cost is paid only by inspections that
  // use this feature. Rendered with `intent: 'print'` rather than the
  // default `intent: 'display'` -- confirmed by direct testing that
  // 'display' internally paces itself via requestAnimationFrame, which
  // can stall indefinitely in an environment where the tab is never
  // actually composited/visible; 'print' renders synchronously to
  // completion instead. This is also the semantically correct choice
  // regardless of that finding: this is a one-shot "rasterize the whole
  // page once" operation, not an interactive incremental viewer, which
  // is exactly what 'print' intent is for.
  //
  // Resolution: every imported reference (image or PDF page) is
  // rasterized once, capped at FOOTPRINT_REFERENCE_MAX_DIM (2200px) on
  // its longest edge, and stored as a single PNG Blob in its own
  // IndexedDB store -- never re-rasterized on subsequent app use (the
  // decoded ImageBitmap is cached in footprintReferenceBitmap and reused
  // across every redraw/pan/zoom). A PDF page is rendered directly at
  // its target scale in one pass (no separate render-then-downscale
  // step, since pdf.js can render straight to any target resolution); an
  // imported image is decoded once via createImageBitmap() then drawn
  // through an offscreen canvas at the capped size, one shared code path
  // (footprintRasterToBlob()) for the final encode either way.
  //
  // World-coordinate registration (#12/#28): the reference is drawn with
  // ctx.drawImage() *inside* the exact same ctx.translate(footprintView.x,
  // footprintView.y); ctx.scale(footprintView.scale, ...) block
  // drawFootprintCanvas() already applies to strokes and the grid, with
  // its own (x, y, scale, rotation) applied as a further nested
  // transform on top -- there is no separate screen-positioned DOM
  // element to keep in sync; panning, zooming, or resizing the canvas
  // moves and scales the reference and every stroke identically, by the
  // same mechanism already proven stable across orientation changes for
  // strokes alone (Milestone 22's own testing).

  var FOOTPRINT_REFERENCE_MAX_FILE_BYTES = 60 * 1024 * 1024;
  var footprintPdfJsPromise = null;

  function loadPdfJsLib() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (footprintPdfJsPromise) return footprintPdfJsPromise;
    footprintPdfJsPromise = import('./vendor/pdfjs/pdf.mjs').then(function (mod) {
      mod.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.mjs';
      window.pdfjsLib = mod;
      return mod;
    }).catch(function (e) {
      footprintPdfJsPromise = null;
      throw e;
    });
    return footprintPdfJsPromise;
  }

  // Shared final encode step for an *image* import -- draws the decoded
  // bitmap through an offscreen canvas at the resolution cap (never
  // upscaled past the source's own size, only ever downscaled) and
  // encodes it. JPEG source stays JPEG (avoids ballooning size for
  // photo-like scans); everything else becomes PNG, which compresses a
  // typical line-art/technical-drawing sketch far better than JPEG would
  // without introducing artifacts near thin traced lines.
  function footprintRasterToBlob(drawable, srcWidth, srcHeight, mimeType) {
    var scale = Math.min(1, FOOTPRINT_REFERENCE_MAX_DIM / Math.max(srcWidth, srcHeight));
    var w = Math.max(1, Math.round(srcWidth * scale));
    var h = Math.max(1, Math.round(srcHeight * scale));
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(drawable, 0, 0, w, h);
    var outType = mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) { reject(new Error('Could not encode image')); return; }
        resolve({ blob: blob, width: w, height: h });
      }, outType, outType === 'image/jpeg' ? 0.85 : undefined);
    });
  }

  function footprintImportImageFile(file) {
    return createImageBitmap(file).then(function (bitmap) {
      return footprintRasterToBlob(bitmap, bitmap.width, bitmap.height, file.type).then(function (result) {
        bitmap.close();
        return result;
      }, function (e) {
        bitmap.close();
        throw e;
      });
    });
  }

  // PDFs render straight to their target resolution in one pass (vector
  // source, so there's no quality cost to choosing the scale up front) --
  // unlike footprintRasterToBlob(), this always targets the full
  // FOOTPRINT_REFERENCE_MAX_DIM budget rather than capping at 1x, since a
  // small/letter-size county PDF page should still render crisply rather
  // than at its native ~72dpi "point" size.
  function footprintRenderPdfPageToBlob(page) {
    var baseViewport = page.getViewport({ scale: 1 });
    var scale = FOOTPRINT_REFERENCE_MAX_DIM / Math.max(baseViewport.width, baseViewport.height);
    var viewport = page.getViewport({ scale: scale });
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    var ctx = canvas.getContext('2d');
    return page.render({ canvasContext: ctx, viewport: viewport, intent: 'print' }).promise.then(function () {
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) {
          if (!blob) { reject(new Error('Could not encode PDF page')); return; }
          resolve({ blob: blob, width: canvas.width, height: canvas.height });
        }, 'image/png');
      });
    });
  }

  // Milestone 22 #5-equivalent for the reference: centered on the
  // current view, uniformly scaled (never distorted) to fit within ~85%
  // of the visible canvas -- the same "fit, don't fill, preserve aspect
  // ratio" rule Footprint's own PDF export uses for padding, applied
  // here to on-screen initial placement instead. Also what "Reset
  // Position" recomputes on demand.
  function footprintComputeInitialTransform(imgWidth, imgHeight) {
    var cssW = 600, cssH = 400, centerWorld = { x: 0, y: 0 };
    if (footprintCanvasEl) {
      var rect = footprintCanvasEl.getBoundingClientRect();
      cssW = rect.width || cssW;
      cssH = rect.height || cssH;
      centerWorld = footprintScreenToWorld(rect.left + cssW / 2, rect.top + cssH / 2);
    }
    var visibleWorldW = cssW / footprintView.scale;
    var visibleWorldH = cssH / footprintView.scale;
    var fitScale = Math.min((visibleWorldW * 0.85) / imgWidth, (visibleWorldH * 0.85) / imgHeight);
    return { x: centerWorld.x, y: centerWorld.y, scale: Math.max(0.001, fitScale), rotation: 0 };
  }

  // The one place that actually commits an imported reference -- called
  // only once the new Blob is fully decoded/rendered/ready in memory, so
  // every step before this can fail freely without touching
  // footprintReference/footprintReferenceBitmap at all. Writes the Blob
  // to its own store *first*; footprintReference/footprintReferenceBitmap
  // (and therefore any existing reference being replaced) are only
  // overwritten after that write has actually succeeded -- #31's "do not
  // destroy an existing reference until a replacement has successfully
  // imported" is satisfied by this ordering, not by a separate rollback
  // path. A brand-new reference starts unlocked (#5's "enter a temporary
  // Reference Edit mode") and with the Reference panel open, so the user
  // lands directly on the position/scale/rotate controls they need next.
  function finalizeReferenceImport(info) {
    if (!activeInspection || !activeInspection.inspectionId) {
      window.alert('No active inspection to attach this reference to.');
      return;
    }
    var id = activeInspection.inspectionId;
    idbPutReferenceBlob(id, info.blob).then(function () {
      if (footprintReferenceBitmap) {
        try { footprintReferenceBitmap.close(); } catch (e) { /* already closed */ }
        footprintReferenceBitmap = null;
      }
      return createImageBitmap(info.blob);
    }).then(function (bitmap) {
      footprintReferenceBitmap = bitmap;
      var now = new Date().toISOString();
      footprintReference = {
        version: 1,
        sourceType: info.sourceType,
        filename: info.filename,
        mimeType: info.mimeType,
        pdfPageIndex: info.pdfPageIndex,
        pdfPageCount: info.pdfPageCount,
        width: info.width,
        height: info.height,
        transform: footprintComputeInitialTransform(info.width, info.height),
        opacity: FOOTPRINT_REFERENCE_DEFAULT_OPACITY,
        visible: true,
        locked: false,
        createdAt: now,
        updatedAt: now
      };
      footprintReferencePanelOpen = true;
      footprintSettingsOpen = false;
      scheduleAutoSave();
      render();
    }).catch(function (e) {
      window.console && console.error && console.error('Clipboard-Flux: could not finalize reference import', e);
      window.alert('Could not save the reference sketch: ' + e.message);
    });
  }

  function footprintImportPdfPage(pdfDoc, pageNum, file) {
    return pdfDoc.getPage(pageNum).then(function (page) {
      return footprintRenderPdfPageToBlob(page);
    }).then(function (result) {
      finalizeReferenceImport({
        blob: result.blob,
        width: result.width,
        height: result.height,
        sourceType: 'pdf',
        filename: file.name || '',
        mimeType: 'application/pdf',
        pdfPageIndex: pageNum - 1,
        pdfPageCount: pdfDoc.numPages
      });
    });
  }

  // Reuses the existing Load-Inspection-duplicate-id choice modal
  // machinery (renderChoiceModal()/#inspection-modal) for the multi-page
  // picker (#4's "keep this interaction compact... do not build a
  // general-purpose PDF viewer") -- a flat list of page numbers, no
  // thumbnails (would mean rendering every page just to let the user
  // pick one), reusing markup/CSS this file already has and already
  // scrolls correctly for a long list via its own max-height.
  function footprintPromptPdfPageChoice(pdfDoc, file) {
    var choices = [];
    var numPages = pdfDoc.numPages;
    for (var i = 1; i <= numPages; i++) {
      (function (pageNum) {
        choices.push({
          label: 'Page ' + pageNum,
          action: function () {
            closeInspectionModal();
            footprintImportPdfPage(pdfDoc, pageNum, file).catch(function (e) {
              window.console && console.error && console.error('Clipboard-Flux: reference PDF page import failed', e);
              window.alert('Could not import that PDF page: ' + e.message);
            });
          }
        });
      })(i);
    }
    choices.push({ label: 'Cancel', action: closeInspectionModal });
    renderChoiceModal({
      title: 'Select Reference Page',
      message: 'This PDF has ' + numPages + ' pages -- choose the one with the sketch.',
      choices: choices
    });
  }

  // The one entry point for both "Import Reference" (no reference yet)
  // and "Replace Reference" (confirmed by the caller before this ever
  // runs) -- validates type/size up front and rejects anything else with
  // a plain alert before any decode work starts (#31's unsupported-file
  // handling). A cancelled file picker never calls this at all (the
  // input's own onchange only fires with a real file), so there's
  // nothing special to handle for that case.
  function handleReferenceFileSelected(file) {
    if (!file) return;
    var type = file.type;
    var isPdf = type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    var isImage = type === 'image/jpeg' || type === 'image/png' || type === 'image/webp';
    if (!isPdf && !isImage) {
      window.alert('Unsupported file type. Please choose a JPEG, PNG, or WebP image, or a PDF.');
      return;
    }
    if (file.size > FOOTPRINT_REFERENCE_MAX_FILE_BYTES) {
      window.alert('That file is too large to import as a reference sketch (60MB limit).');
      return;
    }

    if (isImage) {
      footprintImportImageFile(file).then(function (result) {
        finalizeReferenceImport({
          blob: result.blob,
          width: result.width,
          height: result.height,
          sourceType: 'image',
          filename: file.name || '',
          mimeType: file.type,
          pdfPageIndex: null,
          pdfPageCount: null
        });
      }).catch(function (e) {
        window.console && console.error && console.error('Clipboard-Flux: reference image import failed', e);
        window.alert('Could not import that image (it may be corrupted or an unsupported format): ' + e.message);
      });
      return;
    }

    file.arrayBuffer().then(function (buf) {
      return loadPdfJsLib().then(function (pdfjsLib) {
        return pdfjsLib.getDocument({ data: buf }).promise;
      });
    }).then(function (pdfDoc) {
      if (pdfDoc.numPages <= 1) {
        return footprintImportPdfPage(pdfDoc, 1, file);
      }
      footprintPromptPdfPageChoice(pdfDoc, file);
      return null;
    }).catch(function (e) {
      window.console && console.error && console.error('Clipboard-Flux: reference PDF import failed', e);
      window.alert('Could not open that PDF (it may be corrupted, password-protected, or unsupported): ' + e.message);
    });
  }

  function handleReferenceRemoveClick() {
    if (!footprintReference || !activeInspection || !activeInspection.inspectionId) return;
    if (!window.confirm('Remove the reference sketch? This will not affect your traced Footprint drawing.')) return;
    var id = activeInspection.inspectionId;
    idbDeleteReferenceBlob(id).then(function () {
      footprintReference = null;
      if (footprintReferenceBitmap) {
        try { footprintReferenceBitmap.close(); } catch (e) { /* already closed */ }
        footprintReferenceBitmap = null;
      }
      scheduleAutoSave();
      render();
    }).catch(function (e) {
      window.console && console.error && console.error('Clipboard-Flux: could not remove reference', e);
      window.alert('Could not remove the reference sketch: ' + e.message);
    });
  }

  function handleReferenceLockToggleClick() {
    if (!footprintReference) return;
    footprintReference.locked = !footprintReference.locked;
    footprintReference.updatedAt = new Date().toISOString();
    scheduleAutoSave();
    render();
  }

  function handleReferenceVisibleToggleClick() {
    if (!footprintReference) return;
    footprintReference.visible = !footprintReference.visible;
    footprintReference.updatedAt = new Date().toISOString();
    scheduleAutoSave();
    render();
  }

  // 'input' (fires continuously while dragging the slider) only updates
  // the live value and redraws the canvas directly -- never a full
  // render(), which would recreate the <input> mid-drag and lose the
  // user's grip on the thumb. 'change' (fires once, on release) is what
  // actually persists (#17's "opacity change completed/debounced").
  function handleReferenceOpacityInput(rangeEl) {
    if (!footprintReference) return;
    footprintReference.opacity = Math.max(0.05, Math.min(1, Number(rangeEl.value) / 100));
    drawFootprintCanvas();
  }

  function handleReferenceOpacityChange(rangeEl) {
    if (!footprintReference) return;
    handleReferenceOpacityInput(rangeEl);
    footprintReference.updatedAt = new Date().toISOString();
    scheduleAutoSave();
  }

  function handleReferenceResetTransformClick() {
    if (!footprintReference) return;
    footprintReference.transform = footprintComputeInitialTransform(footprintReference.width, footprintReference.height);
    footprintReference.updatedAt = new Date().toISOString();
    scheduleAutoSave();
    render();
  }

  // Milestone 22.3 #25: everything reference-related lives behind one
  // compact "Reference" toolbar button, never permanent Move/Rotate/
  // Opacity/Remove buttons in the main toolbar -- the popover's own
  // content switches entirely on whether footprintReference exists (an
  // Import prompt vs. the full set of reference controls), so there is
  // still only ever one popover markup block, not two competing ones.
  function footprintReferencePopoverHtml() {
    var fileInputHtml = '<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" ' +
      'data-role="footprint-reference-file-input" hidden>';
    if (!footprintReference) {
      return '<div class="footprint-settings-row"><span>No reference sketch imported</span></div>' +
        '<div class="footprint-tool-group">' +
          '<button type="button" class="footprint-tool-btn" data-role="footprint-reference-import">Import Reference</button>' +
        '</div>' + fileInputHtml;
    }
    var r = footprintReference;
    return '<div class="footprint-settings-row">' +
        '<span>Reference Sketch</span>' +
        '<span class="footprint-reference-filename">' + esc(r.filename || '(untitled)') + '</span>' +
      '</div>' +
      '<div class="footprint-settings-row">' +
        '<span>Lock</span>' +
        '<button type="button" class="footprint-toggle-btn' + (r.locked ? ' on' : '') +
          '" data-role="footprint-reference-lock-toggle" aria-pressed="' + r.locked + '">' +
          (r.locked ? 'Locked' : 'Unlocked') + '</button>' +
      '</div>' +
      '<div class="footprint-settings-row">' +
        '<span>Show</span>' +
        '<button type="button" class="footprint-toggle-btn' + (r.visible ? ' on' : '') +
          '" data-role="footprint-reference-visible-toggle" aria-pressed="' + r.visible + '">' +
          (r.visible ? 'Visible' : 'Hidden') + '</button>' +
      '</div>' +
      '<div class="footprint-settings-row">' +
        '<span>Opacity</span>' +
        '<input type="range" class="footprint-reference-opacity-input" data-role="footprint-reference-opacity" ' +
          'min="10" max="100" step="5" value="' + Math.round(r.opacity * 100) + '">' +
      '</div>' +
      '<div class="footprint-tool-group">' +
        '<button type="button" class="footprint-tool-btn" data-role="footprint-reference-reset-transform">Reset Position</button>' +
      '</div>' +
      '<div class="footprint-tool-group">' +
        '<button type="button" class="footprint-tool-btn" data-role="footprint-reference-replace">Replace</button>' +
        '<button type="button" class="footprint-tool-btn footprint-tool-btn-danger" data-role="footprint-reference-remove">Remove</button>' +
      '</div>' + fileInputHtml;
  }

  function renderFootprintTabHtml() {
    var warningHtml = dbUnavailable
      ? '<div class="shell-note error">Footprint save/load isn\'t available in this browser ' +
        '(IndexedDB is blocked or unsupported).</div>'
      : '';
    var widthLabels = { thin: 'Thin', medium: 'Medium', thick: 'Thick' };
    var widthButtonsHtml = ['thin', 'medium', 'thick'].map(function (w) {
      return '<button type="button" class="footprint-width-btn' + (footprintLineWidth === w ? ' active' : '') +
        '" data-role="footprint-width" data-width="' + w + '">' + widthLabels[w] + '</button>';
    }).join('');
    return warningHtml +
      '<div class="footprint-toolbar">' +
        '<div class="footprint-tool-group">' +
          '<button type="button" class="footprint-tool-btn' + (footprintTool === 'pencil' ? ' active' : '') +
            '" data-role="footprint-tool-pencil" aria-pressed="' + (footprintTool === 'pencil') + '">Pencil</button>' +
          '<button type="button" class="footprint-tool-btn' + (footprintTool === 'eraser' ? ' active' : '') +
            '" data-role="footprint-tool-eraser" aria-pressed="' + (footprintTool === 'eraser') + '">Eraser</button>' +
          '<button type="button" class="footprint-tool-btn' + (footprintTool === 'hand' ? ' active' : '') +
            '" data-role="footprint-tool-hand" aria-pressed="' + (footprintTool === 'hand') + '">Pan</button>' +
        '</div>' +
        '<div class="footprint-tool-group">' +
          '<button type="button" class="footprint-tool-btn" data-role="footprint-undo"' +
            (footprintUndoStack.length ? '' : ' disabled') + '>Undo</button>' +
          '<button type="button" class="footprint-tool-btn" data-role="footprint-settings">Settings</button>' +
          '<button type="button" class="footprint-tool-btn' + (footprintReferencePanelOpen ? ' active' : '') +
            '" data-role="footprint-reference">Reference</button>' +
        '</div>' +
      '</div>' +
      '<div class="footprint-settings-popover" data-role="footprint-settings-popover"' +
        (footprintSettingsOpen ? '' : ' hidden') + '>' +
        '<div class="footprint-settings-row">' +
          '<span>Straighten</span>' +
          '<button type="button" class="footprint-toggle-btn' + (footprintStraightenEnabled ? ' on' : '') +
            '" data-role="footprint-straighten-toggle" aria-pressed="' + footprintStraightenEnabled + '">' +
            (footprintStraightenEnabled ? 'On' : 'Off') + '</button>' +
        '</div>' +
        '<div class="footprint-settings-row">' +
          '<span>Line Thickness</span>' +
          '<div class="footprint-width-group">' + widthButtonsHtml + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="footprint-settings-popover footprint-reference-popover" data-role="footprint-reference-popover"' +
        (footprintReferencePanelOpen ? '' : ' hidden') + '>' +
        footprintReferencePopoverHtml() +
      '</div>' +
      '<div class="footprint-canvas-wrap">' +
        '<canvas id="footprint-canvas" class="footprint-canvas"></canvas>' +
      '</div>';
  }

  var footprintResizeListenerAdded = false;

  // Re-wired fresh every time the Footprint tab (re)renders -- same
  // convention as wireFields()/wirePhotosTabControls() -- since render()
  // recreates the <canvas> element itself each time. The window resize
  // listener is the one exception: added at most once, ever, and
  // self-guarding (it looks up the canvas fresh by id and no-ops if the
  // Footprint tab isn't currently showing one), so leaving the tab can
  // never leave a stale listener doing anything harmful, and repeated
  // visits can never stack duplicate listeners.
  function wireFootprintTabControls() {
    footprintCanvasEl = document.getElementById('footprint-canvas');
    if (footprintCanvasEl) {
      setupFootprintCanvasBackingStore();
      footprintPointers = {};
      footprintPinchState = null;
      drawFootprintCanvas();
      footprintCanvasEl.onpointerdown = footprintPointerDown;
      footprintCanvasEl.onpointermove = footprintPointerMove;
      footprintCanvasEl.onpointerup = footprintPointerUp;
      footprintCanvasEl.onpointercancel = footprintPointerCancel;
      footprintCanvasEl.onlostpointercapture = footprintPointerCancel;
    }

    if (!footprintResizeListenerAdded) {
      footprintResizeListenerAdded = true;
      window.addEventListener('resize', function () {
        var el = document.getElementById('footprint-canvas');
        if (!el) return;
        footprintCanvasEl = el;
        setupFootprintCanvasBackingStore();
        drawFootprintCanvas();
      });
    }

    Array.prototype.forEach.call(document.querySelectorAll('[data-role^="footprint-tool-"]'), function (btn) {
      btn.onclick = function () {
        footprintAbortActiveGesture();
        var role = btn.dataset.role;
        footprintTool = role === 'footprint-tool-eraser' ? 'eraser' : role === 'footprint-tool-hand' ? 'hand' : 'pencil';
        render();
      };
    });

    var undoBtn = document.querySelector('[data-role="footprint-undo"]');
    if (undoBtn) undoBtn.onclick = function () { footprintAbortActiveGesture(); footprintUndo(); };

    // Milestone 22.1: root-cause fix for the field-reported "Settings
    // doesn't respond to the first tap" defect. footprintAbortActive
    // Gesture() guarantees a stray/lingering canvas pointer-capture
    // state (the most plausible cause on real touch hardware -- see
    // footprintEndPointer()'s own comment) can never compete with this
    // tap; the toggle itself deliberately stays a direct DOM mutation,
    // not a full render(), so opening/closing Settings never touches
    // drawing state, pan/zoom, or autosave (#7) -- it only ever flips
    // one boolean and one `hidden` attribute.
    //
    // Milestone 22.3 #26: Settings and Reference are kept mutually
    // exclusive -- opening one always closes the other -- so the two
    // popovers can never compete for the same toolbar-adjacent space or
    // leave a stale one open behind the other.
    var settingsBtn = document.querySelector('[data-role="footprint-settings"]');
    var popover = document.querySelector('[data-role="footprint-settings-popover"]');
    var referencePopover = document.querySelector('[data-role="footprint-reference-popover"]');
    if (settingsBtn && popover) {
      settingsBtn.onclick = function () {
        footprintAbortActiveGesture();
        footprintSettingsOpen = !footprintSettingsOpen;
        popover.hidden = !footprintSettingsOpen;
        if (footprintSettingsOpen) {
          footprintReferencePanelOpen = false;
          if (referencePopover) referencePopover.hidden = true;
        }
      };
    }

    var straightenToggle = document.querySelector('[data-role="footprint-straighten-toggle"]');
    if (straightenToggle) {
      straightenToggle.onclick = function () {
        footprintAbortActiveGesture();
        footprintStraightenEnabled = !footprintStraightenEnabled;
        saveFootprintStraightenPref(footprintStraightenEnabled);
        footprintSettingsOpen = true;
        render();
      };
    }

    Array.prototype.forEach.call(document.querySelectorAll('[data-role="footprint-width"]'), function (btn) {
      btn.onclick = function () {
        footprintAbortActiveGesture();
        footprintLineWidth = btn.dataset.width;
        saveFootprintLineWidthPref(footprintLineWidth);
        footprintSettingsOpen = true;
        render();
      };
    });

    wireFootprintReferenceControls(popover, referencePopover);
  }

  // Milestone 22.3: every Reference-popover control, wired fresh on
  // every render() the same way the rest of this function's controls
  // are. Grouped into its own function purely to keep
  // wireFootprintTabControls() itself from growing unreadably long --
  // not a separate render pass or a separate DOM-replace cycle, so all
  // the same "re-wired fresh every time" guarantees apply.
  function wireFootprintReferenceControls(settingsPopoverEl, referencePopoverEl) {
    var referenceBtn = document.querySelector('[data-role="footprint-reference"]');
    if (referenceBtn && referencePopoverEl) {
      referenceBtn.onclick = function () {
        footprintAbortActiveGesture();
        footprintReferencePanelOpen = !footprintReferencePanelOpen;
        referencePopoverEl.hidden = !footprintReferencePanelOpen;
        if (footprintReferencePanelOpen) {
          footprintSettingsOpen = false;
          if (settingsPopoverEl) settingsPopoverEl.hidden = true;
        }
      };
    }

    var fileInput = document.querySelector('[data-role="footprint-reference-file-input"]');
    var importBtn = document.querySelector('[data-role="footprint-reference-import"]');
    var replaceBtn = document.querySelector('[data-role="footprint-reference-replace"]');
    if (fileInput) {
      fileInput.onchange = function () {
        var file = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (file) handleReferenceFileSelected(file);
      };
    }
    if (importBtn && fileInput) {
      importBtn.onclick = function () { fileInput.click(); };
    }
    if (replaceBtn && fileInput) {
      // #31: nothing is destroyed by this click itself -- the existing
      // reference is only ever replaced once the newly picked file has
      // fully imported (see finalizeReferenceImport()'s own comment).
      // This confirm is purely to set the user's expectation up front.
      replaceBtn.onclick = function () {
        if (window.confirm('Choose a new file to replace the current reference sketch?')) {
          fileInput.click();
        }
      };
    }

    var removeBtn = document.querySelector('[data-role="footprint-reference-remove"]');
    if (removeBtn) removeBtn.onclick = handleReferenceRemoveClick;

    var lockToggle = document.querySelector('[data-role="footprint-reference-lock-toggle"]');
    if (lockToggle) lockToggle.onclick = handleReferenceLockToggleClick;

    var visibleToggle = document.querySelector('[data-role="footprint-reference-visible-toggle"]');
    if (visibleToggle) visibleToggle.onclick = handleReferenceVisibleToggleClick;

    var opacityInput = document.querySelector('[data-role="footprint-reference-opacity"]');
    if (opacityInput) {
      opacityInput.oninput = function () { handleReferenceOpacityInput(opacityInput); };
      opacityInput.onchange = function () { handleReferenceOpacityChange(opacityInput); };
    }

    var resetTransformBtn = document.querySelector('[data-role="footprint-reference-reset-transform"]');
    if (resetTransformBtn) resetTransformBtn.onclick = handleReferenceResetTransformClick;
  }

  // ---- Notes tab (Milestone 22.4, continuous workspace Milestone 22.4.2) ----
  //
  // Two independent per-inspection workspaces -- one plain multiline text
  // area, one handwriting notebook -- for capturing a thought immediately
  // without choosing a category or destination first. Deliberately NOT a
  // second Footprint engine: no line-assist (classifyStroke() is never
  // called anywhere in this section), no pan/zoom, no reference underlay,
  // one fixed stroke thickness, and a four-button toolbar (Pencil/Eraser/
  // Undo/Clear) instead of Footprint's six-plus-two-popovers surface.
  //
  // Milestone 22.4.2 field report: the Hand workspace felt like a bounded
  // page rather than a notebook -- 22.4's model fit a small fixed logical
  // rectangle into whatever the current canvas happened to be, which
  // meant there was always a hard edge the user could reach. This
  // replaces that with a genuinely continuous document:
  //
  // - The <canvas> element's own CSS/backing-store height *is* the
  //   document height (notes.hand.docHeight) -- there is no separate
  //   "viewport into a bigger surface" to keep in sync. The canvas lives
  //   in normal page flow (same as every other tab's content), so
  //   scrolling the Notes tab is just the browser's own native page
  //   scroll -- zero redraw cost while scrolling, and no custom gesture/
  //   virtualization engine (#8 of 22.4.2's explicit "do not build a
  //   complex gesture engine unless required").
  // - Stroke points are raw CSS-pixel document coordinates: x/y relative
  //   to the canvas element's own top-left, y simply growing downward as
  //   the document grows. There is no scale/fit transform anywhere in
  //   this section any more (contrast Footprint's pan/zoom and 22.4's
  //   own contain-fit, both deliberately absent here). A pointer event's
  //   document coordinates are just `clientX/Y -
  //   canvas.getBoundingClientRect().left/top` -- getBoundingClientRect()
  //   already reflects the canvas's current position after scrolling, by
  //   definition, so this can never suffer the "draw at scroll position
  //   Y -> stroke reappears offset by scrollTop" bug class (22.4.2 #9) --
  //   there is no manual scroll-offset math to get wrong in the first
  //   place.
  // - notesHandEnsureDocHeight() grows the canvas (in
  //   NOTES_HAND_GROWTH_CHUNK increments, triggered
  //   NOTES_HAND_BOTTOM_BUFFER px before the true bottom, #6) on scroll
  //   and while actively drawing, so the user experiences "keep
  //   scrolling down and keep writing" (#5) without a visible jump:
  //   existing content redraws at its exact same coordinates immediately
  //   after every resize.
  // - Backward compatibility (#49): see sanitizeNotes()'s own comment --
  //   pre-22.4.2 stroke coordinates need no conversion at all.
  //
  // Isolation from Footprint (#29/#45): every piece of mutable state here
  // (notesHandPointers/notesHandDraft/notesHandUndoStack/notesHandTool/
  // notesHandCanvasEl/notesHandCtx) is its own variable, never shared
  // with footprint's equivalents -- switching tabs mid-gesture in either
  // direction cannot continue, cancel, or otherwise touch the other
  // drawing surface's state, and this tab's own page-scroll listener
  // never touches Footprint's pan/zoom/gesture state either.

  // Document-space coordinates: getBoundingClientRect() already accounts
  // for scroll, so this is a direct, un-transformed mapping -- see this
  // section's own header comment for why that's what eliminates the
  // scroll-offset bug class by construction rather than by careful math.
  function notesHandScreenToDoc(clientX, clientY) {
    var rect = notesHandCanvasEl.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function notesHandCappedDpr() {
    return Math.min(window.devicePixelRatio || 1, NOTES_HAND_MAX_DPR);
  }

  // Sets the canvas's CSS height from notes.hand.docHeight (the document
  // height, driven by JS, not by content auto-sizing the way an ordinary
  // element would be) and syncs the backing store to the canvas's
  // resulting on-screen size -- same DPR-aware pattern Footprint's own
  // setupFootprintCanvasBackingStore() uses, just with a capped DPR
  // (NOTES_HAND_MAX_DPR) since this canvas, unlike Footprint's, has no
  // fixed upper bound on how tall it can grow over a long field session.
  function setupNotesHandCanvasBackingStore() {
    var dpr = notesHandCappedDpr();
    notesHandCanvasEl.style.height = notes.hand.docHeight + 'px';
    var rect = notesHandCanvasEl.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width * dpr));
    var h = Math.max(1, Math.round(rect.height * dpr));
    if (notesHandCanvasEl.width !== w) notesHandCanvasEl.width = w;
    if (notesHandCanvasEl.height !== h) notesHandCanvasEl.height = h;
    notesHandCtx = notesHandCanvasEl.getContext('2d');
    notesHandCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Grows the document (never shrinks it -- existing content never needs
  // less room than it already has) to at least `minHeight`, in
  // NOTES_HAND_GROWTH_CHUNK increments so growth feels like steadily
  // extending notebook paper rather than one sudden jump (#5's "avoid
  // sudden visible jumps"). Resizing a canvas element clears its pixel
  // content by spec, so every growth redraws from the stroke data --
  // cheap and rare (only when actually approaching the bottom), never
  // triggered merely by scrolling elsewhere in the document.
  function notesHandEnsureDocHeight(minHeight) {
    if (!notesHandCanvasEl) return;
    var current = notes.hand.docHeight || NOTES_HAND_MIN_DOC_HEIGHT;
    if (minHeight <= current) return;
    var next = current;
    while (next < minHeight) next += NOTES_HAND_GROWTH_CHUNK;
    notes.hand.docHeight = next;
    setupNotesHandCanvasBackingStore();
    drawNotesHandCanvas();
    scheduleAutoSave();
  }

  // #6: checked on scroll and while actively drawing -- "approaching the
  // lower portion of the document" is whichever of those two moments
  // happens first, so expansion feels responsive regardless of exactly
  // how the user got near the edge.
  function notesHandMaybeGrowForScroll() {
    if (!notesHandCanvasEl) return;
    var rect = notesHandCanvasEl.getBoundingClientRect();
    var viewportBottom = window.innerHeight || document.documentElement.clientHeight;
    if (rect.bottom - viewportBottom < NOTES_HAND_BOTTOM_BUFFER) {
      notesHandEnsureDocHeight((notes.hand.docHeight || NOTES_HAND_MIN_DOC_HEIGHT) + NOTES_HAND_BOTTOM_BUFFER);
    }
  }

  function notesHandDrawOneStroke(ctx, points) {
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (var i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
  }

  function drawNotesHandCanvas() {
    if (!notesHandCtx || !notesHandCanvasEl) return;
    var dpr = notesHandCappedDpr();
    var cssW = notesHandCanvasEl.width / dpr;
    var cssH = notesHandCanvasEl.height / dpr;
    var ctx = notesHandCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1c3a52';
    ctx.lineWidth = NOTES_HAND_STROKE_WIDTH;
    notes.hand.strokes.forEach(function (s) { notesHandDrawOneStroke(ctx, s.points); });
    if (notesHandDraft && notesHandDraft.mode === 'draw' && notesHandDraft.points.length > 1) {
      notesHandDrawOneStroke(ctx, notesHandDraft.points);
    }
  }

  function notesHandPushUndoSnapshot() {
    notesHandUndoStack.push(notes.hand.strokes.slice());
    if (notesHandUndoStack.length > NOTES_HAND_UNDO_LIMIT) notesHandUndoStack.shift();
  }

  // #13: Undo is based on completed strokes regardless of where they sit
  // vertically -- it just pops the whole strokes array back to its prior
  // snapshot, exactly like Footprint's own undo, with no dependency on
  // current scroll position at all.
  function notesHandUndo() {
    if (!notesHandUndoStack.length) return;
    notes.hand.strokes = notesHandUndoStack.pop();
    scheduleAutoSave();
    render();
  }

  // Mild input smoothing: reuses classifyStroke()'s sibling
  // smoothFreehandPoints() exactly as-is -- it's already a generic pure
  // function over any points array, not Footprint-specific -- and never
  // calls classifyStroke() itself, so a hand note is never straightened
  // into a clean line no matter how line-like it looks.
  function notesHandCommitDraft(draft) {
    var pts = draft.points;
    if (pts.length < 2) return;
    var pathLenPx = 0;
    for (var i = 1; i < pts.length; i++) {
      pathLenPx += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    if (pathLenPx < NOTES_HAND_NOISE_SCREEN_PX) return;
    notesHandPushUndoSnapshot();
    notes.hand.strokes.push({ id: generateNotesStrokeId(), points: smoothFreehandPoints(pts) });
    scheduleAutoSave();
  }

  function notesHandStrokeHit(s, p, radius) {
    var pts = s.points;
    if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y) <= radius;
    for (var i = 1; i < pts.length; i++) {
      if (footprintDistToSegment(p, pts[i - 1], pts[i]) <= radius) return true;
    }
    return false;
  }

  // Same lazy-snapshot-on-first-hit convention as footprintEraseAt() --
  // one erase gesture, however many strokes it actually removes, is one
  // undo step. #14: correct regardless of document depth, since the hit
  // point is already in the same document-space coordinates every
  // stroke's own points are stored in -- no separate depth-aware logic
  // needed.
  function notesHandEraseAt(clientX, clientY) {
    var dp = notesHandScreenToDoc(clientX, clientY);
    var r = Math.max(14, NOTES_HAND_STROKE_WIDTH * 4);
    var changedAny = false;
    var kept = [];
    notes.hand.strokes.forEach(function (s) {
      if (notesHandStrokeHit(s, dp, r)) {
        if (!notesHandDraft.snapshotTaken) {
          notesHandPushUndoSnapshot();
          notesHandDraft.snapshotTaken = true;
        }
        changedAny = true;
      } else {
        kept.push(s);
      }
    });
    if (changedAny) {
      notes.hand.strokes = kept;
      drawNotesHandCanvas();
    }
  }

  // #15: clears every stroke in the entire continuous document, never
  // just whatever's currently scrolled into view -- notes.hand.strokes
  // is simply the whole document's content, with no separate "visible
  // portion" concept anywhere in the data model. Confirmation required
  // (window.confirm()'s own semantics already guarantee Cancel leaves
  // everything untouched); pushes an undo snapshot first, so a confirmed
  // Clear can still be recovered by Undo. No-op (no dialog at all) when
  // there's nothing to clear.
  function notesHandClear() {
    if (!notes.hand.strokes.length) return;
    if (!window.confirm('Clear all handwritten notes?')) return;
    notesHandPushUndoSnapshot();
    notes.hand.strokes = [];
    scheduleAutoSave();
    render();
  }

  // A second concurrent pointer is never a supported gesture on this
  // canvas (no pan/zoom mode to fall into, unlike Footprint) -- whatever
  // single-pointer draft was in progress is discarded outright the
  // instant a second pointer arrives, and every pointer stays inert
  // until the whole gesture fully lifts. This is what keeps a resting
  // palm or an incidental second touch from smearing or continuing a
  // stroke, without needing any pinch/pan handling at all. Distinguishing
  // a genuine one-finger vertical page-scroll from one-finger drawing
  // (#8 of 22.4.2) is handled entirely by CSS `touch-action` on the
  // canvas (see .notes-hand-canvas's own comment) rather than by any
  // gesture-disambiguation logic here.
  function notesHandPointerDown(ev) {
    try { notesHandCanvasEl.setPointerCapture(ev.pointerId); } catch (e) { /* proceed uncaptured */ }
    notesHandPointers[ev.pointerId] = true;
    if (Object.keys(notesHandPointers).length >= 2) {
      notesHandDraft = null;
      return;
    }
    if (notesHandTool === 'eraser') {
      notesHandDraft = { mode: 'erase', snapshotTaken: false };
      notesHandEraseAt(ev.clientX, ev.clientY);
      return;
    }
    var dp = notesHandScreenToDoc(ev.clientX, ev.clientY);
    notesHandDraft = { mode: 'draw', points: [dp] };
    notesHandMaybeGrowForScroll();
    drawNotesHandCanvas();
  }

  function notesHandPointerMove(ev) {
    if (!(ev.pointerId in notesHandPointers)) return;
    if (Object.keys(notesHandPointers).length >= 2) return;
    if (!notesHandDraft) return;
    if (notesHandDraft.mode === 'erase') {
      notesHandEraseAt(ev.clientX, ev.clientY);
      return;
    }
    if (notesHandDraft.mode === 'draw') {
      var dp = notesHandScreenToDoc(ev.clientX, ev.clientY);
      var last = notesHandDraft.points[notesHandDraft.points.length - 1];
      if (Math.hypot(dp.x - last.x, dp.y - last.y) >= NOTES_HAND_MIN_SAMPLE_SCREEN_PX) {
        notesHandDraft.points.push(dp);
        notesHandMaybeGrowForScroll();
        drawNotesHandCanvas();
      }
    }
  }

  function notesHandEndPointer(pointerId, commit) {
    if (!(pointerId in notesHandPointers)) return;
    try { notesHandCanvasEl.releasePointerCapture(pointerId); } catch (e) { /* already released/uncaptured */ }
    delete notesHandPointers[pointerId];
    if (Object.keys(notesHandPointers).length >= 1) {
      notesHandDraft = null;
      return;
    }
    var draft = notesHandDraft;
    notesHandDraft = null;
    if (draft && draft.mode === 'draw' && commit) {
      notesHandCommitDraft(draft);
    } else if (draft && draft.mode === 'erase' && commit && draft.snapshotTaken) {
      scheduleAutoSave();
    }
    render();
  }

  function notesHandPointerUp(ev) { notesHandEndPointer(ev.pointerId, true); }
  function notesHandPointerCancel(ev) { notesHandEndPointer(ev.pointerId, false); }

  // Same belt-and-suspenders convention as footprintAbortActiveGesture()
  // -- called at the top of every toolbar/mode-toggle handler so a stray
  // canvas gesture state can never compete with a deliberate control tap.
  function notesHandAbortActiveGesture() {
    if (notesHandCanvasEl) {
      Object.keys(notesHandPointers).forEach(function (pid) {
        try { notesHandCanvasEl.releasePointerCapture(Number(pid)); } catch (e) { /* already released/uncaptured */ }
      });
    }
    notesHandPointers = {};
    notesHandDraft = null;
  }

  function notesHandComputeBounds(strokes) {
    if (!strokes.length) return null;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    strokes.forEach(function (s) {
      s.points.forEach(function (p) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });
    });
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  // Milestone 22.4.2 (#21/#22): paginated full-document rasterization for
  // PDF export -- replaces 22.4's single fit-to-one-image export (which
  // would have squashed several screens of handwriting down to one
  // unreadably tiny page). Slices the full stroke bounds into
  // NOTES_HAND_PDF_SLICE_ASPECT-proportioned chunks (roughly one letter-
  // page's printable aspect ratio each, so no single slice is itself
  // taller than one physical page), rendering one canvas per slice. Every
  // slice's canvas draws every stroke at its real, un-filtered
  // coordinates -- the canvas's own natural clipping (nothing draws
  // outside width/height) is what keeps each slice showing only its own
  // vertical range, without needing to first figure out which strokes
  // belong to which slice. Always at least one page when there's any
  // content at all.
  function notesHandRenderExportPages(notesHand) {
    var bounds = notesHandComputeBounds(notesHand.strokes);
    if (!bounds) return [];
    var pad = 24;
    var contentW = Math.max(1, bounds.maxX - bounds.minX + pad * 2);
    var contentH = Math.max(1, bounds.maxY - bounds.minY + pad * 2);
    var scale = Math.min(2, NOTES_HAND_PDF_TARGET_WIDTH / contentW);
    var sliceHeightDoc = contentW * NOTES_HAND_PDF_SLICE_ASPECT;
    var pageCount = Math.max(1, Math.ceil(contentH / sliceHeightDoc));
    var canvases = [];
    for (var i = 0; i < pageCount; i++) {
      var sliceTop = i * sliceHeightDoc;
      var sliceBottom = Math.min(contentH, sliceTop + sliceHeightDoc);
      var sliceH = Math.max(1, sliceBottom - sliceTop);
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(contentW * scale));
      canvas.height = Math.max(1, Math.round(sliceH * scale));
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.translate((pad - bounds.minX) * scale, (pad - bounds.minY - sliceTop) * scale);
      ctx.scale(scale, scale);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1c3a52';
      ctx.lineWidth = NOTES_HAND_STROKE_WIDTH;
      notesHand.strokes.forEach(function (s) {
        if (s.points.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(s.points[0].x, s.points[0].y);
        for (var j = 1; j < s.points.length; j++) ctx.lineTo(s.points[j].x, s.points[j].y);
        ctx.stroke();
      });
      canvases.push(canvas);
    }
    return canvases;
  }

  function notesHandExportImagePages(notesHand) {
    var canvases = notesHandRenderExportPages(notesHand);
    if (!canvases.length) return Promise.resolve([]);
    return Promise.all(canvases.map(function (canvas) {
      return new Promise(function (resolve) {
        canvas.toBlob(function (blob) { resolve(blob); }, 'image/png');
      });
    }));
  }

  // Milestone 22.4.2 (#16/#17): grows the textarea to fit its content
  // exactly (no internal scrollbar of its own) so the surrounding Notes
  // page scrolls naturally instead -- the standard reset-then-measure
  // technique (collapse to 'auto' so scrollHeight reports the content's
  // *natural* height rather than whatever the previous fixed height was,
  // then set height to that measured value). NOTES_TEXT_MIN_HEIGHT_PX
  // keeps a short/empty note from collapsing to an awkwardly small tap
  // target. Only ever touches this element's own height style -- never
  // its value, scroll position, or focus -- so it's safe to call on
  // every keystroke without risking cursor/selection loss (#18).
  function notesTextAutoSize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.max(textarea.scrollHeight, NOTES_TEXT_MIN_HEIGHT_PX) + 'px';
  }

  function renderNotesTabHtml() {
    var warningHtml = dbUnavailable
      ? '<div class="shell-note error">Notes save/load isn\'t available in this browser ' +
        '(IndexedDB is blocked or unsupported).</div>'
      : '';
    var modeToggleHtml =
      '<div class="notes-mode-toggle">' +
        '<button type="button" class="notes-mode-btn' + (notesMode === 'text' ? ' active' : '') +
          '" data-role="notes-mode-text" aria-pressed="' + (notesMode === 'text') + '">Text</button>' +
        '<button type="button" class="notes-mode-btn' + (notesMode === 'hand' ? ' active' : '') +
          '" data-role="notes-mode-hand" aria-pressed="' + (notesMode === 'hand') + '">Hand</button>' +
      '</div>';
    if (notesMode === 'hand') {
      return warningHtml + modeToggleHtml +
        '<div class="footprint-toolbar notes-hand-toolbar">' +
          '<div class="footprint-tool-group">' +
            '<button type="button" class="footprint-tool-btn' + (notesHandTool === 'pencil' ? ' active' : '') +
              '" data-role="notes-hand-tool-pencil" aria-pressed="' + (notesHandTool === 'pencil') + '" aria-label="Pencil">Pencil</button>' +
            '<button type="button" class="footprint-tool-btn' + (notesHandTool === 'eraser' ? ' active' : '') +
              '" data-role="notes-hand-tool-eraser" aria-pressed="' + (notesHandTool === 'eraser') + '" aria-label="Eraser">Eraser</button>' +
          '</div>' +
          '<div class="footprint-tool-group">' +
            '<button type="button" class="footprint-tool-btn" data-role="notes-hand-undo" aria-label="Undo"' +
              (notesHandUndoStack.length ? '' : ' disabled') + '>Undo</button>' +
            '<button type="button" class="footprint-tool-btn footprint-tool-btn-danger" data-role="notes-hand-clear" aria-label="Clear">Clear</button>' +
          '</div>' +
        '</div>' +
        '<canvas id="notes-hand-canvas" class="notes-hand-canvas" aria-label="Handwritten notes canvas"></canvas>';
    }
    return warningHtml + modeToggleHtml +
      '<textarea class="notes-text-area" data-role="notes-text" placeholder="Inspection notes…" aria-label="Inspection notes">' +
        esc(notes.text) + '</textarea>';
  }

  // Re-wired fresh every render(), same convention as
  // wireFootprintTabControls() -- the tab's markup (textarea vs. canvas)
  // is fully replaced on every mode switch, so there is never a stale
  // handler left over from the other mode to worry about.
  function wireNotesTabControls() {
    var textModeBtn = document.querySelector('[data-role="notes-mode-text"]');
    var handModeBtn = document.querySelector('[data-role="notes-mode-hand"]');
    if (textModeBtn) {
      textModeBtn.onclick = function () {
        notesHandAbortActiveGesture();
        if (notesMode === 'text') return;
        notesMode = 'text';
        render();
      };
    }
    if (handModeBtn) {
      handModeBtn.onclick = function () {
        if (notesMode === 'hand') return;
        notesMode = 'hand';
        render();
      };
    }

    if (notesMode === 'text') {
      var textarea = document.querySelector('[data-role="notes-text"]');
      // Plain oninput mutation + scheduleAutoSave(), deliberately never a
      // render() here -- the exact FN-011 double-tap/lost-focus defect
      // class this file's Text/LongText fields already avoid the same
      // way (see the "Text/LongText update `values` on every keystroke
      // without re-rendering" comment below) -- a full render() mid-type
      // would destroy this very textarea and drop keyboard focus, cursor
      // position, and any active selection.
      if (textarea) {
        textarea.oninput = function () {
          notes.text = textarea.value;
          scheduleAutoSave();
          notesTextAutoSize(textarea);
        };
        // #17's "recompute safely after loading an existing inspection"
        // -- sizes correctly for whatever content this render() already
        // populated the textarea with (switching into Notes, switching
        // Hand->Text, or a fresh inspection load), not just future typing.
        notesTextAutoSize(textarea);
      }
      if (!notesTextResizeListenerAdded) {
        notesTextResizeListenerAdded = true;
        window.addEventListener('resize', function () {
          var ta = document.querySelector('[data-role="notes-text"]');
          if (ta) notesTextAutoSize(ta);
        });
      }
      return;
    }

    notesHandCanvasEl = document.getElementById('notes-hand-canvas');
    if (notesHandCanvasEl) {
      setupNotesHandCanvasBackingStore();
      notesHandPointers = {};
      drawNotesHandCanvas();
      notesHandCanvasEl.onpointerdown = notesHandPointerDown;
      notesHandCanvasEl.onpointermove = notesHandPointerMove;
      notesHandCanvasEl.onpointerup = notesHandPointerUp;
      notesHandCanvasEl.onpointercancel = notesHandPointerCancel;
      notesHandCanvasEl.onlostpointercapture = notesHandPointerCancel;
    }

    if (!notesHandResizeListenerAdded) {
      notesHandResizeListenerAdded = true;
      window.addEventListener('resize', function () {
        var el = document.getElementById('notes-hand-canvas');
        if (!el) return;
        notesHandCanvasEl = el;
        setupNotesHandCanvasBackingStore();
        drawNotesHandCanvas();
      });
    }

    // Milestone 22.4.2 (#5/#6): the one listener that makes the notebook
    // feel endless -- self-guarding via the same "look up the element
    // fresh, no-op if this tab isn't currently showing it" convention as
    // the resize listener just above, added once, ever, for the whole
    // page's lifetime.
    if (!notesHandScrollListenerAdded) {
      notesHandScrollListenerAdded = true;
      window.addEventListener('scroll', function () {
        var el = document.getElementById('notes-hand-canvas');
        if (!el) return;
        notesHandCanvasEl = el;
        notesHandMaybeGrowForScroll();
      }, { passive: true });
    }

    Array.prototype.forEach.call(document.querySelectorAll('[data-role^="notes-hand-tool-"]'), function (btn) {
      btn.onclick = function () {
        notesHandAbortActiveGesture();
        notesHandTool = btn.dataset.role === 'notes-hand-tool-eraser' ? 'eraser' : 'pencil';
        render();
      };
    });

    var undoBtn = document.querySelector('[data-role="notes-hand-undo"]');
    if (undoBtn) undoBtn.onclick = function () { notesHandAbortActiveGesture(); notesHandUndo(); };

    var clearBtn = document.querySelector('[data-role="notes-hand-clear"]');
    if (clearBtn) clearBtn.onclick = function () { notesHandAbortActiveGesture(); notesHandClear(); };
  }

  // The synthetic Inspection tab's content -- every inspection-
  // management and export/import action, grouped per Milestone 18 #11
  // (Inspection actions, then a separate Export/Import group), as large
  // stacked touch targets instead of the old top-bar's compact row.
  // Property Address is shown here read-only (never a second input --
  // see the address-synchronization comment at the top of this file)
  // alongside the same save-status word the compact header shows, plus
  // when that status last actually landed.
  function renderInspectionTabHtml() {
    var addr = inspectionAddressLabel();
    var updated = (activeInspection && activeInspection.updatedAt) ? formatDate(activeInspection.updatedAt) : '';
    // Disabled while genuinely restoring, and also while settled into a
    // Restore Error with no activeInspection at all (the blocked-storage
    // case) -- these actions cannot succeed in either state, and a
    // visibly greyed-out button is clearer than one that looks tappable
    // but only ever alerts (see ensureBootReadyForAction()).
    var disabledAttr = (bootState === 'restoring' || (bootState === 'error' && !activeInspection)) ? ' disabled' : '';
    var warningHtml = dbUnavailable
      ? '<div class="shell-note error">Inspection save/load isn\'t available in this browser ' +
        '(IndexedDB is blocked or unsupported) -- changes will only last for this session.</div>'
      : '';
    // Milestone 22.4.1 (#30): Retry is deliberately the ONLY new control
    // here -- non-destructive (retryBootRestore() only clears an
    // in-memory cached Promise reference, never storage), shown solely
    // while bootState === 'error' so it can never be tapped mid-restore
    // or once things are already working.
    var retryHtml = bootState === 'error'
      ? '<div class="insp-tab-group"><button type="button" class="insp-tab-btn" data-role="insp-retry">Retry</button></div>'
      : '';
    var addrErrorClass = (bootState === 'error' && !activeInspection) ? ' error' : '';
    return warningHtml +
      '<div class="insp-tab-section">' +
        '<div class="insp-tab-address' + addrErrorClass + '">' + esc(addr) + '</div>' +
        '<div class="insp-tab-status">' + esc(saveStatusLabel()) +
          (updated ? ' &middot; Last saved ' + esc(updated) : '') + '</div>' +
      '</div>' +
      retryHtml +
      '<div class="insp-tab-group">' +
        '<button type="button" class="insp-tab-btn" data-role="insp-new">New Inspection</button>' +
        '<button type="button" class="insp-tab-btn" data-role="insp-load">Load Inspection</button>' +
        '<button type="button" class="insp-tab-btn" data-role="insp-save"' + disabledAttr + '>Save Now</button>' +
        '<button type="button" class="insp-tab-btn insp-tab-btn-danger" data-role="insp-reset"' + disabledAttr + '>Reset Current Inspection</button>' +
      '</div>' +
      '<div class="insp-tab-heading">Export / Import</div>' +
      '<div class="insp-tab-group">' +
        '<button type="button" class="insp-tab-btn" data-role="insp-export-pdf"' + disabledAttr + '>Export PDF</button>' +
        '<button type="button" class="insp-tab-btn" data-role="insp-export"' + disabledAttr + '>Export JSON</button>' +
        '<button type="button" class="insp-tab-btn" data-role="insp-import">Import JSON</button>' +
      '</div>' +
      '<input type="file" accept=".json,application/json" data-role="import-json-input" hidden>';
  }

  function wireInspectionTabControls() {
    var retryBtn = document.querySelector('[data-role="insp-retry"]');
    if (retryBtn) retryBtn.onclick = retryBootRestore;
    var newBtn = document.querySelector('[data-role="insp-new"]');
    if (newBtn) newBtn.onclick = handleNewInspectionClick;
    var saveBtn = document.querySelector('[data-role="insp-save"]');
    if (saveBtn) saveBtn.onclick = handleSaveInspectionClick;
    var loadBtn = document.querySelector('[data-role="insp-load"]');
    if (loadBtn) loadBtn.onclick = handleLoadInspectionClick;
    var resetBtn = document.querySelector('[data-role="insp-reset"]');
    if (resetBtn) resetBtn.onclick = handleResetInspectionClick;
    var exportBtn = document.querySelector('[data-role="insp-export"]');
    if (exportBtn) exportBtn.onclick = handleExportInspectionClick;
    var exportPdfBtn = document.querySelector('[data-role="insp-export-pdf"]');
    if (exportPdfBtn) exportPdfBtn.onclick = handleExportPdfClick;
    var importBtn = document.querySelector('[data-role="insp-import"]');
    var importInput = document.querySelector('[data-role="import-json-input"]');
    if (importBtn && importInput) {
      importBtn.onclick = function () { importInput.click(); };
      importInput.onchange = function () {
        var file = importInput.files && importInput.files[0];
        importInput.value = '';
        if (file) handleImportFile(file);
      };
    }
  }

  // Called by every control's own interaction handler (option click,
  // counter click, text/textarea focus) right before that handler does
  // its normal job -- so a field becomes active on the exact same tap
  // that also runs its control action, never a tap later. Switching to a
  // *different* field closes whatever note was open (only one field's
  // action area is ever expanded at a time); re-touching the field
  // that's already active is a no-op, so an already-open note stays open
  // while you keep typing in that same field's own control.
  function setActiveField(id) {
    if (activeFieldId === id) return;
    activeFieldId = id;
    if (noteOpenFieldId !== id) {
      noteOpenFieldId = null;
    }
    if (photoOpenFieldId !== id) {
      photoOpenFieldId = null;
    }
  }

  // Text/LongText controls call this from onfocus instead of going
  // through setActiveField()+render(). A full render() rebuilds every
  // field's markup from scratch, which would destroy the very input the
  // user just tapped into and drop keyboard focus -- exactly the
  // double-tap defect this milestone must not reintroduce (see FN-011 in
  // production Clipboard). So this updates the same state
  // setActiveField() does, then patches only the `active` class and the
  // note area's [hidden] attribute directly on the existing DOM nodes,
  // leaving every input element (and its focus/cursor position)
  // untouched. Safe to call unconditionally on every focus event since
  // setActiveField() itself no-ops when the field is already active.
  function activateFieldNoRender(id) {
    if (activeFieldId === id) return;
    setActiveField(id);
    Array.prototype.forEach.call(document.querySelectorAll('.field.active'), function (el) {
      el.classList.remove('active');
    });
    var el = document.querySelector('.field[data-field-id="' + id + '"]');
    if (el) el.classList.add('active');
    // setActiveField() just nulled noteOpenFieldId/photoOpenFieldId (id
    // differs from the previous activeFieldId here, or this function
    // would have returned above), so no note or photo panel anywhere
    // should stay open.
    Array.prototype.forEach.call(
      document.querySelectorAll('.field-note:not([hidden]), .photo-panel:not([hidden])'),
      function (n) { n.hidden = true; }
    );
  }

  // Exact, case-sensitive match only -- "Other Material" or
  // "Other/Unknown" are different strings and must not qualify. Applies
  // to Button, MultiSelect, and MultiSelect Dropdown only; other input
  // types never call this.
  function hasOtherOption(f) {
    return Array.isArray(f.options) && f.options.indexOf(OTHER_OPTION) !== -1;
  }

  function isOtherSelected(f) {
    var current = values[f.id];
    return isMultiSelectInputType(f.type)
      ? Array.isArray(current) && current.indexOf(OTHER_OPTION) !== -1
      : current === OTHER_OPTION;
  }

  // Deterministic collapsed-trigger summary for MultiSelect Dropdown --
  // 0 selections: "Select…"; 1: the full label; 2: both, joined; 3+: the
  // first two plus a "+N" count of the rest. No selections stays sorted
  // in the order the user picked them (same order stored in `values`,
  // never re-sorted to match option order) so "+N" always genuinely
  // means "N more you don't see here" rather than an arbitrary subset.
  // Long labels are left to CSS (.msd-trigger-text's ellipsis) rather
  // than measured/truncated here -- a fixed-width JS truncation would
  // still need a font-metrics guess, and would be wrong the moment the
  // trigger's own width changes (narrow phone vs. wide tablet).
  function msdSummaryText(arr) {
    if (!arr.length) return 'Select…';
    if (arr.length === 1) return arr[0];
    if (arr.length === 2) return arr[0] + ', ' + arr[1];
    return arr[0] + ', ' + arr[1] + ' +' + (arr.length - 2);
  }

  // Rendered directly beneath a Button/MultiSelect's option list
  // (called from controlHtml itself, so it's automatically present in
  // MAIN fields, Dynamic FOLLOW_UP fields, and Exit Interview FOLLOW_UP
  // fields alike -- all three already go through controlHtml). Renders
  // nothing at all when Other isn't currently selected, so the previous
  // text stays in `otherText` untouched but simply isn't on screen --
  // reselecting Other repopulates the input from that same map.
  function otherInputHtml(f) {
    if (!hasOtherOption(f) || !isOtherSelected(f)) return '';
    return '<div class="other-input">' +
      '<label>Other:</label>' +
      '<input type="text" data-role="other-text" value="' + esc(otherText[f.id] || '') + '">' +
      '</div>';
  }

  // Compact secondary-action row for a field's upper-right corner --
  // always present in the markup so wireFields() only has to wire its
  // click handlers once, but hidden by CSS (`.field-actions` has no
  // `display` unless its `.field` ancestor carries `.active`) unless
  // this field is the one currently active. Two actions as of Milestone
  // 14: More Text/Note (Milestone 13) and Photo -- Dictation/Sketch
  // remain explicitly out of scope, and this is deliberately not the
  // same thing as the workbook's unused `Camera` INPUT TYPE (a field
  // whose own answer is a photo; this is an auxiliary action any field
  // gets regardless of its own type).
  function fieldActionsHtml(id) {
    var photoCount = (photosByField[id] || []).length;
    var photoLabel = 'Photo' + (photoCount ? ' (' + photoCount + ')' : '');
    return '<div class="field-actions">' +
      '<button type="button" class="field-action-btn" data-role="more-text-toggle" ' +
        'aria-label="More Text / Note" aria-pressed="' + (noteOpenFieldId === id ? 'true' : 'false') +
        '" title="More Text / Note">&#128221;</button>' +
      '<button type="button" class="field-action-btn" data-role="photo-toggle" ' +
        'aria-label="' + esc(photoLabel) + '" aria-pressed="' + (photoOpenFieldId === id ? 'true' : 'false') +
        '" title="' + esc(photoLabel) + '">&#128247;' +
        (photoCount ? '<span class="action-count">' + photoCount + '</span>' : '') +
      '</button>' +
    '</div>';
  }

  // Supplemental note textarea -- like the action icon, always rendered
  // (so its oninput handler only needs wiring once) but hidden via
  // [hidden] unless this field's note is the one currently open.
  // Toggling [hidden] never destroys/recreates the textarea node, so
  // notes are never lost or displaced by a render(). The note is purely
  // optional and never substitutes for the field's own answer -- it's
  // read from and written to `fieldNotes[id]` only, never `values`.
  function fieldNoteHtml(id) {
    return '<div class="field-note"' + (noteOpenFieldId === id ? '' : ' hidden') + '>' +
      '<label>More Text / Note</label>' +
      '<textarea data-role="field-note-text">' + esc(fieldNotes[id] || '') + '</textarea>' +
      '</div>';
  }

  // Photo panel -- same always-present/[hidden]-toggled pattern as
  // fieldNoteHtml, for the same reason: activateFieldNoRender() (the
  // no-full-render text-focus path) needs an existing DOM node it can
  // hide directly when a *different* field becomes active, without
  // rebuilding markup. Thumbnails come straight from photosByField (no
  // decoding here, just <img src> against an already-created object
  // URL). "Photo Library" and "Take Photo" are two separate file inputs
  // (see wireFields()) so capture="environment" never leaks onto the
  // library-picker path -- tapping the field's Photo icon always opens
  // this panel, never the camera directly; Photo Library is listed
  // first/primary since "access to photos already on the device" is
  // this action's baseline guarantee, Take Photo the secondary option
  // for capturing something new.
  function photoPanelHtml(id) {
    var photos = photosByField[id] || [];
    var thumbsHtml = photos.map(function (p) {
      return '<div class="photo-thumb">' +
        '<img src="' + esc(p.thumbnailUrl) + '" alt="" data-role="photo-view" data-photo-id="' + esc(p.id) + '">' +
        '<button type="button" class="photo-delete-btn" data-role="photo-delete" ' +
          'data-photo-id="' + esc(p.id) + '" aria-label="Delete photo">&times;</button>' +
        '</div>';
    }).join('');
    var bodyHtml;
    if (dbUnavailable) {
      bodyHtml = '<div class="shell-note error">Photos aren\'t available in this browser ' +
        '(IndexedDB is blocked or unsupported).</div>';
    } else {
      bodyHtml = (thumbsHtml ? '<div class="photo-strip">' + thumbsHtml + '</div>' : '') +
        '<div class="photo-add-row">' +
          '<button type="button" class="photo-add-btn" data-role="photo-library">Photo Library</button>' +
          '<button type="button" class="photo-add-btn" data-role="take-photo">Take Photo</button>' +
        '</div>' +
        '<input type="file" accept="image/*" multiple data-role="photo-library-input" hidden>' +
        '<input type="file" accept="image/*" capture="environment" data-role="take-photo-input" hidden>';
    }
    return '<div class="photo-panel"' + (photoOpenFieldId === id ? '' : ' hidden') + '>' +
      '<label>Photos' + (photos.length ? ' (' + photos.length + ')' : '') + '</label>' +
      bodyHtml +
      '</div>';
  }

  function $(sel) {
    return document.querySelector(sel);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fieldsForTab(tab) {
    return CFG.main.fields.filter(function (f) { return f.tab === tab; });
  }

  // Renders the control for a single field based on its INPUT TYPE.
  // Only Text, LongText, Button, MultiSelect, and Counter are known --
  // those are the only types MAIN actually contains. Anything else
  // (a future workbook type this build hasn't been taught yet) falls
  // through to a visible "unsupported" note instead of guessing.
  function controlHtml(f) {
    var id = f.id;
    var current = values[id];

    if (f.type === 'Text') {
      return '<input type="text" data-role="text" value="' + esc(current || '') + '">';
    }

    if (f.type === 'LongText') {
      return '<textarea data-role="textarea">' + esc(current || '') + '</textarea>';
    }

    // Button = single-select (radio-like: exactly one option, or none).
    // MultiSelect = independently toggleable (checkbox-like: any number
    // of options at once). Both come from the same ANSWERS list format
    // (semicolon-separated), only the selection behavior differs.
    if (f.type === 'Button' || f.type === 'MultiSelect') {
      var multi = f.type === 'MultiSelect';
      return '<div class="ctrl-options">' + f.options.map(function (o) {
        var isActive = multi
          ? Array.isArray(current) && current.indexOf(o) !== -1
          : current === o;
        return '<button type="button" class="opt-btn' + (isActive ? ' active' : '') +
          '" data-role="option" data-multi="' + (multi ? '1' : '0') +
          '" data-value="' + esc(o) + '">' + esc(o) + '</button>';
      }).join('') + '</div>' + otherInputHtml(f);
    }

    // Milestone 22.4.4: compact presentation variant of MultiSelect --
    // same canonical answer (an array of selected option strings,
    // toggled independently), but the always-visible button list is
    // replaced with a single collapsed trigger showing a short summary;
    // the actual option rows only exist in the popover sheet rendered
    // by renderMsdSheet() (see openMsdSheet()/wireFields()). Never a
    // native <select multiple> -- see renderMsdSheet() for why.
    if (f.type === 'MultiSelect Dropdown') {
      var msdArr = Array.isArray(current) ? current : [];
      return '<button type="button" class="msd-trigger" data-role="msd-trigger" data-field-id="' +
        esc(id) + '" aria-haspopup="true" aria-expanded="' + (msdOpenFieldId === id ? 'true' : 'false') + '">' +
        '<span class="msd-trigger-text">' + esc(msdSummaryText(msdArr)) + '</span>' +
        '<span class="msd-trigger-caret" aria-hidden="true">&#9662;</span>' +
        '</button>' + otherInputHtml(f);
    }

    if (f.type === 'Counter') {
      var n = Number(current || 0);
      return '<div class="ctrl-counter">' +
        '<button type="button" class="counter-btn" data-role="counter-delta" data-delta="-1">&minus;</button>' +
        '<span class="counter-value">' + n + '</span>' +
        '<button type="button" class="counter-btn" data-role="counter-delta" data-delta="1">+</button>' +
        '</div>';
    }

    // New this milestone -- FOLLOW_UP's Association Fee / Special
    // Assessment Fee are Currency. Kept as a plain text input (no
    // formatting/validation) since nothing asked for more than that yet.
    if (f.type === 'Currency') {
      return '<input type="text" inputmode="decimal" data-role="text" placeholder="$0.00" value="' + esc(current || '') + '">';
    }

    return '<div class="unsupported-note">Unsupported input type: ' + esc(f.type) + '</div>';
  }

  function findFollowUpGroup(groupName) {
    var groups = (CFG.followUp && CFG.followUp.groups) || [];
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].group === groupName) return groups[i];
    }
    return null;
  }

  // The GROUP column is a machine identifier (pud_association,
  // roof_updated) -- fine for the workbook/config, not for a screen
  // someone's reading in full sun. This is a purely cosmetic, generic
  // transform (underscore -> space, capitalize each word); it doesn't
  // touch the identifier itself, so nothing else that keys off of
  // groupName (matching, activation, persistence) is affected. It won't
  // capitalize acronyms correctly (pud_association -> "Pud
  // Association", not "PUD Association") -- fixing that generically
  // would mean guessing which words are acronyms, so it's left as a
  // known limitation rather than hardcoding an exceptions list.
  function humanizeGroupName(groupName) {
    return String(groupName || '').split('_').filter(function (w) { return w; })
      .map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); })
      .join(' ');
  }

  // Shared field-list markup for a list of FOLLOW_UP questions.
  // controlHtml() works unchanged here since a FOLLOW_UP question has
  // the same {id, type, options} shape as a MAIN field -- only
  // "group"/"label"/"destination" differ, and controlHtml doesn't touch
  // those.
  function followUpFieldsHtml(questions) {
    return questions.map(function (q) {
      return '<div class="field followup-field' + (activeFieldId === q.id ? ' active' : '') +
        '" data-field-id="' + esc(q.id) + '">' +
        fieldActionsHtml(q.id) +
        '<label>' + esc(q.label) + '</label>' +
        controlHtml(q) +
        fieldNoteHtml(q.id) +
        photoPanelHtml(q.id) +
        '</div>';
    }).join('');
  }

  // showWhenQuestionId is resolved server-side (generate.py's
  // resolve_show_when()) to a sibling question's id, scoped to the same
  // group -- the shell only ever does a `values` lookup by id, never
  // name matching. Three states:
  //   - no condition (showWhenQuestionId null, showWhenInvalid false):
  //     always visible.
  //   - unresolvable condition (showWhenInvalid true -- SHOW WHEN VALUE
  //     without SHOW WHEN QUESTION, or SHOW WHEN QUESTION naming zero or
  //     more than one sibling): always hidden, never guessed at (see
  //     CFG.followUp.showWhenWarnings for reporting).
  //   - resolved condition: visible only while the sibling's current
  //     value satisfies showWhenValue, via the same matchesConfiguredValues()
  //     helper the MAIN trigger engine uses below -- an array-valued
  //     (MultiSelect/MultiSelect Dropdown) parent is fully supported as
  //     of Milestone 22.4.5 (previously scalar-only, see
  //     pdfIsShowWhenSatisfied()'s comment for the bug this fixed).
  function isShowWhenSatisfied(q) {
    if (q.showWhenInvalid) return false;
    if (!q.showWhenQuestionId) return true;
    return matchesConfiguredValues(values[q.showWhenQuestionId], q.showWhenValue);
  }

  // DESTINATION is set per FOLLOW_UP row, not per group -- a group
  // could (in principle) mix Dynamic and Exit Interview questions, so
  // each render path filters by its own destination rather than
  // assuming one destination for the whole group. Anything with a
  // blank/unrecognized destination matches neither filter and simply
  // never renders (see CFG.followUp.invalidDestinations for reporting).
  // SHOW WHEN filtering applies identically regardless of destination.
  //
  // This list is also what decides whether a group counts as an "Exit
  // Interview group" at all for badge/Disregard purposes -- a group
  // with zero currently-visible Exit Interview questions (either because
  // it's Dynamic-only, or every Exit Interview question in it is
  // currently hidden by an unsatisfied SHOW WHEN) contributes nothing to
  // the count and never shows a Disregard control, without needing any
  // separate "is this an Exit Interview group" flag.
  function exitInterviewQuestions(groupName) {
    var group = findFollowUpGroup(groupName);
    return group ? group.questions.filter(function (q) {
      return q.destination === 'Exit Interview' && isShowWhenSatisfied(q);
    }) : [];
  }

  // Disregard only applies to the Exit Interview rendering of a group --
  // a group's Dynamic questions (dynamicGroupHtml, unchanged below)
  // always render regardless of Disregard status, since Disregard is
  // specifically about Exit Interview alert management.
  function exitInterviewGroupHtml(groupName) {
    var questions = exitInterviewQuestions(groupName);
    if (!questions.length) return '';
    return '<div class="followup-block" data-ei-group="' + esc(groupName) + '">' +
      '<div class="followup-heading-row">' +
        '<div class="followup-heading">' + esc(humanizeGroupName(groupName)) + '</div>' +
        '<button type="button" class="disregard-btn" data-role="disregard" data-group="' +
          esc(groupName) + '">Disregard</button>' +
      '</div>' +
      followUpFieldsHtml(questions) +
      '</div>';
  }

  function dynamicGroupHtml(groupName) {
    var group = findFollowUpGroup(groupName);
    var questions = group ? group.questions.filter(function (q) {
      return q.destination === 'Dynamic' && isShowWhenSatisfied(q);
    }) : [];
    if (!questions.length) return '';
    return '<div class="followup-block nested">' +
      '<div class="followup-heading">' + esc(humanizeGroupName(groupName)) + '</div>' +
      followUpFieldsHtml(questions) +
      '</div>';
  }

  // Active groups that currently have visible Exit Interview content and
  // are not disregarded -- this is both "what renders in the main Exit
  // Interview list" and "what the badge counts", so the two can never
  // drift apart.
  function unresolvedExitInterviewGroups() {
    return activeFollowUpGroups().filter(function (g) {
      return !isGroupDisregarded(g) && exitInterviewQuestions(g).length > 0;
    });
  }

  // Active, disregarded groups that still have Exit Interview content --
  // this is what backs the collapsed "Disregarded (N)" section. Scoped
  // to *active* groups so that a group whose trigger has gone inactive
  // (values preserved, Disregard status preserved, per Milestone 10 #6)
  // simply drops out of view entirely until it's active again, instead
  // of cluttering the disregarded list with things that aren't even
  // showing right now.
  function disregardedActiveGroups() {
    return activeFollowUpGroups().filter(function (g) {
      return isGroupDisregarded(g) && exitInterviewQuestions(g).length > 0;
    });
  }

  function fieldHtml(f) {
    // data-urar preserves URAR through to the DOM even though nothing
    // displays it yet -- the requirement was to preserve it in the data
    // model, not to design a URAR-based UI in this milestone.
    var reminderHtml = f.reminder
      ? '<div class="field-reminder">' + esc(f.reminder) + '</div>'
      : '';

    // Dynamic follow-up content renders directly inside the triggering
    // field's own card, but only under the group's first active source
    // field (see activeSourceFieldsForGroup) -- otherwise a group
    // shared by several MAIN fields (e.g. bathrooms_updated) would
    // render its Dynamic questions once per active source instead of
    // once total.
    var dynamicHtml = '';
    if (f.followUpGroup) {
      var sources = activeSourceFieldsForGroup(f.followUpGroup);
      if (sources.length && sources[0].id === f.id) {
        dynamicHtml = dynamicGroupHtml(f.followUpGroup);
      }
    }

    return '<div class="field' + (activeFieldId === f.id ? ' active' : '') +
      '" data-field-id="' + esc(f.id) + '" data-urar="' + esc(f.urar) + '">' +
      fieldActionsHtml(f.id) +
      '<label>' + esc(f.label) + '</label>' +
      reminderHtml +
      controlHtml(f) +
      dynamicHtml +
      fieldNoteHtml(f.id) +
      photoPanelHtml(f.id) +
      '</div>';
  }

  // Every MAIN field referencing groupName that currently holds one of
  // its own trigger values -- deliberately generic, no field or group
  // name named here. This is the single source of truth both
  // isFollowUpGroupActive() (does the group show at all) and
  // fieldHtml()'s Dynamic placement (which one field shows it) build on.
  //
  // A trigger field's value is a plain string for Button, a number for
  // Counter, or an array for MultiSelect/MultiSelect Dropdown -- all
  // handled uniformly by matchesConfiguredValues() (Milestone 22.4.5),
  // which also normalizes a numeric Counter value against its string
  // FOLLOW-UP TRIGGER text (`3` vs `"3"`) so a Counter can safely act as
  // a trigger source. See matchesConfiguredValues()'s own comment for
  // the full matching rules.
  function activeSourceFieldsForGroup(groupName) {
    return CFG.main.fields.filter(function (f) {
      return f.followUpGroup === groupName && matchesConfiguredValues(values[f.id], f.followUpTrigger);
    });
  }

  // A FOLLOW_UP group is active if *any* MAIN field referencing it
  // currently holds one of its own trigger values -- this is what lets
  // a group with multiple source fields (e.g. bathrooms_updated,
  // referenced by "Bathrooms Updated", "Bath Floor Updated", and "Bath
  // Wainscot Updated") stay active as long as at least one source still
  // matches.
  function isFollowUpGroupActive(groupName) {
    return activeSourceFieldsForGroup(groupName).length > 0;
  }

  // Every distinct FOLLOW-UP GROUP referenced anywhere in MAIN, in
  // first-seen row order, filtered down to the ones currently active.
  // A group referenced by several MAIN fields only appears once here
  // regardless of how many of those fields are active -- that's what
  // prevents rendering the same FOLLOW_UP group twice.
  function activeFollowUpGroups() {
    var seen = {};
    var groupNames = [];
    CFG.main.fields.forEach(function (f) {
      if (f.followUpGroup && !seen[f.followUpGroup]) {
        seen[f.followUpGroup] = true;
        groupNames.push(f.followUpGroup);
      }
    });
    return groupNames.filter(isFollowUpGroupActive);
  }

  // A blank/unrecognized DESTINATION is a workbook configuration issue,
  // not a runtime state -- shown regardless of which groups are
  // currently active, same spirit as the unsupported-INPUT-TYPE banner.
  function invalidDestinationWarningHtml() {
    var invalid = (CFG.followUp && CFG.followUp.invalidDestinations) || [];
    if (!invalid.length) return '';
    return '<div class="shell-note error">' + invalid.length +
      ' follow-up question(s) have a blank or unsupported DESTINATION and will not render until corrected in the workbook: ' +
      invalid.map(function (d) {
        return esc(d.group) + ' / ' + esc(d.label) + ' (' + esc(d.destination || '(blank)') + ')';
      }).join(', ') + '.</div>';
  }

  // Like the DESTINATION warning, an unresolvable SHOW WHEN condition is
  // a workbook configuration issue, not a runtime state -- shown
  // regardless of which groups are currently active.
  function showWhenWarningHtml() {
    var warnings = (CFG.followUp && CFG.followUp.showWhenWarnings) || [];
    if (!warnings.length) return '';
    return '<div class="shell-note error">' + warnings.length +
      ' follow-up question(s) have an invalid SHOW WHEN condition and will stay hidden until corrected in the workbook: ' +
      warnings.map(function (w) {
        return esc(w.group) + ' / ' + esc(w.label) + ' (' + esc(w.reason) + ')';
      }).join(', ') + '.</div>';
  }

  // Collapsed "Disregarded (N)" section, listing each disregarded
  // group's human-readable name with a Reopen action. Nothing renders
  // when there are none to show.
  function disregardedSummaryHtml(groups) {
    if (!groups.length) return '';
    var itemsHtml = groups.map(function (g) {
      return '<div class="disregarded-item">' +
        '<span class="disregarded-name">' + esc(humanizeGroupName(g)) + '</span>' +
        '<button type="button" class="reopen-btn" data-role="reopen" data-group="' +
          esc(g) + '">Reopen</button>' +
        '</div>';
    }).join('');
    return '<div class="disregarded-summary">' +
      '<button type="button" class="disregarded-toggle' + (disregardedListOpen ? ' open' : '') +
        '" data-role="toggle-disregarded">Disregarded (' + groups.length + ')</button>' +
      '<div class="disregarded-list"' + (disregardedListOpen ? '' : ' hidden') + '>' +
        itemsHtml +
      '</div>' +
      '</div>';
  }

  function renderExitInterviewHtml() {
    var warning = invalidDestinationWarningHtml() + showWhenWarningHtml();
    var groupsHtml = unresolvedExitInterviewGroups().map(exitInterviewGroupHtml).join('');
    if (!groupsHtml) {
      groupsHtml = '<div class="shell-note">No active follow-up items. Answer a MAIN question with a follow-up trigger to reveal a group here.</div>';
    }
    return warning + groupsHtml + disregardedSummaryHtml(disregardedActiveGroups());
  }

  function navTabs() {
    return CFG.main.tabs.concat([EXIT_INTERVIEW_TAB, PHOTOS_TAB, FOOTPRINT_TAB, NOTES_TAB, INSPECTION_TAB]);
  }

  // Milestone 22.4.2 (#23-41): single-row horizontally-scrolling ribbon
  // -- the CSS (nav.tabs{flex-wrap:nowrap;overflow-x:auto}) is what makes
  // it scroll instead of wrap; this function's only addition over the
  // pre-22.4.2 version is the scrollIntoView() call at the end (#29-31).
  // Called by every render() (tab switches, Previous/Next, boot, New/
  // Load, field interactions -- anywhere render() already ran), which
  // could in principle mean calling this far more often than the active
  // tab actually changes -- but scrollIntoView({block:'nearest',
  // inline:'nearest'}) is a true no-op whenever the target is already
  // fully visible (the native, spec-defined behavior, not something this
  // file re-implements), so this is safe and cheap to call
  // unconditionally rather than tracking "did the active tab change"
  // separately: "if already visible, leave the ribbon alone" (#29) comes
  // for free from the browser itself.
  function renderTabs() {
    var alertCount = unresolvedExitInterviewGroups().length;
    $('#tabs').innerHTML = navTabs().map(function (t) {
      var badge = (t === EXIT_INTERVIEW_TAB && alertCount > 0)
        ? '<span class="tab-badge">' + alertCount + '</span>'
        : '';
      return '<button type="button" class="' + (t === activeTab ? 'active' : '') +
        '" data-tab="' + esc(t) + '">' + esc(t) + badge + '</button>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) {
      b.onclick = function () { switchToTab(b.dataset.tab); };
    });
    var activeBtn = document.querySelector('#tabs button.active');
    if (activeBtn && activeBtn.scrollIntoView) {
      activeBtn.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
    }
  }

  // The one place that changes activeTab (Milestone 19 #3) -- used by
  // both the top nav.tabs buttons and the new bottom Previous/Next
  // buttons, so there is exactly one "switch screens" implementation to
  // keep correct. Scrolls back to the top of the page after re-rendering
  // so the new screen's first field is what the user actually sees,
  // rather than whatever vertical position they'd scrolled the previous
  // screen to -- the exact complaint that motivated adding bottom
  // navigation in the first place. activeTab is transient UI state, same
  // as activeFieldId -- never persisted, never touches values/autosave --
  // so this is always safe regardless of any pending debounced write.
  function switchToTab(tab) {
    activeTab = tab;
    render();
    window.scrollTo(0, 0);
  }

  // Reads navTabs() -- the same ordered list the top nav already renders
  // from, itself built from CFG.main.tabs + EXIT_INTERVIEW_TAB +
  // INSPECTION_TAB -- to find the current screen's neighbors, so this
  // never needs its own separate hardcoded tab order and automatically
  // stays correct if a future milestone adds another synthetic tab.
  // Previous/Next are simply omitted (not disabled-but-present) at
  // either end; the Next button's own CSS margin-left:auto keeps it
  // flush right whether or not a Previous button is present next to it,
  // so the layout never depends on which buttons exist.
  function renderBottomNavHtml() {
    var tabs = navTabs();
    var idx = tabs.indexOf(activeTab);
    var prevTab = idx > 0 ? tabs[idx - 1] : null;
    var nextTab = (idx !== -1 && idx < tabs.length - 1) ? tabs[idx + 1] : null;
    return '<nav class="bottom-nav">' +
      (prevTab
        ? '<button type="button" class="bottom-nav-btn" data-role="bottom-prev" data-tab="' + esc(prevTab) + '">&larr; Previous</button>'
        : '') +
      (nextTab
        ? '<button type="button" class="bottom-nav-btn bottom-nav-btn-next" data-role="bottom-next" data-tab="' + esc(nextTab) + '">Next &rarr;</button>'
        : '') +
      '</nav>';
  }

  function wireBottomNav() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-role="bottom-prev"], [data-role="bottom-next"]'), function (btn) {
      btn.onclick = function () { switchToTab(btn.dataset.tab); };
    });
  }

  function render() {
    renderInspectionBar();
    renderTabs();

    if (activeTab === EXIT_INTERVIEW_TAB) {
      $('#screen').innerHTML = renderExitInterviewHtml() + renderBottomNavHtml();
      wireFields();
      wireExitInterviewControls();
      wireBottomNav();
      return;
    }

    if (activeTab === PHOTOS_TAB) {
      $('#screen').innerHTML = renderPhotosTabHtml() + renderBottomNavHtml();
      wirePhotosTabControls();
      wireBottomNav();
      return;
    }

    if (activeTab === FOOTPRINT_TAB) {
      $('#screen').innerHTML = renderFootprintTabHtml() + renderBottomNavHtml();
      wireFootprintTabControls();
      wireBottomNav();
      return;
    }

    if (activeTab === NOTES_TAB) {
      $('#screen').innerHTML = renderNotesTabHtml() + renderBottomNavHtml();
      wireNotesTabControls();
      wireBottomNav();
      return;
    }

    if (activeTab === INSPECTION_TAB) {
      $('#screen').innerHTML = renderInspectionTabHtml() + renderBottomNavHtml();
      wireInspectionTabControls();
      wireBottomNav();
      return;
    }

    var unsupported = CFG.main.unsupportedTypes || [];
    var warning = unsupported.length
      ? '<div class="shell-note error">' + unsupported.length +
        ' field(s) use an INPUT TYPE this build doesn\'t render yet -- shown as a note below their label instead of a control.</div>'
      : '';

    var fields = fieldsForTab(activeTab);
    var fieldsHtml = fields.length
      ? fields.map(fieldHtml).join('')
      : '<div class="shell-note">No fields on this tab.</div>';

    $('#screen').innerHTML = warning + fieldsHtml + renderBottomNavHtml();
    wireFields();
    wireBottomNav();
  }

  // Text/LongText update `values` on every keystroke without
  // re-rendering -- a full re-render would blow away focus and cursor
  // position mid-type. Buttons and counters re-render on click since
  // they're discrete events and need their active/pressed state to
  // visibly update immediately.
  function wireFields() {
    Array.prototype.forEach.call(document.querySelectorAll('.field'), function (el) {
      var id = el.dataset.fieldId;

      // Milestone 19 #1/#2: tapping any non-control part of the card
      // (label, blank background, reminder text) activates the field --
      // reveals its Note/Photo actions and highlights the whole card --
      // without touching `values` or scheduling a save. Every inner
      // control (option/counter buttons, Note/Photo toggles, text focus)
      // already calls setActiveField()/activateFieldNoRender() itself as
      // the first step of its own handler, and a click on any of them
      // bubbles up through the DOM to this same card-level handler after
      // that inner handler has already run -- activateFieldNoRender()'s
      // own `if (activeFieldId === id) return;` guard then makes this a
      // no-op in the common case. stopPropagation() is still required,
      // though: a Dynamic FOLLOW_UP field's `.field` card is rendered
      // *nested inside* its triggering MAIN field's own `.field` card
      // (see fieldHtml()'s dynamicHtml placement), so without it a click
      // anywhere in the inner card would keep bubbling past this
      // handler to the outer MAIN field's own card-click handler, which
      // would then re-activate the *outer* field and undo the inner
      // one's correct activation. Stopping propagation here means only
      // the innermost `.field` a click actually landed in ever claims
      // activation, which is what should happen regardless of nesting.
      el.onclick = function (ev) {
        activateFieldNoRender(id);
        if (ev && ev.stopPropagation) ev.stopPropagation();
      };

      var textInput = el.querySelector('[data-role="text"]');
      if (textInput) {
        textInput.oninput = function () {
          values[id] = textInput.value;
          // Milestone 18 #6: the Property Address field is the single
          // source of truth for the inspection's own identity address
          // once one exists -- keep activeInspection.propertyAddress
          // (what the header/Inspection tab/Load list all show) in sync
          // on every keystroke, and repaint just the bar directly so it
          // never looks stale while typing without disturbing this
          // input's focus (same discipline as activateFieldNoRender()).
          if (id === ADDRESS_FIELD_ID && activeInspection) {
            activeInspection.propertyAddress = textInput.value;
            renderInspectionBar();
          }
          saveValues();
        };
        // Focusing the input IS the field's own control action (it's
        // what puts the cursor there to type) -- activation piggybacks
        // on that same first tap via activateFieldNoRender(), never a
        // second one. No render() here; see activateFieldNoRender().
        textInput.onfocus = function () { activateFieldNoRender(id); };
      }

      var textarea = el.querySelector('[data-role="textarea"]');
      if (textarea) {
        textarea.oninput = function () { values[id] = textarea.value; saveValues(); };
        textarea.onfocus = function () { activateFieldNoRender(id); };
      }

      var otherInput = el.querySelector('[data-role="other-text"]');
      if (otherInput) {
        otherInput.oninput = function () { otherText[id] = otherInput.value; saveOtherText(); };
      }

      var noteTextarea = el.querySelector('[data-role="field-note-text"]');
      if (noteTextarea) {
        noteTextarea.oninput = function () { fieldNotes[id] = noteTextarea.value; saveFieldNotes(); };
      }

      var moreTextBtn = el.querySelector('[data-role="more-text-toggle"]');
      if (moreTextBtn) {
        moreTextBtn.onclick = function () {
          setActiveField(id);
          noteOpenFieldId = (noteOpenFieldId === id) ? null : id;
          // Opening a field's Note closes its own Photo panel, and vice
          // versa below -- only one panel per field at a time, keeping
          // the "compact, not a permanent toolbar" spirit even though a
          // field now has two actions instead of one.
          if (noteOpenFieldId === id) photoOpenFieldId = null;
          render();
        };
      }

      var photoToggleBtn = el.querySelector('[data-role="photo-toggle"]');
      if (photoToggleBtn) {
        photoToggleBtn.onclick = function () {
          setActiveField(id);
          photoOpenFieldId = (photoOpenFieldId === id) ? null : id;
          if (photoOpenFieldId === id) noteOpenFieldId = null;
          render();
        };
      }

      // Photo Library / Take Photo are two separate hidden file inputs,
      // each triggered synchronously from its own button's click handler
      // -- calling .click() inside the same synchronous handler (never
      // after an await/.then()) is what keeps this recognized as a user
      // gesture on iOS/Android, which is required for the picker/camera
      // to open at all. Both funnel into the exact same
      // addPhotosForField()/ingestPhoto() pipeline -- a photo picked
      // from the library is stored, thumbnailed, and associated with
      // the field identically to a freshly captured one, no special
      // casing by source.
      var photoLibraryBtn = el.querySelector('[data-role="photo-library"]');
      var photoLibraryInput = el.querySelector('[data-role="photo-library-input"]');
      if (photoLibraryBtn && photoLibraryInput) {
        photoLibraryBtn.onclick = function () { photoLibraryInput.click(); };
        photoLibraryInput.onchange = function () {
          if (photoLibraryInput.files && photoLibraryInput.files.length) {
            addPhotosForField(id, photoLibraryInput.files);
          }
          photoLibraryInput.value = '';
        };
      }

      var takePhotoBtn = el.querySelector('[data-role="take-photo"]');
      var takePhotoInput = el.querySelector('[data-role="take-photo-input"]');
      if (takePhotoBtn && takePhotoInput) {
        takePhotoBtn.onclick = function () { takePhotoInput.click(); };
        takePhotoInput.onchange = function () {
          if (takePhotoInput.files && takePhotoInput.files.length) {
            addPhotosForField(id, takePhotoInput.files);
          }
          takePhotoInput.value = '';
        };
      }

      Array.prototype.forEach.call(el.querySelectorAll('[data-role="photo-view"]'), function (img) {
        img.onclick = function () {
          openFullPhotoViewer(id, img.dataset.photoId);
        };
      });

      Array.prototype.forEach.call(el.querySelectorAll('[data-role="photo-delete"]'), function (btn) {
        btn.onclick = function () {
          // window.confirm() is the simplest possible accidental-delete
          // guard -- a native, blocking, zero-dependency dialog, exactly
          // matching how much ceremony a single-photo delete warrants.
          if (window.confirm('Delete this photo?')) {
            deletePhoto(id, btn.dataset.photoId);
          }
        };
      });

      Array.prototype.forEach.call(el.querySelectorAll('[data-role="option"]'), function (btn) {
        btn.onclick = function () {
          var val = btn.dataset.value;
          if (btn.dataset.multi === '1') {
            var arr = Array.isArray(values[id]) ? values[id].slice() : [];
            var i = arr.indexOf(val);
            if (i === -1) arr.push(val); else arr.splice(i, 1);
            values[id] = arr;
          } else {
            values[id] = values[id] === val ? null : val;
          }
          // Selecting the option is the control's own action and always
          // happens above regardless of activation -- setActiveField()
          // just piggybacks the field-becomes-active side effect onto
          // this same click, one tap doing both.
          setActiveField(id);
          saveValues();
          render();
        };
      });

      var msdTrigger = el.querySelector('[data-role="msd-trigger"]');
      if (msdTrigger) {
        // One tap opens the sheet -- setActiveField()/render() happen
        // inside openMsdSheet() itself, same "the control's own action
        // always runs, activation just piggybacks on it" convention the
        // option-button handler below already uses. No double-tap: this
        // is the button's only handler and its only job.
        msdTrigger.onclick = function () { openMsdSheet(id); };
      }

      Array.prototype.forEach.call(el.querySelectorAll('[data-role="counter-delta"]'), function (btn) {
        btn.onclick = function () {
          values[id] = Math.max(0, Number(values[id] || 0) + Number(btn.dataset.delta));
          setActiveField(id);
          saveValues();
          render();
        };
      });
    });
  }

  // Disregard/Reopen buttons and the collapsed-list toggle live inside
  // .followup-block/.disregarded-summary, not .field, so wireFields()'s
  // .field-scoped querySelectorAll never reaches them -- they need their
  // own pass. Every handler re-renders immediately (no confirmation, no
  // second tap needed), matching the single-tap pattern used everywhere
  // else in this shell.
  function wireExitInterviewControls() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-role="disregard"]'), function (btn) {
      btn.onclick = function () {
        setGroupDisregarded(btn.dataset.group, true);
        render();
      };
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-role="reopen"]'), function (btn) {
      btn.onclick = function () {
        setGroupDisregarded(btn.dataset.group, false);
        render();
      };
    });

    var toggle = $('[data-role="toggle-disregarded"]');
    if (toggle) {
      toggle.onclick = function () {
        disregardedListOpen = !disregardedListOpen;
        render();
      };
    }
  }

  function showFatalError(message) {
    $('#screen').innerHTML = '<div class="shell-note error">' + esc(message) + '</div>';
  }

  // Resolves the workbook's own Property/Address field once, at boot --
  // see ADDRESS_FIELD_ID's own comment for why this is a lookup by
  // tab+label rather than a hardcoded id. Exact, case-insensitive match
  // on "Address" (trimmed) so "Address " or "address" in the workbook
  // still resolves; anything else (no such field at all) leaves
  // ADDRESS_FIELD_ID null and address synchronization simply never
  // fires, same degrade-gracefully posture as every other optional
  // workbook-shape assumption in this file.
  function resolveAddressFieldId() {
    var f = CFG.main.fields.filter(function (x) {
      return x.tab === 'Property' && String(x.label || '').trim().toLowerCase() === 'address';
    })[0];
    return f ? f.id : null;
  }

  // Best-effort only -- most browsers grant "persistent" storage
  // automatically for a frequently-visited/installed origin and may
  // silently no-op or reject elsewhere (notably older/non-installed
  // Safari). Either way Flux must keep working exactly the same;
  // nothing downstream branches on the result.
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(function () {});
  }

  // Milestone 18 #9: flush any pending debounced write on the two
  // signals that actually fire reliably around mobile backgrounding
  // (tab switch, app switch, screen lock) -- deliberately not
  // beforeunload, which iOS/Android Safari do not consistently fire in
  // those situations. Registered once, unconditionally, rather than
  // inside render()/boot, so they're active for the whole page
  // lifetime regardless of which tab/inspection is current. Failures
  // are swallowed here (already surfaced via saveStatus/'Save failed'
  // -- there's no UI to show an alert to at this point, the user may
  // already be looking at a different app).
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      flushPendingSave().catch(function (e) {
        window.console && console.error && console.error('Clipboard-Flux: flush on visibilitychange failed', e);
      });
    }
  });
  window.addEventListener('pagehide', function () {
    flushPendingSave().catch(function () {});
  });

  // Milestone 22.4.1 (#18/#19): a bfcache restore (event.persisted true)
  // resumes this exact frozen JS heap rather than re-running this IIFE,
  // so activeInspection/bootState/photosByField etc. are all already
  // correct as-is in the overwhelmingly common case -- no action needed,
  // and definitely nothing destructive. The one narrow, justified
  // exception: if the page was frozen while stuck in the Restore Error
  // state (e.g. a blocked-storage condition that may well have cleared
  // while this tab was suspended -- the other tab holding the block was
  // itself a very plausible thing to have been closed/backgrounded
  // during that time), a bfcache resume is a safe, low-risk moment to
  // retry automatically rather than leaving the user staring at a stale
  // error from before they backgrounded the app. Never fires for a
  // normal (non-bfcache) load, and never touches 'restoring' or 'ready'.
  window.addEventListener('pageshow', function (event) {
    if (event.persisted && bootState === 'error') {
      bootLog('pageshow after bfcache restore, retrying from Restore Error state');
      retryBootRestore();
    }
  });

  fetch('config.json?v=0.23.2.2', { cache: 'no-store' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (cfg) {
      CFG = cfg;
      activeTab = CFG.main.tabs[0] || null;
      if (!activeTab) {
        showFatalError('config.json has no tabs to render.');
        return;
      }
      ADDRESS_FIELD_ID = resolveAddressFieldId();
      render();
      // Inspection resolution (which inspection is active, migrating
      // pre-0.15 data if needed, loading its photos) happens after this
      // first render -- which already shows correct answers for the
      // common "resuming an existing active inspection" case, since
      // those come from localStorage synchronously at module-init time.
      // render() itself never becomes async; resolveActiveInspectionAndBoot()
      // just resolves activeInspection/photosByField and calls render()
      // once more, exactly like Milestone 14's loadAllPhotosIntoCache()
      // did.
      resolveActiveInspectionAndBoot();
    })
    .catch(function (e) {
      showFatalError(
        'Could not load config.json: ' + e.message +
        ' (if you opened this file directly, serve it over http:// instead -- fetch() cannot read local files).'
      );
    });
})();
