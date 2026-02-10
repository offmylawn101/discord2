const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../models/database');
const { authenticate } = require('../middleware/auth');

// GET /folders - get user's folders
router.get('/', authenticate, async (req, res) => {
  const folders = await db.all('SELECT * FROM server_folders WHERE user_id = ? ORDER BY position', [req.user.id]);
  res.json(folders.map(f => ({ ...f, server_ids: JSON.parse(f.server_ids || '[]') })));
});

// POST /folders - create a folder
router.post('/', authenticate, async (req, res) => {
  const { name, color, server_ids } = req.body;
  const id = uuidv4();
  const maxPos = await db.get('SELECT MAX(position) as max FROM server_folders WHERE user_id = ?', [req.user.id]);
  const position = (maxPos?.max ?? -1) + 1;

  await db.run(
    'INSERT INTO server_folders (id, user_id, name, color, server_ids, position) VALUES (?, ?, ?, ?, ?, ?)',
    [id, req.user.id, name || 'Folder', color || '#5865F2', JSON.stringify(server_ids || []), position]
  );

  const folder = await db.get('SELECT * FROM server_folders WHERE id = ?', [id]);
  res.json({ ...folder, server_ids: JSON.parse(folder.server_ids || '[]') });
});

// PATCH /folders/:folderId - update a folder
router.patch('/:folderId', authenticate, async (req, res) => {
  const { name, color, server_ids } = req.body;
  const folder = await db.get('SELECT * FROM server_folders WHERE id = ? AND user_id = ?', [req.params.folderId, req.user.id]);
  if (!folder) return res.status(404).json({ error: 'Folder not found' });

  const updates = [];
  const params = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (color !== undefined) { updates.push('color = ?'); params.push(color); }
  if (server_ids !== undefined) { updates.push('server_ids = ?'); params.push(JSON.stringify(server_ids)); }

  if (updates.length > 0) {
    params.push(req.params.folderId);
    await db.run(`UPDATE server_folders SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  const updated = await db.get('SELECT * FROM server_folders WHERE id = ?', [req.params.folderId]);
  res.json({ ...updated, server_ids: JSON.parse(updated.server_ids || '[]') });
});

// DELETE /folders/:folderId - delete a folder
router.delete('/:folderId', authenticate, async (req, res) => {
  await db.run('DELETE FROM server_folders WHERE id = ? AND user_id = ?', [req.params.folderId, req.user.id]);
  res.json({ success: true });
});

module.exports = router;
