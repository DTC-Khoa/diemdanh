const bcrypt = require('bcryptjs');
const { query, getPool } = require('../database/db');
const { recordAudit } = require('../middleware/audit');

// Danh sach nhan vien co tim kiem va phan trang
async function listEmployees(req, res) {
  try {
    const { search = '', department = '', status = '', page = 1, limit = 10 } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const limitNum = parseInt(limit, 10);

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (search.trim()) {
      whereClause += ' AND (e.full_name LIKE ? OR e.employee_code LIKE ? OR u.email LIKE ? OR u.username LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s);
    }

    if (department.trim()) {
      whereClause += ' AND e.department = ?';
      params.push(department.trim());
    }

    if (status.trim()) {
      whereClause += ' AND u.status = ?';
      params.push(status.trim());
    }

    // Dem tong so ban ghi
    const [countRows] = await query(`
      SELECT COUNT(*) as total
      FROM employees e
      JOIN users u ON e.user_id = u.id
      ${whereClause}
    `, params);

    const total = countRows[0].total;

    // Lay danh sach
    const querySql = `
      SELECT e.id, e.user_id, e.employee_code, e.full_name, e.phone, e.department, e.position, e.shift_id, e.created_at,
             u.username, u.email, u.role, u.status,
             s.name as shift_name, s.start_time, s.end_time
      FROM employees e
      JOIN users u ON e.user_id = u.id
      LEFT JOIN shifts s ON e.shift_id = s.id
      ${whereClause}
      ORDER BY e.id DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await query(querySql, [...params, limitNum, offset]);

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
    console.error('listEmployees error:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải danh sách nhân viên' });
  }
}

// Lay chi tiet 1 nhan vien
async function getEmployeeById(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await query(`
      SELECT e.*, u.username, u.email, u.role, u.status,
             s.name as shift_name, s.start_time, s.end_time
      FROM employees e
      JOIN users u ON e.user_id = u.id
      LEFT JOIN shifts s ON e.shift_id = s.id
      WHERE e.id = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhân viên' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('getEmployeeById error:', err);
    res.status(500).json({ success: false, message: 'Lỗi lấy thông tin nhân viên' });
  }
}

