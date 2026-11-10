const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const crypto = require('crypto');
const DeliveryProject = require('../models/DeliveryProject');
const User = require('../models/User');
const { adminOnly } = require('../middleware/auth');
const { isValidObjectId, sanitizePlainText, isAllowedImageBuffer } = require('../utils/validation');

const STATUSES = ['BACKLOG', 'PLANNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const MILESTONE_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED'];
const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'];
class InputError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}
const FIELDS = [
  'name', 'client', 'projectManager', 'teamMembers', 'status', 'priority',
  'startDate', 'expectedCompletionDate', 'actualCompletionDate', 'budget',
  'progress', 'milestones', 'documents', 'tasks', 'clientReference', 'projectReference'
];
const DATE_FIELDS = ['startDate', 'expectedCompletionDate', 'actualCompletionDate'];
const STRING_LIMITS = {
  name: 255, client: 100, clientReference: 255, projectReference: 255
};
const DOCUMENT_DIRECTORY = path.join(__dirname, '../../uploads/delivery-documents');
const DOCUMENT_TYPES = {
  '.pdf': ['application/pdf'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/octet-stream', 'application/zip'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream', 'application/zip'],
  '.csv': ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain'],
  '.txt': ['text/plain'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.gif': ['image/gif'],
  '.webp': ['image/webp']
};
const documentUpload = multer({
  storage: multer.diskStorage({
    destination: async (req, file, callback) => {
      try {
        await fsp.mkdir(DOCUMENT_DIRECTORY, { recursive: true });
        callback(null, DOCUMENT_DIRECTORY);
      } catch (error) {
        callback(error);
      }
    },
    filename: (req, file, callback) => {
      callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
    }
  }),
  limits: {
    fileSize: Number(process.env.MAX_DOCUMENT_SIZE) || 20 * 1024 * 1024,
    files: 10
  },
  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!DOCUMENT_TYPES[extension] || !DOCUMENT_TYPES[extension].includes(file.mimetype)) {
      return callback(new InputError('Supported uploads: PDF, DOCX, XLSX, CSV, TXT, JPG, PNG, GIF, WEBP'));
    }
    callback(null, true);
  }
});

function receiveDocuments(req, res, next) {
  documentUpload.array('documents', 10)(req, res, async error => {
    if (!error) return next();
    try {
      await removeUploadedFiles(req.files || []);
    } catch (cleanupError) {
      console.error('Rejected document upload cleanup error:', cleanupError);
    }
    next(error);
  });
}

async function removeUploadedFiles(files) {
  await Promise.all(files.map(file => fsp.unlink(file.path).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  })));
}

function hasValidDocumentSignature(file) {
  const buffer = fs.readFileSync(file.path);
  const extension = path.extname(file.originalname).toLowerCase();
  if (extension === '.pdf') return buffer.subarray(0, 1024).toString('ascii').includes('%PDF-');
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(extension)) return isAllowedImageBuffer(buffer);
  if (extension === '.docx' || extension === '.xlsx') {
    if (buffer.subarray(0, 2).toString('hex') !== '504b') return false;
    const zipEntries = buffer.toString('latin1');
    return zipEntries.includes('[Content_Types].xml') &&
      zipEntries.includes(extension === '.docx' ? 'word/document.xml' : 'xl/workbook.xml');
  }
  if (extension === '.csv' || extension === '.txt') {
    return buffer.length > 0 && !buffer.includes(0) &&
      !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(buffer.toString('utf8'));
  }
  return false;
}

function fail(res, message) {
  return res.status(400).json({ success: false, message });
}

function cleanText(value, max, field, { required = false } = {}) {
  if (typeof value !== 'string') throw new InputError(`${field} must be text`);
  const text = sanitizePlainText(value.trim());
  if ((required && text.length < 2) || text.length > max) {
    throw new InputError(`${field} must be ${required ? '2-' : 'at most '}${max} characters`);
  }
  return text;
}

function cleanDate(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new InputError(`${field} must be a valid date`);
  return date;
}

function cleanNestedText(value, max, field, required = false) {
  return cleanText(value === undefined ? '' : value, max, field, { required });
}

function cleanMilestones(value) {
  if (!Array.isArray(value) || value.length > 100) throw new InputError('milestones must be an array of at most 100 items');
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new InputError(`milestones[${index}] is invalid`);
    const status = item.status || 'PENDING';
    if (!MILESTONE_STATUSES.includes(status)) throw new InputError(`milestones[${index}].status is invalid`);
    return {
      title: cleanNestedText(item.title, 255, `milestones[${index}].title`, true),
      description: cleanNestedText(item.description, 1000, `milestones[${index}].description`),
      dueDate: cleanDate(item.dueDate, `milestones[${index}].dueDate`),
      completedAt: cleanDate(item.completedAt, `milestones[${index}].completedAt`),
      status
    };
  });
}

