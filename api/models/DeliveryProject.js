const mongoose = require('mongoose');

const milestoneSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 255 },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  dueDate: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  status: {
    type: String,
    enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED'],
    default: 'PENDING'
  }
}, { timestamps: true });

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 255 },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  dueDate: { type: Date, default: null },
  status: {
    type: String,
    enum: ['TODO', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'],
    default: 'TODO'
  }
}, { timestamps: true });

const documentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 255 },
  url: { type: String, required: true, trim: true, maxlength: 2048 },
  category: { type: String, trim: true, maxlength: 100, default: '' },
  addedAt: { type: Date, default: Date.now }
});

const noteSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true, maxlength: 10000 },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorName: { type: String, required: true, maxlength: 100 },
  createdAt: { type: Date, default: Date.now }
});

const activitySchema = new mongoose.Schema({
  action: { type: String, required: true, maxlength: 100 },
  details: { type: String, trim: true, maxlength: 1000, default: '' },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actorName: { type: String, trim: true, maxlength: 100, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const deliveryProjectSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 255 },
  client: { type: String, trim: true, maxlength: 100, default: '' },
  projectManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  teamMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  status: {
    type: String,
    enum: ['BACKLOG', 'PLANNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'],
    default: 'BACKLOG'
  },
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
    default: 'MEDIUM'
  },
  startDate: { type: Date, default: null },
  expectedCompletionDate: { type: Date, default: null },
  actualCompletionDate: { type: Date, default: null },
  budget: { type: Number, min: 0, default: null },
  progress: { type: Number, min: 0, max: 100, default: 0 },
  milestones: { type: [milestoneSchema], default: [] },
  documents: { type: [documentSchema], default: [] },
  notes: { type: [noteSchema], default: [] },
  tasks: { type: [taskSchema], default: [] },
  activity: { type: [activitySchema], default: [] },
  clientReference: { type: String, trim: true, maxlength: 255, default: '' },
  projectReference: { type: String, trim: true, maxlength: 255, default: '' }
}, { timestamps: true });

deliveryProjectSchema.index({ status: 1, expectedCompletionDate: 1 });
deliveryProjectSchema.index({ projectManager: 1 });
deliveryProjectSchema.index({ teamMembers: 1 });

module.exports = mongoose.model('DeliveryProject', deliveryProjectSchema);
