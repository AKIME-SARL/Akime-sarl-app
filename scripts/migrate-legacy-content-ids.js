#!/usr/bin/env node

/* One-time migration for legacy Service and Project string _id values. */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId, BSON } = require('mongodb');
const { EJSON } = BSON;

const COLLECTIONS = ['services', 'projects'];
const APPLY = process.argv.includes('--apply');
const CONFIRM = process.argv.includes('--confirm');
const HEX_OBJECT_ID = /^[a-fA-F0-9]{24}$/;

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function toExtendedJson(value) {
  return EJSON.stringify(value, null, 2, { relaxed: false });
}

function fromExtendedJson(value) {
  return EJSON.parse(value, { relaxed: false });
}

function withoutId(document) {
  const { _id, ...fields } = document;
  return fields;
}

function documentsMatch(source, replacement) {
  return toExtendedJson(withoutId(source)) === toExtendedJson(withoutId(replacement));
}

function writeBackup(backupPath, backup) {
  fs.writeFileSync(backupPath, toExtendedJson(backup), 'utf8');
}

function createAndVerifyBackup(databaseName, records) {
  const backupDirectory = path.join(__dirname, '..', 'backups', `migration-legacy-ids-${timestamp()}`);
  fs.mkdirSync(backupDirectory, { recursive: true });

  const backupPath = path.join(backupDirectory, 'legacy-content-ids.json');
  const backup = {
    schemaVersion: 1,
    migrationTimestamp: new Date(),
    database: databaseName,
    status: 'prepared',
    records,
    mapping: []
  };
  backup.backupPath = backupPath;
  writeBackup(backupPath, backup);

  const verified = fromExtendedJson(fs.readFileSync(backupPath, 'utf8'));
  if (!Array.isArray(verified.records) || verified.records.length !== records.length) {
    throw new Error('Backup verification failed: record count does not match the migration plan');
  }

  console.log(`BACKUP_CREATED path=${backupPath} records=${verified.records.length}`);
  return backup;
}

async function inspectCollection(collection) {
  const documents = await collection.find({ _id: { $type: 'string' } }).toArray();
  const nonObjectIdLike = documents.filter(document => !HEX_OBJECT_ID.test(document._id));
  const totalBefore = await collection.countDocuments();
  let resumableTargets = 0;

  for (const document of documents) {
    const target = await collection.findOne({ _id: ObjectId.createFromHexString(document._id) });
    if (!target) continue;
    if (!documentsMatch(document, target)) {
      throw new Error(`${collection.collectionName}/${document._id}: target ObjectId already exists with different data; source was retained`);
    }
    resumableTargets += 1;
  }

  return { documents, nonObjectIdLike, totalBefore, resumableTargets };
}