function cleanTasks(value) {
  if (!Array.isArray(value) || value.length > 200) throw new InputError('tasks must be an array of at most 200 items');
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new InputError(`tasks[${index}] is invalid`);
    const status = item.status || 'TODO';
    if (!TASK_STATUSES.includes(status)) throw new InputError(`tasks[${index}].status is invalid`);
    if (item.assignedTo && !isValidObjectId(String(item.assignedTo))) {
      throw new InputError(`tasks[${index}].assignedTo is invalid`);
    }
    return {
      title: cleanNestedText(item.title, 255, `tasks[${index}].title`, true),
      description: cleanNestedText(item.description, 1000, `tasks[${index}].description`),
      assignedTo: item.assignedTo || null,
      dueDate: cleanDate(item.dueDate, `tasks[${index}].dueDate`),
      status
    };
  });
}

function cleanDocuments(value) {
  if (!Array.isArray(value) || value.length > 100) throw new InputError('documents must be an array of at most 100 items');
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new InputError(`documents[${index}] is invalid`);
    const name = cleanNestedText(item.name, 255, `documents[${index}].name`, true);
    const url = cleanNestedText(item.url, 2048, `documents[${index}].url`, true);
    if (!url.startsWith('/api/files/') && !/^https:\/\/[^\s]+$/i.test(url)) {
      throw new InputError(`documents[${index}].url must be an HTTPS URL or an internal file URL`);
    }
    return {
      name,
      url,
      category: cleanNestedText(item.category, 100, `documents[${index}].category`)
    };
  });
}

async function cleanPayload(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Request body must be an object');
  const clean = {};
  for (const field of FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    const value = body[field];
    if (field in STRING_LIMITS) {
      clean[field] = cleanText(value, STRING_LIMITS[field], field, { required: field === 'name' });
    } else if (field === 'status' || field === 'priority') {
      const allowed = field === 'status' ? STATUSES : PRIORITIES;
      if (!allowed.includes(value)) throw new InputError(`${field} is invalid`);
      clean[field] = value;
    } else if (DATE_FIELDS.includes(field)) {
      clean[field] = cleanDate(value, field);
    } else if (field === 'budget' || field === 'progress') {
      if (value === null || value === '') {
        if (field === 'progress') throw new InputError('progress must be a number between 0 and 100');
        clean[field] = null;
      } else {
        const number = Number(value);
        const min = 0;
        const max = field === 'progress' ? 100 : Number.MAX_SAFE_INTEGER;
        if (!Number.isFinite(number) || number < min || number > max) throw new InputError(`${field} is out of range`);
        clean[field] = number;
      }
    } else if (field === 'projectManager') {
      if (value && !isValidObjectId(String(value))) throw new InputError('projectManager is invalid');
      clean[field] = value || null;
    } else if (field === 'teamMembers') {
      if (!Array.isArray(value) || value.length > 50 || value.some(id => !isValidObjectId(String(id)))) {
        throw new InputError('teamMembers must contain valid user IDs');
      }
      clean[field] = [...new Set(value.map(String))];
    } else if (field === 'milestones') {
      clean[field] = cleanMilestones(value);
    } else if (field === 'tasks') {
      clean[field] = cleanTasks(value);
    } else if (field === 'documents') {
      clean[field] = cleanDocuments(value);
    }
  }

  if (!partial && !clean.name) throw new InputError('name is required');
  const userIds = [
    ...(clean.projectManager ? [clean.projectManager] : []),
    ...(clean.teamMembers || []),
    ...(clean.tasks || []).map(task => task.assignedTo).filter(Boolean)
  ];
  if (userIds.length) {
    const found = await User.countDocuments({ _id: { $in: userIds }, isActive: true });
    if (found !== new Set(userIds.map(String)).size) throw new InputError('One or more assigned users are invalid or inactive');
  }
  return clean;
}

function addActivity(project, req, action, details = '') {
  project.activity.push({
    action,
    details: sanitizePlainText(details).slice(0, 1000),
    actor: req.user.id,
    actorName: req.user.name
  });
}

router.use(adminOnly());

router.get('/members', async (req, res) => {
  try {
    const members = await User.find({ isActive: true, role: { $in: ['admin', 'editor'] } })
      .select('name email role')
      .sort({ name: 1 });
    res.json({ success: true, data: members });
  } catch (error) {
    console.error('Delivery project members error:', error);
    res.status(500).json({ success: false, message: 'Failed to load project team members' });
  }
});

