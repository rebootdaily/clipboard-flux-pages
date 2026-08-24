(function (global) {
  'use strict';

  var PDF_PHOTO_MAX_DIM = 1800;

  global.ClipboardFluxPdfPhoto = {
    PDF_PHOTO_MAX_DIM: 1800,
    PDF_PHOTO_JPEG_QUALITY: 0.8,
    fitWithinMaxDimension: function (width, height) {
      var scale = Math.min(1, PDF_PHOTO_MAX_DIM / Math.max(width, height));
      return {
        scale: scale,
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale))
      };
    }
  };
})(window);
