const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const User = require('../models/User');
const router = express.Router();

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `logo-${req.userId}-${Date.now()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  // SVG intentionally excluded — SVG can carry inline scripts.
  const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (png, jpg, gif, webp) are allowed'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB max
});

// POST /api/upload/logo — upload team logo
router.post('/logo', auth, upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Delete old logo file if exists
    if (user.team.logo && user.team.logo.startsWith('/api/upload/file/')) {
      const oldFile = path.join(uploadDir, path.basename(user.team.logo));
      if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
    }

    const logoUrl = `/api/upload/file/${req.file.filename}`;
    user.team.logo = logoUrl;
    await user.save();

    res.json({ logo: logoUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/upload/file/:filename — serve uploaded files
router.get('/file/:filename', (req, res) => {
  const filename = path.basename(req.params.filename); // prevent directory traversal
  const filePath = path.join(uploadDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(filePath);
});

module.exports = router;
