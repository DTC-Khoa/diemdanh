const { query } = require('../database/db');
const { recordAudit } = require('../middleware/audit');

// Lay danh sach tat ca ca lam viec
async function listShifts(req, res) {
  try {
    const [rows] = await query(`
      SELECT s.*, 
             (SELECT COUNT(*) FROM employees e WHERE e.shift_id = s.id) as employee_count
      FROM shifts s
      ORDER BY s.start_time ASC
    `);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('listShifts error:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải danh sách ca làm việc' });
  }
}

// Lay chi tiet ca lam viec
async function getShiftById(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await query('SELECT * FROM shifts WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy ca làm việc' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('getShiftById error:', err);
    res.status(500).json({ success: false, message: 'Lỗi lấy thông tin ca làm' });
  }
}

// Tao ca lam viec moi
async function createShift(req, res) {
  try {
    const { name, start_time, end_time, late_grace_minutes = 15, early_grace_minutes = 15, description = '' } = req.body;

    if (!name || !start_time || !end_time) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập Tên ca, Giờ bắt đầu và Giờ kết thúc' });
    }

    // Tu dong xac dinh ca qua dem neu gio ket thuc nho hon gio bat dau
    const isOvernight = end_time < start_time ? 1 : 0;

    const [result] = await query(`
      INSERT INTO shifts (name, start_time, end_time, late_grace_minutes, early_grace_minutes, is_overnight, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [name.trim(), start_time, end_time, parseInt(late_grace_minutes, 10), parseInt(early_grace_minutes, 10), isOvernight, description.trim()]);

    const shiftId = result.insertId;

    await recordAudit({
      userId: req.session.user.id,
      action: 'CREATE_SHIFT',
      targetTable: 'shifts',
      targetId: shiftId,
      newValues: { name, start_time, end_time, late_grace_minutes, early_grace_minutes, isOvernight, description },
      reason: 'Admin tạo ca làm việc mới',
      ipAddress: req.ip
    });

    res.json({ success: true, message: 'Tạo ca làm việc thành công', shiftId });

  } catch (err) {
    console.error('createShift error:', err);
    res.status(500).json({ success: false, message: 'Lỗi tạo ca làm việc: ' + err.message });
  }
}

// Cap nhat ca lam viec
async function updateShift(req, res) {
  try {
    const { id } = req.params;
    const { name, start_time, end_time, late_grace_minutes = 15, early_grace_minutes = 15, description = '' } = req.body;

    const [oldRows] = await query('SELECT * FROM shifts WHERE id = ?', [id]);
    if (oldRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy ca làm việc cần sửa' });
    }

    const isOvernight = end_time < start_time ? 1 : 0;

    await query(`
      UPDATE shifts 
      SET name = ?, start_time = ?, end_time = ?, late_grace_minutes = ?, early_grace_minutes = ?, is_overnight = ?, description = ?
      WHERE id = ?
    `, [name.trim(), start_time, end_time, parseInt(late_grace_minutes, 10), parseInt(early_grace_minutes, 10), isOvernight, description.trim(), id]);

    await recordAudit({
      userId: req.session.user.id,
      action: 'UPDATE_SHIFT',
      targetTable: 'shifts',
      targetId: id,
      oldValues: oldRows[0],
      newValues: { name, start_time, end_time, late_grace_minutes, early_grace_minutes, isOvernight, description },
      reason: 'Admin cập nhật ca làm việc',
      ipAddress: req.ip
    });

    res.json({ success: true, message: 'Cập nhật ca làm việc thành công' });

  } catch (err) {
    console.error('updateShift error:', err);
    res.status(500).json({ success: false, message: 'Lỗi cập nhật ca làm việc' });
  }
}

// Xoa ca lam viec
async function deleteShift(req, res) {
  try {
    const { id } = req.params;

    // Kiem tra co nhan vien dang su dung ca lam nay khong
    const [empCheck] = await query('SELECT COUNT(*) as empCount FROM employees WHERE shift_id = ?', [id]);
    if (empCheck[0].empCount > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Không thể xóa ca làm này vì hiện đang có ${empCheck[0].empCount} nhân viên được gán ca này. Vui lòng chuyển ca cho nhân viên trước.` 
      });
    }

    const [oldRows] = await query('SELECT * FROM shifts WHERE id = ?', [id]);
    if (oldRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy ca làm việc' });
    }

    await query('DELETE FROM shifts WHERE id = ?', [id]);

    await recordAudit({
      userId: req.session.user.id,
      action: 'DELETE_SHIFT',
      targetTable: 'shifts',
      targetId: id,
      oldValues: oldRows[0],
      reason: 'Admin xóa ca làm việc',
      ipAddress: req.ip
    });

    res.json({ success: true, message: 'Đã xóa ca làm việc thành công' });

  } catch (err) {
    console.error('deleteShift error:', err);
    res.status(500).json({ success: false, message: 'Lỗi khi xóa ca làm việc: ' + err.message });
  }
}

module.exports = {
  listShifts,
  getShiftById,
  createShift,
  updateShift,
  deleteShift
};
