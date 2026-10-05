# Field Lite: quick appraisal inspection collector

A small, standalone field app that is separate from the main Clipboard-Flux
app. It is one HTML page, works offline after the first visit, and keeps
everything on the device.

**Location:** `lite/` on the published Clipboard-Flux site, for example
`https://<your-pages-site>/lite/`.

## In the field (phone or tablet)
1. Open the link in Safari or Chrome, then use **Share > Add to Home Screen**.
   After that it runs like an app with no signal.
2. Tap the property type: SFR, Townhouse, Condo, 2-4 Family or Vacant Land.
   Sections that don't apply are hidden. For example, Vacant Land skips the
   interior, rooms and sketch.
3. Work left to right through the tabs. Nearly everything is a one-tap chip.
   "+ Other" adds a custom value, and notes fields take dictation from the
   keyboard microphone.
4. **Rooms:** tap a cell to add one. Long-press a cell to subtract. Totals
   (rooms, beds, baths shown as full.half) are calculated for you.
5. **Photos:** tap a label in the shot list and the camera opens. The photo
   is saved under that label.
6. **Sketch:** type a length and tap an arrow to draw a wall. **Close shape**
   finishes the area, and the square footage is calculated. **+ Area** adds a
   garage, porch or similar. A new area starts in MOVE mode so you can slide
   it into place before drawing.
7. **Report / Export > Export package (.zip)**, then AirDrop, email or save it
   to Drive or OneDrive.

## In the office (PC running TOTAL)
1. Open the same link and choose **Import package** with the .zip. If the
   computer already unzipped it, select `inspection.json` and the photos
   together.
2. The report is laid out in TOTAL form order. Tap any line to copy it, then
   paste it into the matching TOTAL field. **Copy section** copies a whole
   block, for example for an addendum.
3. Drag the `photos` folder files into TOTAL's photo pages. The files are
   already named by label, for example `01 Front.jpg`. Insert `Sketch.png` as
   the building sketch.

## What's in the package
| File | Contents |
| --- | --- |
| `Report.txt` | Everything you collected, in form order |
| `Data.csv` | Section / Field / Value, which opens in Excel |
| `inspection.json` | The full record, used for re-importing |
| `Sketch.png` and `Sketch.svg` | The footprint, with dimensions and square footage |
| `photos/` | JPEG photos named by label |

## About sending data straight into TOTAL
a la mode does not offer a public way for outside apps to write into a TOTAL
report. Their own TOTAL Mobile app is the only direct sync. Field Lite
therefore cuts re-typing down to tap-to-copy and paste, plus drag-in photos
and sketch. If a la mode later provides an import format, it can be added to
the export.