router.get('/', async (req, res) => {
  try {
    const projects = await DeliveryProject.find()
      .populate('projectManager', 'name email role')
      .populate('teamMembers', 'name email role')
      .sort({ updatedAt: -1 });
    res.json({ success: true, data: projects });
  } catch (error) {
    console.error('Delivery projects list error:', error);
    res.status(500).json({ success: false, message: 'Failed to load delivery projects' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return fail(res, 'Invalid project ID');
    const project = await DeliveryProject.findById(req.params.id)
      .populate('projectManager', 'name email role')
      .populate('teamMembers', 'name email role')
      .populate('tasks.assignedTo', 'name email role')
      .populate('notes.author', 'name email')
      .populate('activity.actor', 'name email');
    if (!project) return res.status(404).json({ success: false, message: 'Delivery project not found' });
    res.json({ success: true, data: project });
  } catch (error) {
    console.error('Delivery project fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to load delivery project' });
  }
});

router.post('/:id/documents', receiveDocuments, async (req, res) => {
  const files = req.files || [];
  try {
    if (!isValidObjectId(req.params.id)) {
      await removeUploadedFiles(files);
      return fail(res, 'Invalid project ID');
    }
    if (!files.length) return fail(res, 'Select at least one document to upload');
    if (files.some(file => !hasValidDocumentSignature(file))) {
      await removeUploadedFiles(files);
      return fail(res, 'One or more files do not match their supported document type');
    }

    const project = await DeliveryProject.findById(req.params.id);
    if (!project) {
      await removeUploadedFiles(files);
      return res.status(404).json({ success: false, message: 'Delivery project not found' });
    }
    if (project.documents.length + files.length > 100) {
      await removeUploadedFiles(files);
      return fail(res, 'A project cannot contain more than 100 documents');
    }

    const categories = req.body.categories === undefined ? [] :
      (Array.isArray(req.body.categories) ? req.body.categories : [req.body.categories]);
    if (categories.length && categories.length !== files.length) {
      await removeUploadedFiles(files);
      return fail(res, 'Each uploaded document must have a matching category');
    }
    const uploadedDocuments = files.map((file, index) => {
      const originalName = path.basename(path.win32.basename(file.originalname));
      const name = cleanText(originalName, 255, 'document name', { required: true });
      const category = categories[index]
        ? cleanNestedText(categories[index], 100, `categories[${index}]`)
        : path.extname(file.originalname).slice(1).toUpperCase();
      return {
        name,
        url: `/api/files/delivery-documents/${file.filename}`,
        category
      };
    });
    project.documents.push(...uploadedDocuments);
    addActivity(project, req, 'DOCUMENTS_UPLOADED', `${uploadedDocuments.length} project document(s) uploaded`);
    await project.save();
    res.status(201).json({ success: true, data: project, uploaded: uploadedDocuments.length });
  } catch (error) {
    try {
      await removeUploadedFiles(files);
    } catch (cleanupError) {
      console.error('Delivery document cleanup error:', cleanupError);
    }
    console.error('Delivery project document upload error:', error);
    res.status(error instanceof InputError || error.name === 'ValidationError' ? 400 : 500)
      .json({ success: false, message: error.message || 'Failed to upload project documents' });
  }
});

router.post('/', async (req, res) => {
  try {
    const clean = await cleanPayload(req.body);
    const project = new DeliveryProject(clean);
    addActivity(project, req, 'CREATED', 'Delivery project created');
    await project.save();
    res.status(201).json({ success: true, data: project });
  } catch (error) {
    console.error('Delivery project create error:', error);
    res.status(error instanceof InputError || error.name === 'ValidationError' ? 400 : 500)
      .json({ success: false, message: error.message || 'Failed to create delivery project' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return fail(res, 'Invalid project ID');
    const clean = await cleanPayload(req.body, { partial: true });
    if (!Object.keys(clean).length) return fail(res, 'No valid project fields were supplied');
    const project = await DeliveryProject.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: 'Delivery project not found' });
    const oldStatus = project.status;
    Object.assign(project, clean);
    const action = clean.status && clean.status !== oldStatus ? 'STATUS_CHANGED' : 'UPDATED';
    addActivity(project, req, action, action === 'STATUS_CHANGED'
      ? `Status changed from ${oldStatus} to ${clean.status}`
      : 'Delivery project details updated');
    await project.save();
    res.json({ success: true, data: project });
  } catch (error) {
    console.error('Delivery project update error:', error);
    res.status(error instanceof InputError || error.name === 'ValidationError' ? 400 : 500)
      .json({ success: false, message: error.message || 'Failed to update delivery project' });
  }
});

router.post('/:id/notes', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return fail(res, 'Invalid project ID');
    const text = cleanText(req.body?.text, 10000, 'text', { required: true });
    const project = await DeliveryProject.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: 'Delivery project not found' });
    project.notes.push({ text, author: req.user.id, authorName: req.user.name });
    addActivity(project, req, 'NOTE_ADDED', 'Project note added');
    await project.save();
    res.status(201).json({ success: true, data: project });
  } catch (error) {
    console.error('Delivery project note error:', error);
    res.status(error instanceof InputError || error.name === 'ValidationError' ? 400 : 500)
      .json({ success: false, message: error.message || 'Failed to add project note' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return fail(res, 'Invalid project ID');
    const project = await DeliveryProject.findByIdAndDelete(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: 'Delivery project not found' });
    res.json({ success: true, message: 'Delivery project deleted' });
  } catch (error) {
    console.error('Delivery project delete error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete delivery project' });
  }
});

module.exports = router;
