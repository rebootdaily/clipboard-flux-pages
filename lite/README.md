# Field Lite: your inspection sheet, on a tablet

Field Lite puts your own field sheet (the "3_6 FIELD SHEET" tab of your Excel workbook) on a phone or tablet. You
circle and write on it the way you would on paper, and the app turns your
marks into data, a PDF and a package for the office. It works offline after
the first visit and keeps everything on the device.

**Location:** `lite/` on the published Clipboard-Flux site.

## The pages
| Tab | What it is |
| --- | --- |
| **Field Sheet** | Your 3_6 field sheet, redrawn from the workbook as one continuous page. Rows have extra room for tapping, circling and handwriting. |
| **Photos** | Shot list. Tap a label and the camera opens; the photo is saved under that label. |
| **Sketch** | Footprint drawing with square-footage totals. |
| **Export** | Tap-to-copy report, package and PDF export, and settings. |

## Filling in the sheet
- **Circle or tap an option** (OWNER, S-TILE, IMPACT…) to record it. It turns blue.
  - Tap it again to un-select.
  - YES/NO and similar pairs allow only one answer.
  - A circle around two neighbouring options records both.
- **Write in the shaded boxes** (address, HOA$, #STORY, Elev, BED#/BATH#, update years, condo and manufactured info…).
  - On an iPad with an Apple Pencil, Scribble turns your handwriting into typed text.
  - On Android, pen handwriting input does the same.
  - On a phone, the keyboard opens.
- **Notes:** the four rows under NOTES: DEFECTS/EXTRA are a writing box, so handwriting there becomes text.
- **Building sketch:** the blank grid is at the end of the form under BUILDING SKETCH. Draw on it freely;
  your strokes are kept as ink and appear in the PDF exactly as drawn.
- **Anything else you write** (margin notes) is kept as ink too.
- **Insert image:** tap **Insert image** to place a photo or picture (for example a county sketch you check
  measurements against) anywhere on the form.
  - It appears in view, scaled to fit. Tap **Move / resize images**, then drag it, drag the orange corner to
    resize (the shape is kept), or tap the red ✕ to remove it.
  - Switch back to **Pen** to write or draw over it, for example to mark your own measurements. Ink and
    circles always sit on top of the image.
  - It is included in the PDF and the package, in the same place.
- **Tools:**
  - **Eraser** removes pen marks. Erasing a circle also un-selects what it circled.
  - **Undo** reverses the last mark.
  - **Finger writes** lets a finger draw on devices without a pen; scroll with two fingers.

## Export (in the field or at the office)
- **Save PDF** gives you:
  - the filled-in field sheet, exactly as marked, on three 8.5 x 14 pages: the top through the notes, TOTAL
    through Manufactured, then the building sketch (with any inserted images)
  - a typed summary of every recorded value
  - the sketch
  - photos, 6 per page

  The PDF is ready for TOTAL's PDF import.
- **Export package (.zip)** contains the PDF plus:
  - `Field sheet.jpg`
  - `refs/`, the images you inserted
  - `Report.txt` and `Data.csv`
  - `inspection.json`, for re-importing
  - `Sketch.png` and `Sketch.svg`
  - `photos/`, named by label
- **At the office:** open the app on the PC and choose **Import package**. Then tap any line
  of the report to copy it and paste it into TOTAL.

## Changing the sheet
The sheet image and the map of every option and write-in box are generated from the
"3_6 FIELD SHEET" tab of `Generator/lite_sheet/InspectionSheet.xlsx`. The script redraws the tab from
the workbook's own column widths, row heights, fonts, shading, borders and merged cells. To change the sheet:
1. Replace the workbook.
2. Run `python3 Generator/lite_sheet/build_lite_sheet.py`. It needs Node with Playwright, and ImageMagick.
3. Update `FIELDS` and `BLANKS` in that script if cells moved. Both lists refer to cells such as `D14` or `B3`.

## About sending data straight into TOTAL
Field Lite does not write TOTAL's XML yet. To build that, it needs one XML file that
TOTAL itself has exported, so the layout matches exactly.
