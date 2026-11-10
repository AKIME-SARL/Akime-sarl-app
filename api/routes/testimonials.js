const express = require('express');
const router  = express.Router();
const Testimonial = require('../models/Testimonial');
const { adminOrEditor } = require('../middleware/auth');
const {
  isValidObjectId,
  isValidObjectIdList,
  isValidRating,
  isValidStringLength,
  trimString,
  sanitizePlainText,
  STRING_LIMITS
} = require('../utils/validation');

router.get('/', async (req, res) => {
  try {
    const list = await Testimonial.find({ approved: true }).sort({ createdAt: -1 });
    res.json({ success: true, data: list });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/admin/all', adminOrEditor(), async (req, res) => {
  try {
    const list = await Testimonial.find().sort({ createdAt: -1 });
    res.json({ success: true, data: list });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    let { name, company, message, rating } = req.body;

    name = sanitizePlainText(trimString(name));
    company = company ? sanitizePlainText(trimString(company)) : null;
    message = sanitizePlainText(trimString(message));

    if (!name || !isValidStringLength(name, STRING_LIMITS.NAME_MIN, STRING_LIMITS.NAME_MAX)) {
      return res.status(400).json({
        success: false,
        message: `Nom obligatoire (${STRING_LIMITS.NAME_MIN}-${STRING_LIMITS.NAME_MAX} caractères)`
      });
    }
    if (!message || !isValidStringLength(message, 5, STRING_LIMITS.MEDIUM_TEXT_MAX)) {
      return res.status(400).json({
        success: false,
        message: `Message obligatoire (5-${STRING_LIMITS.MEDIUM_TEXT_MAX} caractères)`
      });
    }
    if (company && !isValidStringLength(company, 0, STRING_LIMITS.NAME_MAX)) {
      return res.status(400).json({
        success: false,
        message: `Nom d'entreprise trop long (max ${STRING_LIMITS.NAME_MAX} caractères)`
      });
    }

    let cleanRating = 5;
    if (rating !== undefined && rating !== null && rating !== '') {
      if (!isValidRating(rating)) {
        return res.status(400).json({
          success: false,
          message: 'Note invalide (1-5 attendue)'
        });
      }
      cleanRating = Number(rating);
    }

    const t = await Testimonial.create({
      name,
      company,
      message,
      rating: cleanRating
    });
    res.json({ success: true, data: t, message: 'Merci ! En attente de validation.' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/bulk/approve', adminOrEditor(), async (req, res) => {
  const { ids } = req.body;
  if (!isValidObjectIdList(ids)) {
    return res.status(400).json({
      success: false,
      message: 'Sélection invalide (1 à 100 identifiants attendus)'
    });
  }

  try {
    const result = await Testimonial.updateMany(
      { _id: { $in: [...new Set(ids)] } },
      { $set: { approved: true } }
    );
    res.json({
      success: true,
      data: { approvedCount: result.modifiedCount },
      message: 'Témoignages approuvés'
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.put('/:id/approve', adminOrEditor(), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    }
    const t = await Testimonial.findByIdAndUpdate(id, { approved: true }, { new: true });
    if (!t) return res.status(404).json({ success: false, message: 'Introuvable' });
    res.json({ success: true, data: t });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

router.put('/:id', adminOrEditor(), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    }

    const updateData = {};
    let { name, company, message, rating, approved } = req.body;

    if (name !== undefined) {
      name = sanitizePlainText(trimString(name));
      if (!isValidStringLength(name, STRING_LIMITS.NAME_MIN, STRING_LIMITS.NAME_MAX)) {
        return res.status(400).json({
          success: false,
          message: `Nom invalide (${STRING_LIMITS.NAME_MIN}-${STRING_LIMITS.NAME_MAX} caractères)`
        });
      }
      updateData.name = name;
    }

    if (company !== undefined) {
      company = company ? sanitizePlainText(trimString(company)) : null;
      if (company && !isValidStringLength(company, 0, STRING_LIMITS.NAME_MAX)) {
        return res.status(400).json({
          success: false,
          message: `Nom d'entreprise trop long (max ${STRING_LIMITS.NAME_MAX} caractères)`
        });
      }
      updateData.company = company;
    }

    if (message !== undefined) {
      message = sanitizePlainText(trimString(message));
      if (!isValidStringLength(message, 5, STRING_LIMITS.MEDIUM_TEXT_MAX)) {
        return res.status(400).json({
          success: false,
          message: `Message invalide (5-${STRING_LIMITS.MEDIUM_TEXT_MAX} caractères)`
        });
      }
      updateData.message = message;
    }

    if (rating !== undefined) {
      if (!isValidRating(rating)) {
        return res.status(400).json({
          success: false,
          message: 'Note invalide (1-5 attendue)'
        });
      }
      updateData.rating = Number(rating);
    }

    if (approved !== undefined) {
      if (typeof approved !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'Valeur "approved" invalide (booléen attendu)'
        });
      }
      updateData.approved = approved;
    }

    const t = await Testimonial.findByIdAndUpdate(id, updateData, { new: true });
    if (!t) return res.status(404).json({ success: false, message: 'Introuvable' });
    res.json({ success: true, data: t });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

router.delete('/bulk/delete', adminOrEditor(), async (req, res) => {
  const { ids } = req.body;
  if (!isValidObjectIdList(ids)) {
    return res.status(400).json({
      success: false,
      message: 'Sélection invalide (1 à 100 identifiants attendus)'
    });
  }

  try {
    const result = await Testimonial.deleteMany({
      _id: { $in: [...new Set(ids)] }
    });
    res.json({
      success: true,
      data: { deletedCount: result.deletedCount },
      message: 'Témoignages supprimés'
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.delete('/:id', adminOrEditor(), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    }
    const t = await Testimonial.findByIdAndDelete(id);
    if (!t) return res.status(404).json({ success: false, message: 'Introuvable' });
    res.json({ success: true, message: 'Supprimé' });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

router.get('/:id', adminOrEditor(), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    }
    const t = await Testimonial.findById(id);
    if (!t) return res.status(404).json({ success: false, message: 'Introuvable' });
    res.json({ success: true, data: t });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

module.exports = router;
