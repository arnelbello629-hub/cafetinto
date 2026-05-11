import { Request, Response } from "express";
import multer from "multer";
import sharp from "sharp";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";

// Configure multer for memory storage
const storage = multer.memoryStorage();
export const uploadMiddleware = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only images are allowed"));
    }
  }
});

export const handleImageUpload = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    
    // Ensure directory exists
    try {
      await fs.access(uploadsDir);
    } catch {
      await fs.mkdir(uploadsDir, { recursive: true });
    }

    const filename = `${uuidv4()}.webp`;
    const outputPath = path.join(uploadsDir, filename);

    // Convert to WebP and resize to fit common view dimensions (e.g., 600x600 square cover)
    await sharp(req.file.buffer)
      .webp({ quality: 80 })
      .resize(600, 600, {
        fit: "cover",
        position: "center"
      })
      .toFile(outputPath);

    // Provide the URL (relative to public)
    const fileUrl = `/uploads/${filename}`;

    res.json({ url: fileUrl });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to process image" });
  }
};
