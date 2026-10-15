const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const dbConfig = {
  host: process.env.DB_HOST || 'mysql',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'rootpassword',
  database: process.env.DB_NAME || 'attendance_db',
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  timezone: '+07:00',
  multipleStatements: true
};

let pool = null;

async function getPool() {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
  }
  return pool;
}

// Ham retry ket noi database khi container MySQL khoi dong
async function initDatabase(maxRetries = 15, delayMs = 3000) {
  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      attempts++;
      console.log(`[Database] Dang thu ket noi toi MySQL (${dbConfig.host}:${dbConfig.port}) - Lan ${attempts}/${maxRetries}...`);
      
      // Ket noi truc tiep de kiem tra
      const testConn = await mysql.createConnection({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        multipleStatements: true
      });

      console.log('[Database] Ket noi MySQL thanh cong!');

      // Doc file init.sql va thuc thi de dam bao day du bang
      const initSqlPath = path.join(__dirname, 'init.sql');
      if (fs.existsSync(initSqlPath)) {
        const sql = fs.readFileSync(initSqlPath, 'utf8');
        await testConn.query(sql);
        console.log('[Database] Da kiem tra va khoi tao schema tu init.sql thanh cong.');
      }
      await testConn.end();

      // Khoi tao pool
      pool = mysql.createPool(dbConfig);

      // Kiem tra va cap nhat mat khau chuan bcrypt cho tai khoan admin va demo
      await seedDefaultAccounts();

      return pool;
    } catch (err) {
      console.error(`[Database] Loi ket noi (lan ${attempts}):`, err.message);
      if (attempts >= maxRetries) {
        throw new Error(`Khong the ket noi toi MySQL sau ${maxRetries} lan: ${err.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

// Seed tai khoan mac dinh voi bcrypt hash that
async function seedDefaultAccounts() {
  try {
    const adminHash = await bcrypt.hash('Admin@123', 10);
    const userHash = await bcrypt.hash('User@123', 10);

    // Kiem tra admin da co chua
    const [admins] = await pool.query('SELECT id, password_hash FROM users WHERE username = ?', ['admin']);
    if (admins.length === 0) {
      const [uRes] = await pool.query(
        'INSERT INTO users (username, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)',
        ['admin', 'admin@diemdanh.dtc', adminHash, 'admin', 'active']
      );
      await pool.query(
        'INSERT INTO employees (user_id, employee_code, full_name, phone, department, position, shift_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uRes.insertId, 'ADM001', 'Quản Trị Viên Hệ Thống', '0901234567', 'Ban Quản Trị', 'Quản trị viên', 1]
      );
      console.log('[Database] Da tao tai khoan Admin mac dinh: admin / Admin@123');
    } else {
      // Cap nhat mat khau Admin@123 dam bao luon dang nhap duoc
      await pool.query('UPDATE users SET password_hash = ? WHERE username = ?', [adminHash, 'admin']);
    }

    // Kiem tra nv001
    const [employees] = await pool.query('SELECT id FROM users WHERE username = ?', ['nv001']);
    if (employees.length === 0) {
      const [uRes] = await pool.query(
        'INSERT INTO users (username, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)',
        ['nv001', 'nguyenvana@diemdanh.dtc', userHash, 'employee', 'active']
      );
      await pool.query(
        'INSERT INTO employees (user_id, employee_code, full_name, phone, department, position, shift_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uRes.insertId, 'NV001', 'Nguyễn Văn An', '0912345678', 'Phòng Kỹ Thuật', 'Kỹ sư phần mềm', 1]
      );
      console.log('[Database] Da tao tai khoan Nhan vien mac dinh: nv001 / User@123');
    } else {
      await pool.query('UPDATE users SET password_hash = ? WHERE username IN (?, ?, ?)', [userHash, 'nv001', 'nv002', 'nv003']);
    }

    // Tao du lieu diem danh mau neu chua co ban ghi nao trong thang hien tai
    await seedSampleAttendance();

  } catch (error) {
    console.error('[Database] Loi khi khoi tao tai khoan mac dinh:', error);
  }
}

// Seed mau cac ban ghi cham cong de dashboard co so lieu va bieu do
async function seedSampleAttendance() {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) as cnt FROM attendance');
    if (rows[0].cnt > 0) return; // Da co du lieu

    const [emps] = await pool.query('SELECT id, shift_id FROM employees');
    if (emps.length === 0) return;

    console.log('[Database] Khoi tao du lieu diem danh mau cho 7 ngay gan nhat...');
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      if (isWeekend && i > 0) continue;

      for (const emp of emps) {
        const shiftId = emp.shift_id || 1;
        // Mot vai nguoi dung gio, mot vai nguoi di muon, nguoi ve som
        let checkInTime = `${dateStr} 07:55:00`;
        let checkOutTime = `${dateStr} 17:05:00`;
        let status = 'completed';
        let workingHours = 8.00;

        if (emp.id % 3 === 0) {
          checkInTime = `${dateStr} 08:25:00`; // Di muon
          status = 'late';
          workingHours = 7.50;
        } else if (emp.id % 4 === 0) {
          checkOutTime = `${dateStr} 16:30:00`; // Ve som
          status = 'early_leave';
          workingHours = 7.50;
        }

        // Hom nay: nguoi dang lam viec chua checkout
        if (i === 0) {
          if (emp.id === 2) {
            checkOutTime = null;
            status = 'on_time';
            workingHours = 0;
          } else if (emp.id === 3) {
            // chua diem danh hom nay
            continue;
          }
        }

        await pool.query(`
          INSERT IGNORE INTO attendance (employee_id, shift_id, work_date, check_in, check_out, status, working_hours, note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [emp.id, shiftId, dateStr, checkInTime, checkOutTime, status, workingHours, 'Bản ghi mẫu khởi tạo tự động']);
      }
    }
    console.log('[Database] Da tao du lieu diem danh mau thanh cong!');
  } catch (err) {
    console.error('[Database] Loi tao du lieu cham cong mau:', err.message);
  }
}

// Wrapper thuc thi cau lenh SQL voi prepared statements
async function query(sql, params = []) {
  const p = await getPool();
  return p.query(sql, params);
}

module.exports = {
  getPool,
  initDatabase,
  query
};
