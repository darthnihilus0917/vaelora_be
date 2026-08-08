const multer = require('multer');

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

// Memory storage: files are buffered in RAM, not written to disk, then
// streamed straight to R2 by the controller. Fine at this file-size limit.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb({ status: 400, message: `Unsupported image type: ${file.mimetype}` });
    }
    cb(null, true);
  },
});

module.exports = upload;
