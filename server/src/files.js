'use strict';
/* Photograph storage. Images are validated by content (not by extension), re-encoded (EXIF stripped,
   compressed) and stored on disk outside the database together with a thumbnail.
   The Storage interface is deliberately small (put/get/remove) so an S3 / Azure Blob driver can replace the disk driver. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const express = require('express');
const cfg = require('./config');
const { pool } = require('./db');
const repo = require('./repo');
const { HttpError } = require('./policy');

const disk = {
  async put(rel, buf) { const p = path.join(cfg.uploadDir, rel); await fs.promises.mkdir(path.dirname(p), { recursive: true }); await fs.promises.writeFile(p, buf); },
  async get(rel) { return fs.promises.readFile(path.join(cfg.uploadDir, rel)); },
  async remove(rel) { try { await fs.promises.unlink(path.join(cfg.uploadDir, rel)); } catch (e) { /* already gone */ } },
};
const storage = disk;

const ALLOWED = new Set(['jpeg', 'png', 'webp', 'gif', 'heif', 'tiff']);
const router = express.Router();

function decodeDataUrl(s) {
  const m = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(s || ''));
  if (!m) throw new HttpError(422, 'Photograph must be a base64 image.');
  return Buffer.from(m[1], 'base64');
}

/* POST /api/files  { id?, full: dataURL, name, woId?, qid?, findingId?, actionId?, improvementId? } */
router.post('/', express.json({ limit: Math.ceil(cfg.maxUploadMb * 1.5) + 'mb' }), async (req, res, next) => {
  try {
    const b = req.body || {}; const raw = decodeDataUrl(b.full);
    if (raw.length > cfg.maxUploadMb * 1024 * 1024) throw new HttpError(413, `Photograph is larger than ${cfg.maxUploadMb} MB.`);
    let meta; try { meta = await sharp(raw, { failOn: 'error' }).metadata(); } catch (e) { throw new HttpError(422, 'The file is not a readable image.'); }
    if (!ALLOWED.has(meta.format)) throw new HttpError(422, 'Unsupported image type.');
    const img = await sharp(raw).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    const thumb = await sharp(img.data).resize({ width: 320, height: 320, fit: 'inside' }).jpeg({ quality: 70 }).toBuffer();
    const id = /^[A-Za-z0-9_-]{4,40}$/.test(b.id || '') ? b.id : 'PH-' + crypto.randomBytes(8).toString('hex');
    const d = new Date(); const rel = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${id}.jpg`; const trel = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${id}.thumb.jpg`;
    let zone = null;
    if (b.woId) { const w = await pool.query('SELECT zone_id, auditor_id, backup_auditor_id FROM audit_work_orders WHERE id=$1', [b.woId]); if (w.rows[0]) { zone = w.rows[0].zone_id; if (['auditor'].includes(req.user.role) && ![w.rows[0].auditor_id, w.rows[0].backup_auditor_id].includes(req.user.id)) throw new HttpError(403, 'This audit is not assigned to you.'); } }
    if (!zone && b.findingId) zone = ((await pool.query('SELECT zone_id FROM audit_findings WHERE id=$1', [b.findingId])).rows[0] || {}).zone_id || null;
    if (!zone && b.actionId) zone = ((await pool.query('SELECT zone_id FROM actions WHERE id=$1', [b.actionId])).rows[0] || {}).zone_id || null;
    if (req.user.role === 'management') throw new HttpError(403, 'Management has read-only access.');
    await storage.put(rel, img.data); await storage.put(trel, thumb);
    const safe = (v, n = 60) => (v ? String(v).slice(0, n) : null);
    await pool.query(`INSERT INTO attachments(id,file_name,mime_type,size_bytes,width,height,storage_path,thumb_path,work_order_id,finding_id,action_id,improvement_id,qid,zone_id,uploaded_by,sha256)
      VALUES ($1,$2,'image/jpeg',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (id) DO UPDATE SET storage_path=EXCLUDED.storage_path, thumb_path=EXCLUDED.thumb_path, size_bytes=EXCLUDED.size_bytes`,
      [id, safe(b.name, 120) || id + '.jpg', img.data.length, img.info.width, img.info.height, rel, trel, safe(b.woId), safe(b.findingId), safe(b.actionId), safe(b.improvementId), safe(b.qid), zone, req.user.id, crypto.createHash('sha256').update(img.data).digest('hex')]);
    res.status(201).json({ id, url: '/api/files/' + id, thumbUrl: '/api/files/' + id + '?thumb=1', size: img.data.length, width: img.info.width, height: img.info.height });
  } catch (e) { next(e); }
});

/* GET /api/files/:id[?thumb=1]  (access follows the zone the photograph belongs to) */
router.get('/:id', async (req, res, next) => {
  try {
    const r = await pool.query('SELECT * FROM attachments WHERE id=$1', [req.params.id]);
    const a = r.rows[0]; if (!a) throw new HttpError(404, 'Photograph not found');
    const role = req.user.role;
    if (!['admin', 'facilitator', 'management'].includes(role) && a.uploaded_by !== req.user.id && a.zone_id) {
      const zones = new Set(await repo.zoneIdsFor(req.user));
      const own = await pool.query("SELECT 1 FROM audit_work_orders WHERE id=$1 AND (auditor_id=$2 OR backup_auditor_id=$2)", [a.work_order_id, req.user.id]);
      if (!zones.has(a.zone_id) && !own.rowCount) throw new HttpError(403, 'You do not have access to this photograph.');
    }
    const buf = await storage.get(req.query.thumb && a.thumb_path ? a.thumb_path : a.storage_path);
    res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' }).send(buf);
  } catch (e) { next(e); }
});

module.exports = router;
