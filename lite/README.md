# Field Lite: your inspection sheet, on a tablet

Field Lite puts your own field sheet (the "3_6 FIELD SHEET" tab of your Excel workbook) on a phone or tablet. You
circle and write on it the way you would on paper, and the app turns your
marks into data, a PDF and a package for the office. It works offline after
the first visit and keeps everything on the device.

**Location:** `lite/` on the published Clipboard-Flux site.

## The pages
| Tab | What it is |
| --- | --- |
| **Field Sheet** | Your printed 3_6 field sheet, exactly as on paper, as one continuous page. Pinch to zoom. |
| **Photos** | Import photos from the photo library and tick the ones to send. |
| **Sketch** | Footprint drawing with square-footage totals, and the bed/bath room tally. |
| **Export** | Tap-to-copy report, package and PDF export, and settings. |

## Filling in the sheet
- **Circle or tap an option** (OWNER, S-TILE, IMPACT…) to record it. It turns blue.
  - Tap it again to un-select.
  - YES/NO and similar pairs allow only one answer.
  - A circle around two neighbouring options records both.
  - The loop does not have to be perfect: it can be open at one end, cross over itself, or cover most of the
    word rather than all of it. A circle around a label with no options in it records nothing.
  - A circled option shows your own circle plus a pale blue fill, which is how you know it was recorded. One
    you tapped shows the fill plus a neat ring.
- **Write in the shaded boxes** (address, HOA$, #STORY, Elev, BED#/BATH#, update years, condo and manufactured info…).
  - On an iPad with an Apple Pencil, Scribble turns your handwriting into typed text.
  - On Android, pen handwriting input does the same.
  - On a phone, the keyboard opens.
- **Building sketch:** the blank grid under NOTES: DEFECTS/EXTRA, as on paper. Draw on it freely;
  your strokes are kept as ink and appear in the PDF exactly as drawn. Its top four rows are the notes box,
  where handwriting becomes text.
- **Anything else you write** (margin notes) is kept as ink too.
- **Insert image:** tap **Insert image** to place a photo or picture (for example a county sketch you check
  measurements against) anywhere on the form.
  - It appears in view, scaled to fit. Tap **Move / resize images**, then drag it, drag the orange corner to
    resize (the shape is kept), or tap the red ✕ to remove it.
  - Switch back to **Pen** to write or draw over it, for example to mark your own measurements. Ink and
    circles always sit on top of the image.
  - It is included in the PDF and the package, in the same place.
- **Tools** (one scrolling row above the form):
  - **Pen** draws smooth ink. With an Apple Pencil the line gets thicker as you press harder.
  - **Highlight** draws a wide translucent band, for example over a line on an inserted county sketch.
    It only marks the page and never selects options.
  - **Eraser** has two modes, shown in the toolbar while it is selected: **Whole stroke** removes any
    mark it touches, and **Part of stroke** rubs out just the bit under it. It stays the same size on screen
    at any zoom. Erasing a circle also un-selects what it circled, and touching a tapped option with the
    eraser un-selects it. Undo brings anything back.
  - **Colour dots and the line-thickness dot** change the pen or highlighter. The highlighter has its own colours.
  - **Undo / Redo** step back and forward through marks and option selections.
  - **Palm rejection:** while the Pencil is on the screen, and for a moment after, touches are ignored, so a
    resting hand can't toggle options or end your stroke.
  - **Finger** lets a finger draw on devices without a pen. Use two fingers to scroll while it is on.
- **Zoom:** pinch with two fingers to zoom in and out on the sheet (up to 400%). Only the sheet zooms; the
  toolbar stays put, ink redraws sharp, and taps and circles still land on the right option.
  - The **− / % / +** buttons at the end of the toolbar zoom too; tap the **%** to go back to fit.
  - On a PC, hold Ctrl and use the mouse wheel.

## Sketch tab: Draw
The Sketch tab opens on **Draw**, an endless canvas with no pages. Draw the house, garage and guest house side by side,
then zoom in or out as far as you like. **Measure (keypad)** is the length-and-arrow sketch with square-footage totals.
- **Pencil draws.** One finger pans, and two fingers pan and zoom. With **Finger** on, one finger draws.
- **Straighten:** a wall you draw roughly straight becomes a straight line, squared to 0/45/90° when it's close.
  Curves and circles stay freehand.
- **Snap:** wall ends land on the grid (1 ft squares when zoomed in), and on another wall's end so corners meet.
- **Ft** shows each wall's length.
- **Label** places room names (Bed 1, Bath 1, Kitchen…). Drag a label to move it; tap it to rename or delete it.
- **Reference** adds a county or MLS sketch to trace over. Drag it into place, drag its orange corner to resize it,
  then tap **Lock**. **Fade** changes how strong it looks.
- **Fit** zooms to show the whole drawing. The drawing prints on its own PDF page and goes into the package as Drawing.png.
- On the **field sheet**, the same **Straighten** works on the paper sketch grid: rough walls straighten and their
  corners meet. Writing, circles and tally marks elsewhere are never changed.

## Room tally (Sketch tab)
Below the sketch are three big counters: **BED#**, **BATH#** and **1/2 BTH#**. Tap **+** as you walk into each
room. The counts fill the BED#, BATH# and 1/2 BTH# boxes on the field sheet, so there's nothing to recount.

## Photos
- **In the field:** use the iPad's own Camera app as usual. Take as many shots as you like; Field Lite
  doesn't get in the way.
- **In the vehicle or at the office:** on the Photos tab tap **Import from photo library** and select the
  photos (as many at once as you like).
- **Tap a photo to tick it** for sending and pick a label (Front, Street…) for its caption.
  Only ticked photos go into the PDF and the package. Your full set stays in your photo library.
- **Remove N not sent** clears the unticked photos from the app to save space (not from your library).

## Export (in the field or at the office)
- **Save PDF** gives you:
  - the filled-in field sheet, exactly as marked, on two 8.5 x 14 pages laid out like the printed sheet
    (with any inserted images)
  - a typed summary of every recorded value
  - the sketch
  - the photos you ticked to send, 6 per page

  The PDF is ready for TOTAL's PDF import.
- **Export package (.zip)** contains the PDF plus:
  - `Field sheet.jpg`
  - `refs/`, the images you inserted
  - `Report.txt` and `Data.csv`
  - `inspection.json`, for re-importing
  - `Sketch.png` and `Sketch.svg`
  - `photos/`, the ticked photos, named by label
- **At the office:** open the app on the PC and choose **Import package**. Then tap any line
  of the report to copy it and paste it into TOTAL.

## Changing the sheet
The sheet is your printed field sheet: `Generator/lite_sheet/InspectionSheet.pdf`, printed (Microsoft Print to PDF,
8.5 x 14) from the "3_6 FIELD SHEET" tab of `InspectionSheet.xlsx`. The app shows it exactly as printed, as one
continuous page, and finds every option and write-in box on it automatically. To change the sheet:
1. Edit the tab in the workbook, then print it to PDF again and replace `InspectionSheet.pdf`.
2. If you added, moved or renamed options or write-in boxes, update `FIELDS` and `BLANKS` in
   `Generator/lite_sheet/build_lite_sheet.py`. Both lists refer to cells such as `D14` or `B3`.
3. Run `python3 Generator/lite_sheet/build_lite_sheet_pdf.py`. It needs Node with Playwright, poppler,
   ImageMagick and pdfplumber, and it stops with a message if an option can't be found on the PDF.

## About sending data straight into TOTAL
Field Lite does not write TOTAL's XML yet. To build that, it needs one XML file that
TOTAL itself has exported, so the layout matches exactly.
