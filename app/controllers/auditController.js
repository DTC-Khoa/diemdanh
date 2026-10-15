const { query } = require('../database/db');

// Lay danh sach nhat ky audit logs cho Admin
async function listAuditLogs(req, res) {
  try {
    const { action = '', search = '', page = 1, limit = 20 } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const limitNum = parseInt(limit, 10);

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (action.trim()) {
      whereClause += ' AND al.action = ?';
      params.push(action.trim());
    }

    if (search.trim()) {
      whereClause += ' AND (al.reason LIKE ? OR u.username LIKE ? OR al.target_table LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s, s);
    }

    const [countRows] = await query(`
      SELECT COUNT(*) as total
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ${whereClause}
    `, params);

    const total = countRows[0].total;

    const [rows] = await query(`
      SELECT al.*, u.username as operator_username, u.role as operator_role
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ${whereClause}
      ORDER BY al.id DESC
      LIMIT ? OFFSET ?
    `, [...params, limitNum, offset]);

    res.json({
      success: true,
      data: rows,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });

  } catch (err) {
    console.error('listAuditLogs error:', err);
    res.status(500).json({ success: false, message: 'Lỗi khi tải nhật ký kiểm toán' });
  }
}

module.exports = {
  listAuditLogs
};