async function migrateDocument(collection, record, backup) {
  const oldId = record.originalId;
  const newId = ObjectId.createFromHexString(oldId);
  const source = await collection.findOne({ _id: oldId });

  if (!source) throw new Error(`${collection.collectionName}/${oldId}: source document disappeared; migration stopped`);
  if (typeof source._id !== 'string') throw new Error(`${collection.collectionName}/${oldId}: source _id type changed; migration stopped`);

  const replacement = { ...source, _id: newId };
  const existingReplacement = await collection.findOne({ _id: newId });
  if (existingReplacement) {
    if (!documentsMatch(source, existingReplacement)) {
      throw new Error(`${collection.collectionName}/${oldId}: target ObjectId already exists with different data; source was retained`);
    }
    console.log(`RESUME ${collection.collectionName} ${oldId} -> ${newId.toHexString()} (replacement already present)`);
  } else {
    const insertResult = await collection.insertOne(replacement);
    if (!insertResult.acknowledged) throw new Error(`${collection.collectionName}/${oldId}: replacement insert was not acknowledged`);

    const insertedReplacement = await collection.findOne({ _id: newId });
    if (!insertedReplacement || !documentsMatch(source, insertedReplacement)) {
      throw new Error(`${collection.collectionName}/${oldId}: replacement verification failed; source was retained`);
    }
    console.log(`INSERTED ${collection.collectionName} ${oldId} -> ${newId.toHexString()}`);
  }

  const mapping = {
    collection: collection.collectionName,
    oldId,
    newId: newId.toHexString(),
    migratedAt: new Date(),
    status: 'replacement-verified'
  };
  backup.mapping.push(mapping);
  writeBackup(backup.backupPath, backup);

  const deleteResult = await collection.deleteOne({ _id: oldId });
  if (!deleteResult.acknowledged || deleteResult.deletedCount !== 1) {
    throw new Error(`${collection.collectionName}/${oldId}: source was not deleted; verified replacement remains`);
  }
  mapping.status = 'migrated';
  writeBackup(backup.backupPath, backup);
  console.log(`MIGRATED ${collection.collectionName} ${oldId} -> ${newId.toHexString()}`);
}

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  if (APPLY && !CONFIRM) throw new Error('Refusing to modify data without both --apply and --confirm');

  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  try {
    const db = client.db();
    const plan = [];
    const totalsBefore = {};
    console.log(`DATABASE ${db.databaseName}`);
    console.log('MIGRATION_LOGIC raw read -> validated backup -> insert verified ObjectId replacement -> delete source -> final verification');

    for (const name of COLLECTIONS) {
      const inspection = await inspectCollection(db.collection(name));
      totalsBefore[name] = inspection.totalBefore - inspection.resumableTargets;
      console.log(`DETECTED collection=${name} total=${inspection.totalBefore} legacyStringIds=${inspection.documents.length} objectIdIds=${inspection.totalBefore - inspection.documents.length} resumableTargets=${inspection.resumableTargets}`);
      if (inspection.nonObjectIdLike.length) {
        throw new Error(`${name} contains non-ObjectId-like string IDs: ${inspection.nonObjectIdLike.map(doc => doc._id).join(', ')}`);
      }
      for (const document of inspection.documents) {
        plan.push({ collection: name, originalId: document._id, originalDocument: document, migrationTimestamp: new Date() });
      }
    }

    if (!APPLY) {
      console.log(`DRY_RUN_ONLY plannedMigrations=${plan.length}`);
      console.log('To execute after reviewing this output: npm run migrate-legacy-content-ids -- --apply --confirm');
      return;
    }

    if (plan.length === 0) {
      console.log('NO_CHANGES_REQUIRED no legacy string IDs detected');
      return;
    }

    const backup = createAndVerifyBackup(db.databaseName, plan);
    const migratedByCollection = Object.fromEntries(COLLECTIONS.map(name => [name, 0]));
    for (const record of plan) {
      await migrateDocument(db.collection(record.collection), record, backup);
      migratedByCollection[record.collection] += 1;
    }

    backup.status = 'completed';
    backup.completedAt = new Date();
    writeBackup(backup.backupPath, backup);

    for (const name of COLLECTIONS) {
      const collection = db.collection(name);
      const totalAfter = await collection.countDocuments();
      const legacyRemaining = await collection.countDocuments({ _id: { $type: 'string' } });
      if (totalAfter !== totalsBefore[name]) {
        throw new Error(`Verification failed: ${name} count changed from ${totalsBefore[name]} to ${totalAfter}`);
      }
      if (legacyRemaining !== 0) throw new Error(`Verification failed: ${name} still has ${legacyRemaining} string _id document(s)`);
      console.log(`VERIFIED collection=${name} totalBefore=${totalsBefore[name]} totalAfter=${totalAfter} migrated=${migratedByCollection[name]} legacyRemaining=${legacyRemaining}`);
    }
    console.log(`MIGRATION_COMPLETE backup=${backup.backupPath}`);
  } finally {
    await client.close();
  }
}

run().catch(error => {
  console.error(`MIGRATION_FAILED ${error.message}`);
  process.exitCode = 1;
});
