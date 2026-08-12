const express = require('express');
const router = express.Router();
const { adminOnly } = require('../middleware/auth');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');
const {
  isValidObjectId,
  isSafeFilename,
  isSafeBackupName,
  isValidUploadDirectory,
  STRING_LIMITS
} = require('../utils/validation');

// ── User Management Endpoints ─────────────────────────────────────────────────
router.get('/users', adminOnly(), async (req, res) => {
  try {
    const users = await User.find().select('-password -refreshTokens -twoFactorSecret');
    res.json({
      success: true,
      users
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get users',
      error: error.message
    });
  }
});

router.delete('/users/:userId', adminOnly(), async (req, res) => {
  try {
    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Identifiant utilisateur invalide'
      });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    await User.findByIdAndDelete(userId);
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: error.message
    });
  }
});

// ── Backup Endpoints ──────────────────────────────────────────────────────────
router.post('/backup', adminOnly(), async (req, res) => {
  try {
    const { spawn } = require('child_process');
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'backup.js');

    const backup = spawn('node', [scriptPath], {
      cwd: path.join(__dirname, '..', '..')
    });

    let stdout = '';
    let stderr = '';

    backup.stdout.on('data', data => { stdout += data.toString(); });
    backup.stderr.on('data', data => { stderr += data.toString(); });

    await new Promise((resolve, reject) => {
      backup.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`Backup exited with code ${code}: ${stderr || stdout}`));
      });
      backup.on('error', reject);
    });
    
    if (stderr) console.error('Backup stderr:', stderr);
    
    res.json({
      success: true,
      message: 'Backup completed successfully',
      output: stdout
    });
  } catch (error) {
    console.error('Backup error:', error);
    res.status(500).json({
      success: false,
      message: 'Backup failed',
      error: error.message
    });
  }
});

router.get('/backups', adminOnly(), async (req, res) => {
  try {
    const backupsRoot = path.join(__dirname, '..', '..', 'backups');
    
    if (!fs.existsSync(backupsRoot)) {
      return res.json({ success: true, backups: [] });
    }
    
    const entries = fs.readdirSync(backupsRoot, { withFileTypes: true });
    const backups = entries
      .filter(entry => entry.isDirectory() && entry.name.startsWith('backup-'))
      .filter(entry => isSafeBackupName(entry.name))
      .map(entry => {
        const fullPath = path.join(backupsRoot, entry.name);
        const stat = fs.statSync(fullPath);
        
        let manifest = null;
        const manifestPath = path.join(fullPath, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
          try {
            manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          } catch (e) {
            console.error('Error reading manifest:', e);
          }
        }
        
        return {
          name: entry.name,
          createdAt: stat.mtime,
          path: fullPath,
          manifest
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json({
      success: true,
      backups
    });
  } catch (error) {
    console.error('Get backups error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to list backups',
      error: error.message
    });
  }
});

router.post('/restore/:backupName', adminOnly(), async (req, res) => {
  try {
    const { backupName } = req.params;
    const backupsRoot = path.join(__dirname, '..', '..', 'backups');

    if (!isSafeBackupName(backupName)) {
      return res.status(400).json({
        success: false,
        message: 'Nom de sauvegarde invalide'
      });
    }

    const backupPath = path.resolve(backupsRoot, backupName);
    if (!backupPath.startsWith(path.resolve(backupsRoot))) {
      return res.status(400).json({
        success: false,
        message: 'Chemin de sauvegarde invalide'
      });
    }

    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({
        success: false,
        message: 'Sauvegarde introuvable'
      });
    }

    const { spawn } = require('child_process');
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'restore.js');

    const restore = spawn('node', [scriptPath, backupName, '--confirm'], {
      cwd: path.join(__dirname, '..', '..')
    });

    let stdout = '';
    let stderr = '';

    restore.stdout.on('data', data => { stdout += data.toString(); });
    restore.stderr.on('data', data => { stderr += data.toString(); });

    await new Promise((resolve, reject) => {
      restore.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`Restore exited with code ${code}: ${stderr || stdout}`));
      });
      restore.on('error', reject);
    });
    
    if (stderr) console.error('Restore stderr:', stderr);
    
    res.json({
      success: true,
      message: 'Restore completed successfully',
      output: stdout
    });
  } catch (error) {
    console.error('Restore error:', error);
    res.status(500).json({
      success: false,
      message: 'Restore failed',
      error: error.message
    });
  }
});

router.delete('/backups/:backupName', adminOnly(), async (req, res) => {
  try {
    const { backupName } = req.params;
    const backupsRoot = path.join(__dirname, '..', '..', 'backups');

    if (!isSafeBackupName(backupName)) {
      return res.status(400).json({
        success: false,
        message: 'Nom de sauvegarde invalide'
      });
    }

    const backupPath = path.resolve(backupsRoot, backupName);
    if (!backupPath.startsWith(path.resolve(backupsRoot))) {
      return res.status(400).json({
        success: false,
        message: 'Chemin de sauvegarde invalide'
      });
    }
    
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({
        success: false,
        message: 'Backup not found'
      });
    }
    
    fs.rmSync(backupPath, { recursive: true, force: true });
    
    res.json({
      success: true,
      message: 'Backup deleted successfully'
    });
  } catch (error) {
    console.error('Delete backup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete backup',
      error: error.message
    });
  }
});

// ── File Manager Endpoints ─────────────────────────────────────────────────────
router.get('/files', adminOnly(), async (req, res) => {
  try {
    const uploadsRoot = path.join(__dirname, '..', '..', 'uploads');
    
    const directories = [
      { name: 'projects', path: path.join(uploadsRoot, 'projects') },
      { name: 'equipment', path: path.join(uploadsRoot, 'equipment') },
      { name: 'services', path: path.join(uploadsRoot, 'services') },
      { name: 'general', path: path.join(uploadsRoot, 'general') }
    ];
    
    const allFiles = [];
    
    for (const dir of directories) {
      if (fs.existsSync(dir.path)) {
        const entries = fs.readdirSync(dir.path, { withFileTypes: true });
        const files = entries
          .filter(entry => entry.isFile())
          .map(entry => {
            const fullPath = path.join(dir.path, entry.name);
            const stat = fs.statSync(fullPath);
            
            return {
              name: entry.name,
              directory: dir.name,
              path: `/uploads/${dir.name}/${entry.name}`,
              size: stat.size,
              createdAt: stat.birthtime,
              updatedAt: stat.mtime
            };
          });
        
        allFiles.push(...files);
      }
    }
    
    // Sort by date, newest first
    allFiles.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json({
      success: true,
      files: allFiles
    });
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to list files',
      error: error.message
    });
  }
});

router.delete('/files/:directory/:filename', adminOnly(), async (req, res) => {
  try {
    const { directory, filename } = req.params;
    const uploadsRoot = path.join(__dirname, '..', '..', 'uploads');
    
    if (!isValidUploadDirectory(directory)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid directory'
      });
    }

    if (!isSafeFilename(filename)) {
      return res.status(400).json({
        success: false,
        message: 'Nom de fichier invalide'
      });
    }
    
    const filePath = path.resolve(uploadsRoot, directory, filename);
    if (!filePath.startsWith(path.resolve(uploadsRoot))) {
      return res.status(400).json({
        success: false,
        message: 'Chemin de fichier invalide'
      });
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    fs.unlinkSync(filePath);
    
    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete file',
      error: error.message
    });
  }
});

module.exports = router;
