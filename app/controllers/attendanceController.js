const { query, getPool } = require('../database/db');
const { recordAudit } = require('../middleware/audit');
const { attendanceEventsTotal } = require('../middleware/metrics');

// Helper dinh dang ngay YYYY-MM-DD
function getLocalDateString(d = new Date()) {
  const pad = (n) => (n < 10 ? '0' + n : n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Helper lay so phut tu chuoi HH:mm:ss hoac HH:mm
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.toString().split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

// ==============================================================
// 1. CHUC NANG DIEM DANH VAO (CHECK-IN) CHO NHAN VIEN
// ==============================================================
async function checkIn(req, res) {
  const pool = await getPool();
  const conn = await pool.getConnection();

  try {
    const userId = req.session.user.id;
    const now = new Date();
    const workDate = getLocalDateString(now);

    // Lay thong tin nhan vien va ca lam
    const [empRows] = await conn.query(`
      SELECT e.id, e.employee_code, e.full_name, e.shift_id, u.status,
             s.name as shift_name, s.start_time, s.end_time, s.late_grace_minutes, s.early_grace_minutes, s.is_overnight
      FROM employees e
      JOIN users u ON e.user_id = u.id
      LEFT JOIN shifts s ON e.shift_id = s.id
      WHERE e.user_id = ?
    `, [userId]);

    if (empRows.length === 0) {
      conn.release();
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin nhân viên' });
    }

    const emp = empRows[0];

    if (emp.status !== 'active') {
      conn.release();
      return res.status(403).json({ success: false, message: 'Tài khoản của bạn đang bị khóa, không thể điểm danh' });
    }

    if (!emp.shift_id || !emp.start_time) {
      conn.release();
      return res.status(400).json({ success: false, message: 'Bạn chưa được phân ca làm việc. Vui lòng liên hệ Quản trị viên để được gán ca.' });
    }

    await conn.beginTransaction();

    // Kiem tra xem da co ban ghi diem danh hom nay chua (khoa dong FOR UPDATE de tranh race condition)
    const [existing] = await conn.query(`
      SELECT * FROM attendance 
      WHERE employee_id = ? AND work_date = ? AND shift_id = ?
      FOR UPDATE
    `, [emp.id, workDate, emp.shift_id]);

    if (existing.length > 0 && existing[0].check_in) {
      await conn.rollback();
      conn.release();
      return res.status(400).json({
        success: false,
        message: `Bạn đã điểm danh vào lúc ${new Date(existing[0].check_in).toLocaleTimeString('vi-VN')} rồi! Không thể điểm danh vào nhiều lần.`,
        data: existing[0]
      });
    }

    // Tinh toan trang thai Di muon hay Dung gio dua vao gio ca lam va grace period
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const shiftStartMinutes = timeToMinutes(emp.start_time);
    const lateGrace = emp.late_grace_minutes || 15;
    const allowedLatestMinutes = shiftStartMinutes + lateGrace;

    let status = 'on_time';
    let statusText = 'Đúng giờ';

    if (currentMinutes > allowedLatestMinutes) {
      status = 'late';
      const lateBy = currentMinutes - shiftStartMinutes;
      statusText = `Đi muộn (${lateBy} phút)`;
    }

    let attendanceId;
    if (existing.length > 0) {
      attendanceId = existing[0].id;
      await conn.query(`
        UPDATE attendance 
        SET check_in = NOW(), status = ?, note = ?
        WHERE id = ?
      `, [status, `Điểm danh vào: ${statusText}`, attendanceId]);
    } else {
      const [insRes] = await conn.query(`
        INSERT INTO attendance (employee_id, shift_id, work_date, check_in, status, note)
        VALUES (?, ?, ?, NOW(), ?, ?)
      `, [emp.id, emp.shift_id, workDate, status, `Điểm danh vào: ${statusText}`]);
      attendanceId = insRes.insertId;
    }

    await conn.commit();
    conn.release();

    // Increment metrics
    attendanceEventsTotal.inc({ type: 'check_in', status });

    res.json({
      success: true,
      message: `Điểm danh vào thành công! Trạng thái: ${statusText}`,
      data: {
        id: attendanceId,
        check_in: now,
        status,
        statusText,
        workDate
      }
    });

  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error('checkIn error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi điểm danh: ' + err.message });
  }
}

// ==============================================================
// 2. CHUC NANG DIEM DANH RA (CHECK-OUT) CHO NHAN VIEN
// ==============================================================
async function checkOut(req, res) {
  const pool = await getPool();
  const conn = await pool.getConnection();

  try {
    const userId = req.session.user.id;
    const now = new Date();
    const workDate = getLocalDateString(now);

    const [empRows] = await conn.query(`
      SELECT e.id, e.shift_id, s.end_time, s.early_grace_minutes, s.is_overnight
      FROM employees e
      LEFT JOIN shifts s ON e.shift_id = s.id
      WHERE e.user_id = ?
    `, [userId]);

    if (empRows.length === 0) {
      conn.release();
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin nhân viên' });
    }

    const emp = empRows[0];

    await conn.beginTransaction();

    // Lay ban ghi hom nay
    const [attRows] = await conn.query(`
      SELECT * FROM attendance 
      WHERE employee_id = ? AND work_date = ?
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE
    `, [emp.id, workDate]);

    if (attRows.length === 0 || !attRows[0].check_in) {
      await conn.rollback();
      conn.release();
      return res.status(400).json({ success: false, message: 'Bạn chưa điểm danh vào hôm nay, không thể điểm danh ra!' });
    }

    const att = attRows[0];

    if (att.check_out) {
      await conn.rollback();
      conn.release();
      return res.status(400).json({
        success: false,
        message: `Bạn đã điểm danh ra lúc ${new Date(att.check_out).toLocaleTimeString('vi-VN')} rồi!`
      });
    }

    // Tinh gio lam viec
    const checkInDate = new Date(att.check_in);
    const diffMs = now.getTime() - checkInDate.getTime();
    const workingHours = Math.max(0, +(diffMs / (1000 * 60 * 60)).toFixed(2));

    // Kiem tra co ve som khong
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const shiftEndMinutes = timeToMinutes(emp.end_time);
    const earlyGrace = emp.early_grace_minutes || 15;
    const allowedEarliestMinutes = shiftEndMinutes - earlyGrace;

    let finalStatus = 'completed';
    let note = att.note ? `${att.note} | Hoàn thành ca` : 'Hoàn thành ca';

    // Neu ve som hon gio cho phep (khong tinh ca qua dem phuc tap o buoc don gian nay)
    if (!emp.is_overnight && currentMinutes < allowedEarliestMinutes) {
      finalStatus = 'early_leave';
      const earlyBy = shiftEndMinutes - currentMinutes;
      note = att.note ? `${att.note} | Về sớm ${earlyBy} phút` : `Về sớm ${earlyBy} phút`;
    }

    await conn.query(`
      UPDATE attendance 
      SET check_out = NOW(), status = ?, working_hours = ?, note = ?
      WHERE id = ?
    `, [finalStatus, workingHours, note, att.id]);

    await conn.commit();
    conn.release();

    attendanceEventsTotal.inc({ type: 'check_out', status: finalStatus });

    res.json({
      success: true,
      message: `Điểm danh ra thành công! Tổng thời gian làm việc: ${workingHours} giờ.`,
      data: {
        id: att.id,
        check_out: now,
        workingHours,
        status: finalStatus
      }
    });

  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error('checkOut error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi điểm danh ra: ' + err.message });
  }
}

