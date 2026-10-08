import multer from "multer";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
];

const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];

const fileFilter = (req, file, cb) => {
  const ext = file.originalname
    .toLowerCase()
    .slice(file.originalname.lastIndexOf("."));

  if (
    ALLOWED_MIME_TYPES.includes(file.mimetype) &&
    ALLOWED_EXTENSIONS.includes(ext)
  ) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only JPEG, PNG, WebP, and PDF are allowed."), false);
  }
};

export const upload = multer({
  storage: multer.memoryStorage(), // keep file in memory as buffer
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max
    files: 1, // one file per request
  },
  fileFilter,
});