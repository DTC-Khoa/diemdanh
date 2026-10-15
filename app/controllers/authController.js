const bcrypt = require('bcryptjs');
const { query } = require('../database/db');
const { recordAudit } = require('../middleware/audit');

// Dang nhap
async function login(req, res) {
  try {
    const { username, password } = req.body;
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ tên đăng nhập/email và mật khẩu' });
    }

    // Kiem tra tan suat dang nhap sai (chong brute force) trong 15 phut
    const [failedAttempts] = await query(`
      SELECT COUNT(*) as failCount 
      FROM login_logs 
      WHERE username = ? AND status = 'failed' AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)
    `, [username]);

    if (failedAttempts[0].failCount >= 5) {
      return res.status(429).json({ 
        success: false, 
        message: 'Tài khoản tạm thời bị khóa đăng nhập do nhập sai quá 5 lần. Vui lòng thử lại sau 15 phút.' 
      });
    }

    // Tim user theo username hoac email
    const [users] = await query(`
      SELECT u.id, u.username, u.email, u.password_hash, u.role, u.status,
             e.id as employee_id, e.employee_code, e.full_name, e.department, e.position, e.shift_id
      FROM users u
      LEFT JOIN employees e ON u.id = e.user_id
      WHERE u.username = ? OR u.email = ?
      LIMIT 1
    `, [username.trim(), username.trim()]);

    if (users.length === 0) {
      await query('INSERT INTO login_logs (username, ip_address, status) VALUES (?, ?, ?)', [username, ipAddress, 'failed']);
      return res.status(401).json({ success: false, message: 'Tên đăng nhập hoặc mật khẩu không chính xác' });
    }

    const user = users[0];

    // Kiem tra trang thai tai khoan
    if (user.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Tài khoản của bạn đã bị vô hiệu hóa. Vui lòng liên hệ Quản trị viên.' });
    }

    // Kiem tra mat khau bang bcrypt
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      await query('INSERT INTO login_logs (username, ip_address, status) VALUES (?, ?, ?)', [username, ipAddress, 'failed']);
      return res.status(401).json({ success: false, message: 'Tên đăng nhập hoặc mật khẩu không chính xác' });
    }

    // Ghi nhan dang nhap thanh cong
    await query('INSERT INTO login_logs (username, ip_address, status) VALUES (?, ?, ?)', [username, ipAddress, 'success']);

    // Tai tao session de bao ve chong session fixation
    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regenerate error:', err);
        return res.status(500).json({ success: false, message: 'Lỗi khởi tạo phiên đăng nhập' });
      }

      req.session.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status,
        employee_id: user.employee_id,
        employee_code: user.employee_code,
        full_name: user.full_name,
        department: user.department,
        position: user.position,
        shift_id: user.shift_id
      };

      const redirectUrl = user.role === 'admin' ? '/admin/dashboard' : '/employee/dashboard';
      return res.json({
        success: true,
        message: 'Đăng nhập thành công',
        user: req.session.user,
        redirectUrl
      });
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống khi xử lý đăng nhập' });
  }
}

// Dang xuat
function logout(req, res) {
  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        console.error('Logout error:', err);
      }
      res.clearCookie('attendance_sid');
      if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
        return res.json({ success: true, message: 'Đăng xuất thành công', redirectUrl: '/login' });
      }
      return res.redirect('/login');
    });
  } else {
    res.redirect('/login');
  }
}

// Lay thong tin ca nhan
async function getProfile(req, res) {
  try {
    const userId = req.session.user.id;
    const [rows] = await query(`
      SELECT u.id, u.username, u.email, u.role, u.status, u.created_at,
             e.id as employee_id, e.employee_code, e.full_name, e.phone, e.department, e.position,
             s.name as shift_name, s.start_time, s.end_time
      FROM users u
      LEFT JOIN employees e ON u.id = e.user_id
      LEFT JOIN shifts s ON e.shift_id = s.id
      WHERE u.id = ?
    `, [userId]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin tài khoản' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('getProfile error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy thông tin hồ sơ' });
  }
}

// Cap nhat thong tin ca nhan
async function updateProfile(req, res) {
  try {
    const userId = req.session.user.id;
    const { full_name, phone, email } = req.body;

    if (!full_name || !email) {
      return res.status(400).json({ success: false, message: 'Họ tên và Email không được để trống' });
    }

    // Kiem tra email da bi trung voi user khac chua
    const [emailCheck] = await query('SELECT id FROM users WHERE email = ? AND id != ?', [email.trim(), userId]);
    if (emailCheck.length > 0) {
      return res.status(400).json({ success: false, message: 'Email đã được sử dụng bởi tài khoản khác' });
    }

    await query('UPDATE users SET email = ? WHERE id = ?', [email.trim(), userId]);
    await query('UPDATE employees SET full_name = ?, phone = ? WHERE user_id = ?', [full_name.trim(), phone || '', userId]);

    // Cap nhat session
    req.session.user.email = email.trim();
    req.session.user.full_name = full_name.trim();

    res.json({ success: true, message: 'Cập nhật thông tin cá nhân thành công' });
  } catch (err) {
    console.error('updateProfile error:', err);
    res.status(500).json({ success: false, message: 'Lỗi cập nhật thông tin cá nhân' });
  }
}

// Doi mat khau
async function changePassword(req, res) {
  try {
    const userId = req.session.user.id;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ các trường mật khẩu' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có tối thiểu 6 ký tự' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Mật khẩu mới và xác nhận mật khẩu không khớp' });
    }

    // Kiem tra mat khau cu
    const [users] = await query('SELECT password_hash FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    }

    const isMatch = await bcrypt.compare(currentPassword, users[0].password_hash);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại không chính xác' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId]);

    await recordAudit({
      userId,
      action: 'CHANGE_PASSWORD',
      targetTable: 'users',
      targetId: userId,
      reason: 'Người dùng đổi mật khẩu',
      ipAddress: req.ip
    });

    res.json({ success: true, message: 'Đổi mật khẩu thành công!' });
  } catch (err) {
    console.error('changePassword error:', err);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống khi đổi mật khẩu' });
  }
}

module.exports = {
  login,
  logout,
  getProfile,
  updateProfile,
  changePassword
};
