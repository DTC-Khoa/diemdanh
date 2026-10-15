const { query } = require('../database/db');

async function recordAudit({ userId, action, targetTable, targetId, oldValues = null, newValues = null, reason = '', ipAddress = '' }) {
  try {
    const oldValJson = oldValues ? JSON.stringify(oldValues) : null;
    const newValJson = newValues ? JSON.stringify(newValues) : null;

    await query(`
      INSERT INTO audit_logs (user_id, action, target_table, target_id, old_values, new_values, reason, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [userId || null, action, targetTable, targetId, oldValJson, newValJson, reason, ipAddress]);
  } catch (err) {
    console.error('[Audit] Loi khi ghi audit log:', err.message);
  }
}

module.exports = {
  recordAudit
};
