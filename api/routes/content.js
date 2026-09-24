const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;

const Service = require('../models/Service');
const Equipment = require('../models/Equipment');
const Project = require('../models/Project');
const Company = require('../models/Company');
const { adminOrEditor } = require('../middleware/auth');
const {
  isValidObjectId,
  isValidStringLength,
  isValidInteger,
  isValidEquipmentCategory,
  isSafeFilename,
  isAllowedImageBuffer,
  trimString,
  sanitizePlainText,
  STRING_LIMITS
} = require('../utils/validation');

const BASE_URL = process.env.BASE_URL || "http://localhost:4001";

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../uploads/general');
    try {
      await fsp.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const safeExt = /^\.[a-zA-Z0-9]{2,5}$/.test(ext) ? ext : '.bin';
    cb(null, file.fieldname + '-' + uniqueSuffix + safeExt);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) cb(null, true);
  else cb(new Error('Only image files are allowed'));
};

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 },
  fileFilter
});

function verifyImageUploads(req, res, next) {
  const files = [
    ...(req.file ? [req.file] : []),
    ...Object.values(req.files || {}).flat()
  ];
  const invalid = files.some(file => {
    try { return !isAllowedImageBuffer(fs.readFileSync(file.path)); } catch { return true; }
  });
  if (!invalid) return next();
  files.forEach(file => { try { fs.unlinkSync(file.path); } catch {} });
  return res.status(400).json({ success: false, message: 'Invalid image content' });
}

function resolveSafeGeneralImage(unsafeUrl) {
  if (!unsafeUrl || typeof unsafeUrl !== 'string') return null;
  const base = '/uploads/general/';
  if (!unsafeUrl.startsWith(base)) return null;
  const name = unsafeUrl.slice(base.length);
  if (!isSafeFilename(name)) return null;
  const resolved = path.resolve(path.join(__dirname, '../../uploads/general'), name);
  const root = path.resolve(path.join(__dirname, '../../uploads/general'));
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

function cleanSubPages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(sp => sp && typeof sp === 'object')
    .map(sp => {
      const title = sanitizePlainText(trimString(sp.title));
      const description = sanitizePlainText(trimString(sp.description || ''));
      if (!isValidStringLength(title, 1, STRING_LIMITS.SHORT_TEXT_MAX)) return null;
      if (!isValidStringLength(description, 0, STRING_LIMITS.MEDIUM_TEXT_MAX)) return null;
      return { title, description };
    })
    .filter(Boolean)
    .slice(0, 50);
}

function cleanFeatures(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map(f => sanitizePlainText(trimString(f)))
      .filter(f => isValidStringLength(f, 1, STRING_LIMITS.SHORT_TEXT_MAX))
      .slice(0, 200);
  }
  if (typeof raw === 'string') {
    return raw
      .split('\n')
      .map(f => sanitizePlainText(trimString(f)))
      .filter(f => isValidStringLength(f, 1, STRING_LIMITS.SHORT_TEXT_MAX))
      .slice(0, 200);
  }
  return [];
}

function cleanGallery(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(url => typeof url === 'string' && url.startsWith('/uploads/general/'))
    .filter(url => resolveSafeGeneralImage(url))
    .slice(0, 50);
}

// ===============================================
// ----------------- Projects CRUD ---------------
// ===============================================

