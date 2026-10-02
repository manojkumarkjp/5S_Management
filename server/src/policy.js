'use strict';
/* Server-side authorisation + business validation for document writes.
   The browser enforces the same rules for usability; this is the authoritative check. */
const { zoneIdsFor } = require('./repo');

class HttpError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code || ({ 400: 'bad_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 422: 'invalid_argument', 423: 'locked' }[status] || 'error'); } }
const deny = (msg) => { throw new HttpError(403, msg || 'You do not have permission for this change.', 'forbidden'); };

const PRIV = ['admin', 'facilitator'];
const level = (settings, role, fn) => ((settings.permissions || {})[role] || {})[fn] || 'none';
const isEdit = (settings, role, fn) => level(settings, role, fn) === 'edit';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const changedKeys = (a, b) => { const ks = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]); return [...ks].filter((k) => !same((a || {})[k], (b || {})[k])); };

async function authorize({ user, coll, id, op, existing, next, settings, client }) {
  const role = user.role; const S = settings || {};
  const zones = async () => new Set(await zoneIdsFor(user, client));
  const inZone = async (z) => (await zones()).has(z);

  switch (coll) {
    case 'cfg':
      if (role !== 'admin') deny('Only the System Administrator can change system settings and masters.');
      if (!['settings', 'masters'].includes(id)) throw new HttpError(404, 'Unknown configuration document');
      return;

    case 'users':
      if (role !== 'admin') deny('Only the System Administrator can manage users.');
      if (op === 'delete') deny('Users are deactivated, not deleted.');
      return;

    case 'zones':
      if (!isEdit(S, role, '5S Organization') || !PRIV.includes(role)) deny('You cannot change zones.');
      if (op === 'delete') deny('Zones are deactivated, not deleted.');
      return;

    case 'checksheets':
      if (role !== 'admin') deny('Only the System Administrator can change checksheets.');
      if (existing && next && existing.status !== 'Draft' && op !== 'delete') {
        // released versions are immutable except for status/effective dates (history must not change)
        const k = changedKeys(existing, next).filter((x) => !['status', 'effectiveTo', 'supersededBy', 'releasedAt'].includes(x));
        if (k.length) throw new HttpError(423, 'A released checksheet version cannot be edited. Create a new version instead.', 'locked');
      }
      if (op === 'delete' && existing && existing.status !== 'Draft') throw new HttpError(423, 'Released checksheet versions cannot be deleted.', 'locked');
      return;

    case 'schedules':
      if (!isEdit(S, role, 'Audit Planner')) deny('You cannot change audit schedules.');
      return;

    case 'workorders': {
      if (op === 'delete') deny('Work orders are cancelled, not deleted.');
      if (PRIV.includes(role)) { lockCheck(existing, next, user); return; }
      if (!existing) deny('You cannot create work orders.');
      if (role === 'auditor') {
        if (existing.auditor !== user.id && existing.backupAuditor !== user.id) deny('This audit is not assigned to you.');
        if (existing.locked) throw new HttpError(423, 'This audit is submitted and locked.', 'locked');
        if (next && ['Closed', 'Cancelled'].includes(next.status)) deny('An auditor cannot close or cancel an audit.');
        if (next && next.status === 'Approved' && !((next.approvals || []).length === 0 && next.locked && next.submittedAt)) deny('An auditor cannot approve an audit.');
        return;
      }
      if (role === 'leader') {
        if (!(await inZone(existing.zone))) deny('This audit is outside your zone.');
        const bad = changedKeys(existing, next).filter((k) => !['approvals', 'status', 'locked', 'history'].includes(k));
        if (bad.length) deny('A Zone Leader can only approve or reject an audit.');
        return;
      }
      return deny();
    }

    case 'findings': {
      if (op === 'delete') deny('Findings cannot be deleted.');
      if (!isEdit(S, role, 'Findings')) deny('You have view-only access to findings.');
      if (PRIV.includes(role)) return;
      if (role === 'auditor') {
        if (existing) { if (existing.createdBy !== user.id) deny('Only the auditor who raised the finding can change it.'); return; }
        const wo = await client.query('SELECT auditor_id, backup_auditor_id, zone_id, locked FROM audit_work_orders WHERE id=$1', [next.woId]);
        if (!wo.rows[0] || (wo.rows[0].auditor_id !== user.id && wo.rows[0].backup_auditor_id !== user.id)) deny('Findings can only be raised from your own audit.');
        if (wo.rows[0].zone_id !== next.zone) throw new HttpError(422, 'Finding zone does not match the audit zone.');
        if (next.due && next.auditDate && String(next.due) < String(next.auditDate)) throw new HttpError(422, 'Due date cannot be before the audit date.');
        return;
      }
      if (role === 'leader') { const z = existing ? existing.zone : next.zone; if (!(await inZone(z))) deny('This finding is outside your zone.'); if (!existing) deny('Zone Leaders cannot raise findings.'); return; }
      return deny();
    }

    case 'actions': {
      if (op === 'delete') deny('Actions cannot be deleted.');
      const verifyEdit = isEdit(S, role, 'Verify Actions');
      if (next) {
        const wasVerified = existing && ['Verified', 'Closed'].includes(existing.status);
        const verifying = ['Verified'].includes(next.status) || next.status === 'Rejected';
        if (next.status === 'Rejected' && !(next.history || []).some((h) => h.to === 'Rejected' && h.note)) throw new HttpError(422, 'A rejected action must contain rejection remarks.');
        if (next.status === 'Closed' && !wasVerified && !next.verifiedBy) throw new HttpError(422, 'A closed action requires verification.');
        if ((verifying || next.status === 'Closed') && existing && existing.status !== next.status && !verifyEdit) deny('You cannot verify or close actions.');
        if (next.status === 'Verified' && existing && existing.responsible === user.id && role !== 'admin') deny('The responsible person cannot verify their own action.');
      }
      if (PRIV.includes(role)) return;
      if (!existing) {
        if (role !== 'auditor') deny('You cannot create actions.');
        const wo = await client.query('SELECT auditor_id, backup_auditor_id FROM audit_work_orders WHERE id=$1', [next.woId]);
        if (!wo.rows[0] || (wo.rows[0].auditor_id !== user.id && wo.rows[0].backup_auditor_id !== user.id)) deny('Actions can only be created from your own audit.');
        if (!next.responsible) throw new HttpError(422, 'Action owner must be selected.');
        return;
      }
      if (role === 'leader') { if (!(await inZone(existing.zone))) deny('This action is outside your zone.'); return; }
      if (role === 'member') {
        const mine = existing.responsible === user.id;
        if (!mine && !(await inZone(existing.zone))) deny('This action is not assigned to you.');
        return;
      }
      return deny();
    }

    case 'improvements':
      if (role === 'management') deny('Management has read-only access.');
      if (PRIV.includes(role)) return;
      if (!(await inZone(existing ? existing.zone : next.zone)) && role !== 'auditor') deny('This improvement is outside your zone.');
      return;

    case 'notifications':
      if (op === 'delete' && role !== 'admin') deny();
      if (existing && !(existing.to || []).includes(user.id) && role !== 'admin') deny();
      if (existing && next) { const bad = changedKeys(existing, next).filter((k) => !['readBy'].includes(k)); if (bad.length && role !== 'admin') deny('Notifications can only be marked as read.'); }
      return;

    case 'logs': {
      if (op === 'delete') deny('The audit trail cannot be deleted.');
      if (existing) {
        if (existing.__owner && existing.__owner !== user.id && role !== 'admin') deny('The audit trail cannot be edited.');
        const old = existing.entries || []; const neu = (next && next.entries) || [];
        if (neu.length < old.length || !same(old, neu.slice(0, old.length))) throw new HttpError(403, 'The audit trail is append-only.', 'forbidden');
      }
      // entries must be attributed to the signed-in user
      const old = existing ? (existing.entries || []).length : 0;
      ((next && next.entries) || []).slice(old).forEach((e) => { e.user = user.id; });
      return;
    }
    default:
      throw new HttpError(404, 'Unknown collection');
  }
}

/* audit locking: submitted+locked audits keep their responses and score unless reopened in the same change */
function lockCheck(existing, next, user) {
  if (!existing || !next) return;
  if (existing.locked && next.locked) {
    const bad = changedKeys(existing, next).filter((k) => ['responses', 'score', 'checksheetId', 'csVersion', 'zone', 'auditor'].includes(k));
    if (bad.length) throw new HttpError(423, 'This audit is locked. Use Reopen Audit with a reason to correct it.', 'locked');
  }
  if (existing.locked && !next.locked) {
    const prevReopens = (existing.reopens || []).length; const n = (next.reopens || []);
    const rejected = (next.history || []).slice(-1)[0] && (next.history.slice(-1)[0].status === 'Rejected');
    if (!rejected && (n.length <= prevReopens || !n[n.length - 1].reason)) throw new HttpError(422, 'Reopening an audit requires a reason.', 'invalid_argument');
  }
}

module.exports = { authorize, HttpError, deny, level, changedKeys };
