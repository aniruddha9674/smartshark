import { uploadToCloudinary } from "../services/upload.service.js";

export const uploadFile = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    // Optional: attach business/user context for folder organization
    const businessId = req.user?.id || "unknown";
    const folder = `verification-docs/${businessId}`;

    const { url, publicId } = await uploadToCloudinary(
      req.file.buffer,
      folder,
      req.file.originalname
    );

    return res.status(200).json({
      success: true,
      data: { url, publicId },
    });
  } catch (error) {
    next(error);
  }
};