router.get('/projects', async (req, res) => {
  try {
    const items = await Project.find().sort({ createdAt: -1 });
    res.json({ success: true, data: items });
  } catch (err) {
    console.error("❌ Error fetching projects:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    }
    const item = await Project.findById(id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    res.json({ success: true, data: item });
  } catch (err) {
    console.error("❌ Error fetching project:", err);
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post(
  '/projects',
  adminOrEditor(),
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'gallery', maxCount: 10 }
  ]),
  verifyImageUploads,
  async (req, res) => {
    try {
      const raw = req.body || {};
      const clean = {};

      let title = sanitizePlainText(trimString(raw.title));
      if (!isValidStringLength(title, 2, STRING_LIMITS.SHORT_TEXT_MAX)) {
        return res.status(400).json({
          success: false,
          message: `Titre invalide (${STRING_LIMITS.NAME_MIN}-${STRING_LIMITS.SHORT_TEXT_MAX} caractères)`
        });
      }
      clean.title = title;

      clean.category = raw.category && isValidStringLength(trimString(raw.category), 0, STRING_LIMITS.SHORT_TEXT_MAX)
        ? sanitizePlainText(trimString(raw.category)) : 'other';

      if (raw.location !== undefined) {
        const loc = sanitizePlainText(trimString(raw.location));
        if (!isValidStringLength(loc, 0, STRING_LIMITS.SHORT_TEXT_MAX)) {
          return res.status(400).json({ success: false, message: 'Localisation trop longue' });
        }
        clean.location = loc;
      }

      if (raw.date !== undefined && raw.date !== null && raw.date !== '') {
        const d = new Date(raw.date);
        if (isNaN(d.getTime())) {
          return res.status(400).json({ success: false, message: 'Date invalide' });
        }
        clean.date = d;
      }

      if (raw.client !== undefined) {
        const client = sanitizePlainText(trimString(raw.client));
        if (!isValidStringLength(client, 0, STRING_LIMITS.NAME_MAX)) {
          return res.status(400).json({ success: false, message: 'Nom client trop long' });
        }
        clean.client = client;
      }

      if (raw.description !== undefined) {
        const desc = sanitizePlainText(trimString(raw.description));
        if (!isValidStringLength(desc, 0, STRING_LIMITS.LONG_TEXT_MAX)) {
          return res.status(400).json({ success: false, message: 'Description trop longue' });
        }
        clean.description = desc;
      }

      if (req.files && req.files['image']) {
        clean.imageUrl = `/uploads/general/${req.files['image'][0].filename}`;
      } else if (raw.imageUrl && resolveSafeGeneralImage(raw.imageUrl)) {
        clean.imageUrl = raw.imageUrl;
      }

      let gallery = [];
      if (req.files && req.files['gallery']) {
        gallery = gallery.concat(req.files['gallery'].map(f => `/uploads/general/${f.filename}`));
      }
      if (raw.gallery) {
        let parsed;
        if (typeof raw.gallery === 'string') {
          try { parsed = JSON.parse(raw.gallery); } catch { parsed = []; }
        } else {
          parsed = raw.gallery;
        }
        gallery = gallery.concat(cleanGallery(parsed));
      }
      if (gallery.length > 0) clean.gallery = [...new Set(gallery)].slice(0, 50);

      const item = await Project.create(clean);
      res.json({ success: true, data: item });
    } catch (err) {
      console.error("❌ Create project error:", err);
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

router.put(
  '/projects/:id',
  adminOrEditor(),
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'gallery', maxCount: 10 }
  ]),
  verifyImageUploads,
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isValidObjectId(id)) {
        return res.status(400).json({ success: false, message: 'Identifiant invalide' });
      }

      const existing = await Project.findById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Project not found' });
      }

      const raw = req.body || {};
      const update = {};

      if (raw.title !== undefined) {
        const title = sanitizePlainText(trimString(raw.title));
        if (!isValidStringLength(title, 2, STRING_LIMITS.SHORT_TEXT_MAX)) {
          return res.status(400).json({ success: false, message: 'Titre invalide' });
        }
        update.title = title;
      }

      if (raw.category !== undefined) {
        const cat = sanitizePlainText(trimString(raw.category));
        if (!isValidStringLength(cat, 0, STRING_LIMITS.SHORT_TEXT_MAX)) {
          return res.status(400).json({ success: false, message: 'Catégorie invalide' });
        }
        update.category = cat || 'other';
      }

      if (raw.location !== undefined) {
        const loc = sanitizePlainText(trimString(raw.location));
        if (!isValidStringLength(loc, 0, STRING_LIMITS.SHORT_TEXT_MAX)) {
          return res.status(400).json({ success: false, message: 'Localisation trop longue' });
        }
        update.location = loc;
      }

      if (raw.date !== undefined) {
        if (raw.date === null || raw.date === '') {
          update.date = null;
        } else {
          const d = new Date(raw.date);
          if (isNaN(d.getTime())) {
            return res.status(400).json({ success: false, message: 'Date invalide' });
          }
          update.date = d;
        }
      }

      if (raw.client !== undefined) {
        const client = sanitizePlainText(trimString(raw.client));
        if (!isValidStringLength(client, 0, STRING_LIMITS.NAME_MAX)) {
          return res.status(400).json({ success: false, message: 'Nom client trop long' });
        }
        update.client = client;
      }

      if (raw.description !== undefined) {
        const desc = sanitizePlainText(trimString(raw.description));
        if (!isValidStringLength(desc, 0, STRING_LIMITS.LONG_TEXT_MAX)) {
          return res.status(400).json({ success: false, message: 'Description trop longue' });
        }
        update.description = desc;
      }

      if (req.files && req.files['image']) {
        update.imageUrl = `/uploads/general/${req.files['image'][0].filename}`;
      } else if (raw.imageUrl !== undefined) {
        if (raw.imageUrl && resolveSafeGeneralImage(raw.imageUrl)) {
          update.imageUrl = raw.imageUrl;
        } else if (raw.imageUrl === '' || raw.imageUrl === null) {
          update.imageUrl = '';
        }
      }

      if (req.files && req.files['gallery']) {
        let gallery = [];
        gallery = gallery.concat(req.files['gallery'].map(f => `/uploads/general/${f.filename}`));
        if (raw.gallery) {
          let parsed;
          if (typeof raw.gallery === 'string') {
            try { parsed = JSON.parse(raw.gallery); } catch { parsed = []; }
          } else {
            parsed = raw.gallery;
          }
          gallery = gallery.concat(cleanGallery(parsed));
        } else if (Array.isArray(existing.gallery)) {
          gallery = gallery.concat(existing.gallery);
        }
        update.gallery = [...new Set(gallery)].slice(0, 50);
      } else if (raw.gallery !== undefined) {
        let parsed;
        if (typeof raw.gallery === 'string') {
          try { parsed = JSON.parse(raw.gallery); } catch { parsed = []; }
        } else {
          parsed = raw.gallery;
        }
        update.gallery = cleanGallery(parsed);
      }

      const item = await Project.findByIdAndUpdate(id, update, { new: true });
      if (!item) {
        return res.status(404).json({ success: false, message: 'Project not found' });
      }

      res.json({ success: true, data: item });
    } catch (err) {
      console.error("❌ Update project error:", err);
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

router.delete('/projects/:id', adminOrEditor(), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    }
    const item = await Project.findByIdAndDelete(id);
    if (!item) {
      // Already deleted — return success so UI cleans up gracefully
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const generalRoot = path.resolve(path.join(__dirname, '../../uploads/general'));
    const tryUnlink = (url) => {
      const resolved = resolveSafeGeneralImage(url);
      if (resolved && resolved.startsWith(generalRoot)) {
        try { fs.unlinkSync(resolved); } catch {}
      }
    };

    if (item.imageUrl) tryUnlink(item.imageUrl);
    if (Array.isArray(item.gallery)) item.gallery.forEach(tryUnlink);

    res.json({ success: true, message: 'Project deleted' });
  } catch (err) {
    console.error('❌ Delete project error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
});

// ===============================================
// ----------------- Services CRUD ---------------
// ===============================================
router.get('/services', async (req, res) => {
  try {
    const items = await Service.find().sort({ order: 1, createdAt: -1 });
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/services/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    }
    const item = await Service.findById(id);
    if (!item) return res.status(404).json({ success: false, message: 'Service not found' });
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/services', adminOrEditor(), upload.single('image'), verifyImageUploads, async (req, res) => {
  try {
    const raw = req.body || {};
    const clean = {};

    let title = sanitizePlainText(trimString(raw.title));
    if (!isValidStringLength(title, 2, STRING_LIMITS.SHORT_TEXT_MAX)) {
      return res.status(400).json({ success: false, message: 'Titre invalide (2-255 caractères)' });
    }
    clean.title = title;

    let name = sanitizePlainText(trimString(raw.name));
    if (!name || !isValidStringLength(name, 2, STRING_LIMITS.SHORT_TEXT_MAX)) {
      name = title;
    }
    clean.name = name;

    const category = sanitizePlainText(trimString(raw.category));
    if (!isValidStringLength(category, 1, STRING_LIMITS.SHORT_TEXT_MAX)) {
      return res.status(400).json({ success: false, message: 'Catégorie invalide (slug requis)' });
    }
    clean.category = category;

    const description = sanitizePlainText(trimString(raw.description));
    if (!isValidStringLength(description, 5, STRING_LIMITS.LONG_TEXT_MAX)) {
      return res.status(400).json({ success: false, message: 'Description invalide (5-10000 caractères)' });
    }
    clean.description = description;

    if (req.file) {
      clean.imageUrl = `/uploads/general/${req.file.filename}`;
    } else if (raw.imageUrl && resolveSafeGeneralImage(raw.imageUrl)) {
      clean.imageUrl = raw.imageUrl;
    }

    if (raw.icon !== undefined) {
      const icon = sanitizePlainText(trimString(raw.icon));
      if (isValidStringLength(icon, 0, STRING_LIMITS.SHORT_TEXT_MAX)) {
        clean.icon = icon || 'fa-cogs';
      }
    }

    if (raw.subPages !== undefined) {
      let parsed;
      if (typeof raw.subPages === 'string') {
        try { parsed = JSON.parse(raw.subPages); } catch { parsed = []; }
      } else {
        parsed = raw.subPages;
      }
      clean.subPages = cleanSubPages(parsed);
    }

    if (raw.price !== undefined) {
      const price = sanitizePlainText(trimString(raw.price));
      if (isValidStringLength(price, 0, STRING_LIMITS.SHORT_TEXT_MAX)) {
        clean.price = price || 'Sur devis';
      }
    }

    if (raw.features !== undefined) {
      clean.features = cleanFeatures(raw.features);
    }

    if (raw.order !== undefined) {
      const order = Number(raw.order);
      if (isValidInteger(order, 0, 100000)) {
        clean.order = order;
      }
    }

    const item = await Service.create(clean);
    res.json({ success: true, data: item });
  } catch (err) {
    console.error('POST /api/content/services - error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/services/:id', adminOrEditor(), upload.single('image'), verifyImageUploads, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    }

    const raw = req.body || {};
    const update = {};

    if (raw.title !== undefined) {
      const title = sanitizePlainText(trimString(raw.title));
      if (!isValidStringLength(title, 2, STRING_LIMITS.SHORT_TEXT_MAX)) {
        return res.status(400).json({ success: false, message: 'Titre invalide' });
      }
      update.title = title;
    }

    if (raw.name !== undefined) {
      const name = sanitizePlainText(trimString(raw.name));
      if (!isValidStringLength(name, 2, STRING_LIMITS.SHORT_TEXT_MAX)) {
        return res.status(400).json({ success: false, message: 'Nom invalide' });
      }
      update.name = name;
    }

    if (raw.category !== undefined) {
      const category = sanitizePlainText(trimString(raw.category));
      if (!isValidStringLength(category, 1, STRING_LIMITS.SHORT_TEXT_MAX)) {
        return res.status(400).json({ success: false, message: 'Catégorie invalide' });
      }
      update.category = category;
    }

    if (raw.description !== undefined) {
      const description = sanitizePlainText(trimString(raw.description));
      if (!isValidStringLength(description, 5, STRING_LIMITS.LONG_TEXT_MAX)) {
        return res.status(400).json({ success: false, message: 'Description invalide' });
      }
      update.description = description;
    }

    if (req.file) {
      update.imageUrl = `/uploads/general/${req.file.filename}`;
    } else if (raw.imageUrl !== undefined) {
      if (raw.imageUrl && resolveSafeGeneralImage(raw.imageUrl)) {
        update.imageUrl = raw.imageUrl;
      } else if (raw.imageUrl === '' || raw.imageUrl === null) {
        update.imageUrl = '';
      }
    }

    if (raw.icon !== undefined) {
      const icon = sanitizePlainText(trimString(raw.icon));
      if (isValidStringLength(icon, 0, STRING_LIMITS.SHORT_TEXT_MAX)) {
        update.icon = icon;
      }
    }

    if (raw.subPages !== undefined) {
      let parsed;
      if (typeof raw.subPages === 'string') {
        try { parsed = JSON.parse(raw.subPages); } catch { parsed = []; }
      } else {
        parsed = raw.subPages;
      }
      update.subPages = cleanSubPages(parsed);
    }

    if (raw.price !== undefined) {
      const price = sanitizePlainText(trimString(raw.price));
      if (isValidStringLength(price, 0, STRING_LIMITS.SHORT_TEXT_MAX)) {
        update.price = price;
      }
    }

    if (raw.features !== undefined) {
      update.features = cleanFeatures(raw.features);
    }

    if (raw.order !== undefined) {
      const order = Number(raw.order);
      if (isValidInteger(order, 0, 100000)) {
        update.order = order;
      }
    }

    const item = await Service.findByIdAndUpdate(id, update, { new: true });
    if (!item) return res.status(404).json({ success: false, message: 'Service not found' });
    res.json({ success: true, data: item });
  } catch (err) {
    console.error('PUT /api/content/services/:id - error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/services/:id', adminOrEditor(), async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Identifiant invalide'
      });
    }

    const item = await Service.findByIdAndDelete(id);

    if (!item) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    const resolved = resolveSafeGeneralImage(item.imageUrl);

    if (resolved) {
      try {
        fs.unlinkSync(resolved);
      } catch {}
    }

    res.json({
      success: true,
      message: 'Service deleted'
    });

  } catch (err) {
    console.error('DELETE SERVICE ERROR:', err);

    res.status(400).json({
      success: false,
      message: err.message
    });
  }
});

