# Field Lite: your inspection sheet, on a tablet

Field Lite puts your own paper inspection sheet on a phone or tablet. You
circle and write on it the way you would on paper, and the app turns your
marks into data, a PDF and a package for the office. It works offline after
the first visit and keeps everything on the device.

**Location:** `lite/` on the published Clipboard-Flux site.

## The pages
| Tab | What it is |
| --- | --- |
| **Page 1 / Page 2** | Your inspection sheet, exactly as printed. |
| **Photos** | Shot list. Tap a label and the camera opens; the photo is saved under that label. |
| **Sketch** | Footprint drawing with square-footage totals. |
| **Export** | Tap-to-copy report, package and PDF export, and settings. |

## Filling in the sheet
- **Circle or tap an option** (OWNER, S-TILE, IMPACT…) to record it. It turns blue.
  - Tap it again to un-select.
  - YES/NO and similar pairs allow only one answer.
  - A circle around two neighbouring options records both.
- **Write in the shaded boxes** (address, fees, meter #, bed/bath counts, notes…).
  - On an iPad with an Apple Pencil, Scribble turns your handwriting into typed text.
  - On Android, pen handwriting input does the same.
  - On a phone, the keyboard opens.
- **Anything else you write** (margin notes, the grid on page 2) is kept as ink. It
  appears in the PDF exactly as drawn.
- **Tools:**
  - **Eraser** removes pen marks. Erasing a circle also un-selects what it circled.
  - **Undo** reverses the last mark.
  - **Finger writes** lets a finger draw on devices without a pen; scroll with two fingers.

## Export (in the field or at the office)
- **Save PDF** gives you:
  - the filled-in sheet pages (8.5 x 14), exactly as marked
  - a typed summary of every recorded value
  - the sketch
  - photos, 6 per page

  The PDF is ready for TOTAL's PDF import.
- **Export package (.zip)** contains the PDF plus:
  - `Sheet page 1.jpg` and `Sheet page 2.jpg`
  - `Report.txt` and `Data.csv`
  - `inspection.json`, for re-importing
  - `Sketch.png` and `Sketch.svg`
  - `photos/`, named by label
- **At the office:** open the app on the PC and choose **Import package**. Then tap any line
  of the report to copy it and paste it into TOTAL.

## Changing the sheet
The page images and the map of every option and write-in box are generated from
`Generator/lite_sheet/InspectionSheet.pdf`. To change the sheet:
1. Replace that PDF with the new version.
2. Run `python3 Generator/lite_sheet/build_lite_sheet.py`. It needs poppler-utils and
   ImageMagick.
3. Update the row list in that script if any rows moved or were renamed.

## About sending data straight into TOTAL
Field Lite does not write TOTAL's XML yet. To build that, it needs one XML file that
TOTAL itself has exported, so the layout matches exactly.