// Them nhan vien moi
async function createEmployee(req, res) {
  const pool = await getPool();
  const conn = await pool.getConnection();

  try {
    const {
      username,
      email,
      password = 'User@123',
      role = 'employee',
      employee_code,
      full_name,
      phone = '',
      department = 'Phòng Kỹ Thuật',
      position = 'Nhân viên',
      shift_id = 1
    } = req.body;

    // Validate
    if (!username || !email || !employee_code || !full_name) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ: Tên đăng nhập, Email, Mã nhân viên và Họ tên' });
    }

    // Kiem tra ton tai username, email, employee_code
    const [existCheck] = await conn.query(`
      SELECT 
        SUM(CASE WHEN u.username = ? THEN 1 ELSE 0 END) as userExists,
        SUM(CASE WHEN u.email = ? THEN 1 ELSE 0 END) as emailExists,
        SUM(CASE WHEN e.employee_code = ? THEN 1 ELSE 0 END) as codeExists
      FROM users u
      LEFT JOIN employees e ON u.id = e.user_id
      WHERE u.username = ? OR u.email = ? OR e.employee_code = ?
    `, [username.trim(), email.trim(), employee_code.trim(), username.trim(), email.trim(), employee_code.trim()]);

    if (existCheck[0].userExists > 0) {
      conn.release();
      return res.status(400).json({ success: false, message: 'Tên đăng nhập đã tồn tại trong hệ thống' });
    }
    if (existCheck[0].emailExists > 0) {
      conn.release();
      return res.status(400).json({ success: false, message: 'Email đã được sử dụng bởi tài khoản khác' });
    }
    if (existCheck[0].codeExists > 0) {
      conn.release();
      return res.status(400).json({ success: false, message: 'Mã nhân viên đã tồn tại trong hệ thống' });
    }

    await conn.beginTransaction();

    const passwordHash = await bcrypt.hash(password || 'User@123', 10);

    // 1. Tao User
    const [userRes] = await conn.query(`
      INSERT INTO users (username, email, password_hash, role, status)
      VALUES (?, ?, ?, ?, 'active')
    `, [username.trim(), email.trim(), passwordHash, role]);

    const userId = userRes.insertId;

    // 2. Tao Employee
    const [empRes] = await conn.query(`
      INSERT INTO employees (user_id, employee_code, full_name, phone, department, position, shift_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [userId, employee_code.trim().toUpperCase(), full_name.trim(), phone.trim(), department.trim(), position.trim(), shift_id || 1]);

    const empId = empRes.insertId;

    await conn.commit();
    conn.release();

    // Ghi audit
    await recordAudit({
      userId: req.session.user.id,
      action: 'CREATE_EMPLOYEE',
      targetTable: 'employees',
      targetId: empId,
      newValues: { username, email, employee_code, full_name, department, position, role },
      reason: 'Admin tạo nhân viên mới',
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'Tạo tài khoản nhân viên thành công!',
      data: { id: empId, employee_code, full_name }
    });

  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error('createEmployee error:', err);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống khi tạo nhân viên: ' + err.message });
  }
}

// Cap nhat thong tin nhan vien
async function updateEmployee(req, res) {
  const pool = await getPool();
  const conn = await pool.getConnection();

  try {
    const { id } = req.params;
    const { email, full_name, phone, department, position, shift_id, role, status } = req.body;

    const [oldRows] = await conn.query(`
      SELECT e.*, u.email, u.role, u.status, u.username
      FROM employees e
      JOIN users u ON e.user_id = u.id
      WHERE e.id = ?
    `, [id]);

    if (oldRows.length === 0) {
      conn.release();
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhân viên cần sửa' });
    }

    const oldData = oldRows[0];

    // Kiem tra email trung lap
    if (email && email.trim() !== oldData.email) {
      const [emailCheck] = await conn.query('SELECT id FROM users WHERE email = ? AND id != ?', [email.trim(), oldData.user_id]);
      if (emailCheck.length > 0) {
        conn.release();
        return res.status(400).json({ success: false, message: 'Email đã được sử dụng bởi người khác' });
      }
    }

    await conn.beginTransaction();

    // Cap nhat users
    const updateUsersSql = 'UPDATE users SET email = ?, role = ?, status = ? WHERE id = ?';
    await conn.query(updateUsersSql, [
      email ? email.trim() : oldData.email,
      role || oldData.role,
      status || oldData.status,
      oldData.user_id
    ]);

    // Cap nhat employees
    const updateEmpSql = `
      UPDATE employees 
      SET full_name = ?, phone = ?, department = ?, position = ?, shift_id = ?
      WHERE id = ?
    `;
    await conn.query(updateEmpSql, [
      full_name ? full_name.trim() : oldData.full_name,
      phone !== undefined ? phone.trim() : oldData.phone,
      department || oldData.department,
      position || oldData.position,
      shift_id || oldData.shift_id,
      id
    ]);

    await conn.commit();
    conn.release();

    const newData = { email, full_name, phone, department, position, shift_id, role, status };

    await recordAudit({
      userId: req.session.user.id,
      action: 'UPDATE_EMPLOYEE',
      targetTable: 'employees',
      targetId: id,
      oldValues: oldData,
      newValues: newData,
      reason: 'Admin cập nhật thông tin nhân viên',
      ipAddress: req.ip
    });

    res.json({ success: true, message: 'Cập nhật thông tin nhân viên thành công' });

  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error('updateEmployee error:', err);
    res.status(500).json({ success: false, message: 'Lỗi cập nhật nhân viên: ' + err.message });
  }
}

// Khoa / Mo khoa tai khoan nhan vien
async function toggleStatus(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await query(`
      SELECT e.id, e.user_id, e.full_name, u.username, u.status, u.role
      FROM employees e
      JOIN users u ON e.user_id = u.id
      WHERE e.id = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhân viên' });
    }

    const emp = rows[0];

    // Khong the khoa chinh minh
    if (emp.user_id === req.session.user.id) {
      return res.status(400).json({ success: false, message: 'Bạn không thể tự khóa tài khoản của chính mình' });
    }

    const newStatus = emp.status === 'active' ? 'inactive' : 'active';
    await query('UPDATE users SET status = ? WHERE id = ?', [newStatus, emp.user_id]);

    await recordAudit({
      userId: req.session.user.id,
      action: newStatus === 'active' ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
      targetTable: 'users',
      targetId: emp.user_id,
      oldValues: { status: emp.status },
      newValues: { status: newStatus },
      reason: `Quản trị viên ${newStatus === 'active' ? 'kích hoạt' : 'khóa'} tài khoản ${emp.username}`,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: `Đã ${newStatus === 'active' ? 'mở khóa kích hoạt' : 'khóa vô hiệu hóa'} tài khoản thành công`,
      newStatus
    });

  } catch (err) {
    console.error('toggleStatus error:', err);
    res.status(500).json({ success: false, message: 'Lỗi khi thay đổi trạng thái tài khoản' });
  }
}

module.exports = {
  listEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  toggleStatus
};