// ===============================================
// ----------------- Equipment CRUD --------------
// ===============================================

router.get('/equipment', async (req, res) => {
  const items = await Equipment.find().sort({ createdAt: -1 });
  res.json({ success: true, data: items });
});

router.get('/equipment/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    }
    const item = await Equipment.findById(id);
    if (!item) return res.status(404).json({ success: false, message: 'Equipment not found' });
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/equipment', adminOrEditor(), upload.single('image'), verifyImageUploads, async (req, res) => {
  try {
    const raw = req.body || {};

    const name = sanitizePlainText(trimString(raw.name));
    if (!isValidStringLength(name, STRING_LIMITS.NAME_MIN, STRING_LIMITS.NAME_MAX)) {
      return res.status(400).json({
        success: false,
        message: `Nom invalide (${STRING_LIMITS.NAME_MIN}-${STRING_LIMITS.NAME_MAX} caractères)`
      });
    }

    const description = sanitizePlainText(trimString(raw.description));
    if (!isValidStringLength(description, 5, STRING_LIMITS.MEDIUM_TEXT_MAX)) {
      return res.status(400).json({
        success: false,
        message: `Description invalide (5-${STRING_LIMITS.MEDIUM_TEXT_MAX} caractères)`
      });
    }

    const category = sanitizePlainText(trimString(raw.category));
    if (!isValidEquipmentCategory(category)) {
      return res.status(400).json({
        success: false,
        message: 'Catégorie invalide. Valeurs autorisées: excavation, levage, transport, compactage, outillage, divers'
      });
    }

    const data = { name, description, category };

    if (raw.brand !== undefined) {
      const brand = sanitizePlainText(trimString(raw.brand));
      if (isValidStringLength(brand, 0, STRING_LIMITS.SHORT_TEXT_MAX)) data.brand = brand;
    }
    if (raw.model !== undefined) {
      const model = sanitizePlainText(trimString(raw.model));
      if (isValidStringLength(model, 0, STRING_LIMITS.SHORT_TEXT_MAX)) data.model = model;
    }
    if (raw.year !== undefined && raw.year !== null && raw.year !== '') {
      const year = Number(raw.year);
      if (!isValidInteger(year, 1900, new Date().getFullYear() + 1)) {
        return res.status(400).json({ success: false, message: 'Année invalide' });
      }
      data.year = year;
    }

    data.imageUrl = req.file ? `/uploads/general/${req.file.filename}`
                : (raw.imageUrl && resolveSafeGeneralImage(raw.imageUrl) ? raw.imageUrl : null);

    const item = await Equipment.create(data);
    res.json({ success: true, data: item });
  } catch (error) {
    console.error("❌ Save equipment error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/equipment/:id', adminOrEditor(), upload.single('image'), verifyImageUploads, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    }
    const equipment = await Equipment.findById(id);
    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Équipement introuvable' });
    }

    const raw = req.body || {};
    const updateData = {};

    if (raw.name !== undefined) {
      const name = sanitizePlainText(trimString(raw.name));
      if (!isValidStringLength(name, STRING_LIMITS.NAME_MIN, STRING_LIMITS.NAME_MAX)) {
        return res.status(400).json({ success: false, message: 'Nom invalide' });
      }
      updateData.name = name;
    }

    if (raw.description !== undefined) {
      const description = sanitizePlainText(trimString(raw.description));
      if (!isValidStringLength(description, 5, STRING_LIMITS.MEDIUM_TEXT_MAX)) {
        return res.status(400).json({ success: false, message: 'Description invalide' });
      }
      updateData.description = description;
    }

    if (raw.category !== undefined) {
      const category = sanitizePlainText(trimString(raw.category));
      if (!isValidEquipmentCategory(category)) {
        return res.status(400).json({ success: false, message: 'Catégorie invalide' });
      }
      updateData.category = category;
    }

    if (raw.brand !== undefined) {
      const brand = sanitizePlainText(trimString(raw.brand));
      if (isValidStringLength(brand, 0, STRING_LIMITS.SHORT_TEXT_MAX)) updateData.brand = brand;
    }
    if (raw.model !== undefined) {
      const model = sanitizePlainText(trimString(raw.model));
      if (isValidStringLength(model, 0, STRING_LIMITS.SHORT_TEXT_MAX)) updateData.model = model;
    }
    if (raw.year !== undefined) {
      if (raw.year === null || raw.year === '') {
        updateData.year = undefined;
      } else {
        const year = Number(raw.year);
        if (!isValidInteger(year, 1900, new Date().getFullYear() + 1)) {
          return res.status(400).json({ success: false, message: 'Année invalide' });
        }
        updateData.year = year;
      }
    }

    if (req.file) {
      const oldResolved = resolveSafeGeneralImage(equipment.imageUrl);
      if (oldResolved) {
        try { fs.unlinkSync(oldResolved); console.log('🗑 Old image deleted:', oldResolved); } catch {}
      }
      updateData.imageUrl = `/uploads/general/${req.file.filename}`;
    } else if (raw.imageUrl !== undefined) {
      if (raw.imageUrl && resolveSafeGeneralImage(raw.imageUrl)) {
        updateData.imageUrl = raw.imageUrl;
      } else if (raw.imageUrl === '' || raw.imageUrl === null) {
        updateData.imageUrl = null;
      }
    }

    const updatedEquipment = await Equipment.findByIdAndUpdate(id, updateData, { new: true });
    res.json({ success: true, data: updatedEquipment });
  } catch (err) {
    console.error("❌ Update error:", err);
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/equipment/:id', adminOrEditor(), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    }
    const equipment = await Equipment.findByIdAndDelete(id);
    if (!equipment) {
      return res.json({ success: true, message: 'Equipment already deleted', alreadyGone: true });
    }
    const resolved = resolveSafeGeneralImage(equipment.imageUrl);
    if (resolved) { try { fs.unlinkSync(resolved); } catch {} }
    res.json({ success: true, message: 'Equipment deleted' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ---- Company (single doc) ----
const COMPANY_FIELDS = ['name', 'slogan', 'address', 'phone', 'email', 'rccm', 'niu', 'about', 'values'];

router.get('/company', async (req,res)=>{
  const doc = await Company.findOne() || await Company.create({});
  res.json(doc);
});

router.put('/company', adminOrEditor(), async (req,res)=>{
  try {
    const raw = req.body || {};
    const current = await Company.findOne();

    const update = {};

    if (raw.name !== undefined) {
      const v = sanitizePlainText(trimString(raw.name));
      if (isValidStringLength(v, 0, STRING_LIMITS.NAME_MAX)) update.name = v;
    }
    if (raw.slogan !== undefined) {
      const v = sanitizePlainText(trimString(raw.slogan));
      if (isValidStringLength(v, 0, STRING_LIMITS.SHORT_TEXT_MAX)) update.slogan = v;
    }
    if (raw.address !== undefined) {
      const v = sanitizePlainText(trimString(raw.address));
      if (isValidStringLength(v, 0, STRING_LIMITS.SHORT_TEXT_MAX)) update.address = v;
    }
    if (raw.phone !== undefined) {
      const v = sanitizePlainText(trimString(raw.phone));
      if (isValidStringLength(v, 0, STRING_LIMITS.PHONE_MAX)) update.phone = v;
    }
    if (raw.email !== undefined) {
      const v = trimString(raw.email);
      if (!v) update.email = '';
      else if (v.length <= STRING_LIMITS.EMAIL_MAX) update.email = v.toLowerCase();
    }
    if (raw.rccm !== undefined) {
      const v = sanitizePlainText(trimString(raw.rccm));
      if (isValidStringLength(v, 0, STRING_LIMITS.SHORT_TEXT_MAX)) update.rccm = v;
    }
    if (raw.niu !== undefined) {
      const v = sanitizePlainText(trimString(raw.niu));
      if (isValidStringLength(v, 0, STRING_LIMITS.SHORT_TEXT_MAX)) update.niu = v;
    }
    if (raw.about !== undefined) {
      const v = sanitizePlainText(trimString(raw.about));
      if (isValidStringLength(v, 0, STRING_LIMITS.LONG_TEXT_MAX)) update.about = v;
    }
    if (raw.values !== undefined) {
      const values = Array.isArray(raw.values) ? raw.values : [];
      update.values = values
        .map(v => sanitizePlainText(trimString(v)))
        .filter(v => isValidStringLength(v, 1, STRING_LIMITS.SHORT_TEXT_MAX))
        .slice(0, 50);
    }

    if (current) {
      Object.assign(current, update);
      await current.save();
      res.json({ success: true, data: current });
    } else {
      const created = await Company.create(update);
      res.json({ success: true, data: created });
    }
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ---- File Upload ----
router.post('/upload', adminOrEditor(), upload.single('file'), verifyImageUploads, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const fileUrl = `/uploads/general/${req.file.filename}`;

    res.json({
      success: true,
      data: {
        url: fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
