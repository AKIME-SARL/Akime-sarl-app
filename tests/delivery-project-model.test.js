const test = require('node:test');
const assert = require('node:assert/strict');
const DeliveryProject = require('../api/models/DeliveryProject');
const PortfolioProject = require('../api/models/Project');

test('delivery projects use a separate collection from public portfolio projects', () => {
  assert.notEqual(DeliveryProject, PortfolioProject);
  assert.notEqual(
    DeliveryProject.collection.collectionName,
    PortfolioProject.collection.collectionName
  );
});

test('delivery projects accept the supported lifecycle and valid delivery fields', () => {
  const project = new DeliveryProject({
    name: 'Bridge construction',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    progress: 45,
    milestones: [{
      title: 'Foundation',
      status: 'IN_PROGRESS'
    }],
    tasks: [{
      title: 'Prepare site',
      status: 'TODO'
    }],
    documents: [{
      name: 'Construction plan.pdf',
      url: '/api/files/delivery-documents/construction-plan.pdf',
      category: 'PDF'
    }]
  });

  assert.equal(project.validateSync(), undefined);
  assert.equal(project.milestones[0].completedAt, null);
});

test('delivery projects reject invalid status, missing name, and out-of-range progress', () => {
  const project = new DeliveryProject({
    status: 'PUBLISHED',
    progress: 101
  });
  const error = project.validateSync();

  assert.ok(error);
  assert.ok(error.errors.name);
  assert.ok(error.errors.status);
  assert.ok(error.errors.progress);
});
