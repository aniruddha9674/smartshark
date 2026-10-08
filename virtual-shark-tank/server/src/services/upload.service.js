import cloudinary from "../config/cloudinary.js";

/**
 * Upload a file buffer to Cloudinary.
 * @param {Buffer} buffer - File buffer from Multer
 * @param {string} folder - Cloudinary folder (e.g., "verification-docs")
 * @param {string} originalName - Original filename for public_id generation
 * @returns {Promise<{ url: string, publicId: string }>}
 */
export const uploadToCloudinary = (buffer, folder, originalName) => {
  return new Promise((resolve, reject) => {
    // Sanitize filename to avoid path issues
    const safeName = originalName
      .replace(/\.[^.]+$/, "") // remove extension
      .replace(/[^a-zA-Z0-9_-]/g, "_") // replace unsafe chars
      .slice(0, 100); // limit length

    const publicId = `${Date.now()}_${safeName}`;

    const stream = cloudinary.uploader.upload_stream(
      {
        folder, // e.g., "verification-docs/businessId"
        public_id: publicId,
        resource_type: "auto", // auto-detect image/pdf
        overwrite: false,
        invalidate: true,
      },
      (error, result) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          return reject(new Error("Failed to upload file to Cloudinary"));
        }
        if (!result) {
          return reject(new Error("Cloudinary returned no result"));
        }
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
        });
      }
    );

    // Write the buffer to the stream and end it
    stream.end(buffer);
  });
};