// ==============================================================
// 3. ADMIN: XEM TOAN BO BAN GHI DIEM DANH
// ==============================================================
async function listAttendanceAdmin(req, res) {
  try {
    const {
      search = '',
      date = '',
      month = '',
      shift_id = '',
      status = '',
      page = 1,
      limit = 15
    } = req.query;

    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const limitNum = parseInt(limit, 10);

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (search.trim()) {
      whereClause += ' AND (e.full_name LIKE ? OR e.employee_code LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s);
    }

    if (date.trim()) {
      whereClause += ' AND a.work_date = ?';
      params.push(date.trim());
    }

    if (month.trim()) {
      whereClause += ' AND DATE_FORMAT(a.work_date, "%Y-%m") = ?';
      params.push(month.trim());
    }

    if (shift_id.trim()) {
      whereClause += ' AND a.shift_id = ?';
      params.push(shift_id.trim());
    }

    if (status.trim()) {
      whereClause += ' AND a.status = ?';
      params.push(status.trim());
    }

    // Dem tong
    const [countRows] = await query(`
      SELECT COUNT(*) as total
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      JOIN shifts s ON a.shift_id = s.id
      ${whereClause}
    `, params);

    const total = countRows[0].total;

    // Lay du lieu
    const [rows] = await query(`
      SELECT a.*, e.employee_code, e.full_name, e.department,
             s.name as shift_name, s.start_time, s.end_time
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      JOIN shifts s ON a.shift_id = s.id
      ${whereClause}
      ORDER BY a.work_date DESC, a.check_in DESC, a.id DESC
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
    console.error('listAttendanceAdmin error:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải danh sách điểm danh' });
  }
}

// ==============================================================
// 4. ADMIN: DIEU CHINH BAN GHI DIEM DANH (CO AUDIT LOG BAT BUOC)
// ==============================================================
async function adjustAttendance(req, res) {
  try {
    const { id } = req.params;
    const { check_in, check_out, status, note, reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Bắt buộc phải nhập Lý do điều chỉnh để lưu vào nhật ký kiểm toán (Audit Log)!' });
    }

    // Lay ban ghi cu
    const [oldRows] = await query('SELECT * FROM attendance WHERE id = ?', [id]);
    if (oldRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bản ghi điểm danh cần chỉnh sửa' });
    }

    const oldData = oldRows[0];

    // Tinh toan lai gio lam viec neu ca check_in va check_out deu co
    let workingHours = oldData.working_hours;
    const finalIn = check_in ? new Date(check_in) : (oldData.check_in ? new Date(oldData.check_in) : null);
    const finalOut = check_out ? new Date(check_out) : (oldData.check_out ? new Date(oldData.check_out) : null);

    if (finalIn && finalOut && finalOut > finalIn) {
      const diffMs = finalOut.getTime() - finalIn.getTime();
      workingHours = +(diffMs / (1000 * 60 * 60)).toFixed(2);
    }

function formatToMySQLDateTime(val) {
  if (!val) return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  const pad = (n) => (n < 10 ? '0' + n : n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

    const finalInSql = check_in ? formatToMySQLDateTime(check_in) : (oldData.check_in ? formatToMySQLDateTime(oldData.check_in) : null);
    const finalOutSql = check_out ? formatToMySQLDateTime(check_out) : (oldData.check_out ? formatToMySQLDateTime(oldData.check_out) : null);

    // Cap nhat
    await query(`
      UPDATE attendance
      SET check_in = ?, check_out = ?, status = ?, working_hours = ?, note = ?
      WHERE id = ?
    `, [
      finalInSql,
      finalOutSql,
      status || oldData.status,
      workingHours,
      note !== undefined ? note : oldData.note,
      id
    ]);

    const newData = {
      check_in: finalInSql,
      check_out: finalOutSql,
      status: status || oldData.status,
      working_hours: workingHours,
      note: note !== undefined ? note : oldData.note
    };

    // Ghi vao audit_logs
    await recordAudit({
      userId: req.session.user.id,
      action: 'ADJUST_ATTENDANCE',
      targetTable: 'attendance',
      targetId: id,
      oldValues: oldData,
      newValues: newData,
      reason: reason.trim(),
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'Điều chỉnh bản ghi điểm danh và lưu vết kiểm toán thành công!',
      data: newData
    });

  } catch (err) {
    console.error('adjustAttendance error:', err);
    res.status(500).json({ success: false, message: 'Lỗi khi điều chỉnh điểm danh: ' + err.message });
  }
}

module.exports = {
  checkIn,
  checkOut,
  listAttendanceAdmin,
  adjustAttendance
};
