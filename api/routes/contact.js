const router  = require('express').Router();
const nodemailer = require('nodemailer');
const Message = require('../models/Message');
const { adminOrEditor } = require('../middleware/auth');
const {
  isValidObjectId,
  isValidEmail,
  isValidStringLength,
  trimString,
  sanitizePlainText,
  STRING_LIMITS
} = require('../utils/validation');

const PHONE_REGEX = /^[+()\d\s\-]{6,30}$/;

function createTransporter() {
  const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS } = process.env;
  if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASS) return null;

  return nodemailer.createTransport({
    host: EMAIL_HOST,
    port: parseInt(EMAIL_PORT) || 587,
    secure: parseInt(EMAIL_PORT) === 465,
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });
}

async function sendContactEmail(msg) {
  const transporter = createTransporter();

  if (!transporter) {
    console.warn('⚠️  SMTP not configured — skipping email notification');
    return;
  }

  const companyEmail = process.env.COMPANY_EMAIL || process.env.EMAIL_USER;
  const companyName  = process.env.COMPANY_NAME  || 'A-KIME Sarl';

  const escapeHtml = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  const safe = {
    name: escapeHtml(msg.name),
    email: escapeHtml(msg.email),
    phone: msg.phone ? escapeHtml(msg.phone) : null,
    company: msg.company ? escapeHtml(msg.company) : null,
    serviceType: msg.serviceType ? escapeHtml(msg.serviceType) : null,
    subject: msg.subject ? escapeHtml(msg.subject) : null,
    content: escapeHtml(msg.content),
    createdAt: msg.createdAt,
    _id: msg._id
  };

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#1a1a1a">📩 Nouveau message — ${companyName}</h2>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:6px 0;font-weight:bold;width:130px">Nom</td>
            <td style="padding:6px 0">${safe.name}</td></tr>
        <tr><td style="padding:6px 0;font-weight:bold">Email</td>
            <td style="padding:6px 0"><a href="mailto:${safe.email}">${safe.email}</a></td></tr>
        ${safe.phone   ? `<tr><td style="padding:6px 0;font-weight:bold">Téléphone</td><td style="padding:6px 0">${safe.phone}</td></tr>` : ''}
        ${safe.company ? `<tr><td style="padding:6px 0;font-weight:bold">Société</td><td style="padding:6px 0">${safe.company}</td></tr>` : ''}
        ${safe.serviceType ? `<tr><td style="padding:6px 0;font-weight:bold">Service</td><td style="padding:6px 0">${safe.serviceType}</td></tr>` : ''}
        ${safe.subject ? `<tr><td style="padding:6px 0;font-weight:bold">Sujet</td><td style="padding:6px 0">${safe.subject}</td></tr>` : ''}
      </table>
      <hr style="margin:16px 0;border:none;border-top:1px solid #ddd"/>
      <p style="white-space:pre-wrap;color:#333">${safe.content}</p>
      <hr style="margin:16px 0;border:none;border-top:1px solid #ddd"/>
      <p style="color:#888;font-size:12px">Reçu le ${new Date(safe.createdAt).toLocaleString('fr-FR')} · ID: ${safe._id}</p>
    </div>`;

  await transporter.sendMail({
    from: `"${companyName}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
    to: companyEmail,
    replyTo: safe.email,
    subject: `[Contact] ${safe.subject || safe.serviceType || 'Nouveau message'} — ${safe.name}`,
    html,
  });

  console.log(`📧  Contact email sent to ${companyEmail}`);
}

router.post('/', async (req, res) => {
  try {
    let { name, email, phone, company, serviceType, subject, content } = req.body;

    name = sanitizePlainText(trimString(name));
    email = trimString(email);
    phone = phone ? sanitizePlainText(trimString(phone)) : null;
    company = company ? sanitizePlainText(trimString(company)) : null;
    serviceType = serviceType ? sanitizePlainText(trimString(serviceType)) : null;
    subject = subject ? sanitizePlainText(trimString(subject)) : null;
    content = sanitizePlainText(trimString(content));

    const errors = [];

    if (!isValidStringLength(name, STRING_LIMITS.NAME_MIN, STRING_LIMITS.NAME_MAX)) {
      errors.push(`Nom invalide (${STRING_LIMITS.NAME_MIN}-${STRING_LIMITS.NAME_MAX} caractères)`);
    }

    if (!isValidEmail(email)) {
      errors.push('Adresse email invalide');
    }

    if (phone && !PHONE_REGEX.test(phone)) {
      errors.push('Numéro de téléphone invalide');
    }

    if (company && !isValidStringLength(company, 0, STRING_LIMITS.NAME_MAX)) {
      errors.push(`Nom d'entreprise trop long (max ${STRING_LIMITS.NAME_MAX} caractères)`);
    }

    if (serviceType && !isValidStringLength(serviceType, 0, STRING_LIMITS.SHORT_TEXT_MAX)) {
      errors.push(`Type de service trop long (max ${STRING_LIMITS.SHORT_TEXT_MAX} caractères)`);
    }

    if (subject && !isValidStringLength(subject, 0, STRING_LIMITS.SUBJECT_MAX)) {
      errors.push(`Sujet trop long (max ${STRING_LIMITS.SUBJECT_MAX} caractères)`);
    }

    if (!isValidStringLength(content, 10, STRING_LIMITS.LONG_TEXT_MAX)) {
      errors.push(`Message invalide (10-${STRING_LIMITS.LONG_TEXT_MAX} caractères)`);
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation',
        errors
      });
    }

    const msg = await Message.create({
      name,
      email: email.toLowerCase(),
      phone,
      company,
      serviceType,
      subject,
      content
    });

    sendContactEmail(msg).catch(err =>
      console.error('❌  Failed to send contact email:', err.message)
    );

    res.json({ success: true, message: 'Message reçu', data: { id: msg._id } });
  } catch (error) {
    console.error('Contact create error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/', adminOrEditor(), async (req, res) => {
  try {
    const list = await Message.find().sort({ createdAt: -1 });
    res.json({ success: true, data: list });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/bulk/read', adminOrEditor(), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "Aucun ID fourni" });
    }
    if (ids.length > 500) {
      return res.status(400).json({ success: false, message: "Trop d'IDs (max 500)" });
    }
    const invalidIds = ids.filter(id => !isValidObjectId(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Identifiants invalides détectés',
        invalidIds
      });
    }

    const result = await Message.updateMany(
      { _id: { $in: ids } },
      { read: true }
    );

    res.json({ success: true, message: `${result.modifiedCount} messages marqués comme lus` });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/bulk/delete', adminOrEditor(), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "Aucun ID fourni" });
    }
    if (ids.length > 500) {
      return res.status(400).json({ success: false, message: "Trop d'IDs (max 500)" });
    }
    const invalidIds = ids.filter(id => !isValidObjectId(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Identifiants invalides détectés',
        invalidIds
      });
    }

    const result = await Message.deleteMany({ _id: { $in: ids } });

    res.json({ success: true, message: `${result.deletedCount} messages supprimés` });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/:id', adminOrEditor(), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    }
    const msg = await Message.findById(id);
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });
    res.json({ success: true, data: msg });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/:id/read', adminOrEditor(), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    }
    const msg = await Message.findByIdAndUpdate(
      id,
      { read: true },
      { new: true }
    );
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });
    res.json({ success: true, data: msg });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/:id', adminOrEditor(), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    }
    const msg = await Message.findByIdAndDelete(id);
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });
    res.json({ success: true, message: 'Message supprimé' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
