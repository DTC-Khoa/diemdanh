require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const { initDatabase, getPool } = require('./database/db');
const { metricsMiddleware, getMetricsEndpoint } = require('./middleware/metrics');
const { requireAuth, requireAdmin, requireEmployee, preventAuthenticated } = require('./middleware/auth');

// Controllers
const authController = require('./controllers/authController');
const dashboardController = require('./controllers/dashboardController');
const employeeController = require('./controllers/employeeController');
const shiftController = require('./controllers/shiftController');
const attendanceController = require('./controllers/attendanceController');
const reportController = require('./controllers/reportController');
const auditController = require('./controllers/auditController');

const app = express();
const port = process.env.PORT || 3000;

const fs = require('fs');

// Cau hinh ghi log file song song voi stdout cho Promtail & Loki
const logDir = process.env.LOG_DIR || '/var/log/app';
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const logFile = path.join(logDir, 'app.log');
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  const originalLog = console.log;
  const originalError = console.error;

  console.log = function(...args) {
    const msg = `[${new Date().toISOString()}] [INFO] ${args.join(' ')}\n`;
    try { logStream.write(msg); } catch(e){}
    originalLog.apply(console, args);
  };

  console.error = function(...args) {
    const msg = `[${new Date().toISOString()}] [ERROR] ${args.join(' ')}\n`;
    try { logStream.write(msg); } catch(e){}
    originalError.apply(console, args);
  };
} catch (e) {
  // Neu khong co quyen ghi thu muc ngoai thi van log ra console binh thuong
}

// Middleware co ban
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Request logging middleware cho Loki
app.use((req, res, next) => {
  if (!req.path.startsWith('/public') && !req.path.startsWith('/css') && !req.path.startsWith('/js') && req.path !== '/metrics') {
    console.log(`${req.method} ${req.originalUrl} - IP: ${req.ip}`);
  }
  next();
});

// Session Middleware voi cau hinh bao mat
app.use(session({
  name: 'attendance_sid',
  secret: process.env.SESSION_SECRET || 'attendance-secret-key-dtc-khoa-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false, // Dat true neu co HTTPS thuc te
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 gio
  }
}));

// Prometheus metrics middleware
app.use(metricsMiddleware);

// Phuc vu file tinh (CSS, JS, Hinh anh)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/views', express.static(path.join(__dirname, 'views')));

// ==============================================================
// 1. MONITORING & HEALTHCHECK
// ==============================================================
app.get('/metrics', getMetricsEndpoint);

app.get('/health', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.query('SELECT 1');
    res.json({
      status: 'UP',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (err) {
    res.status(503).json({
      status: 'DOWN',
      error: err.message
    });
  }
});

// ==============================================================
// 2. VIEW ROUTES (TRANG GIAO DIEN)
// ==============================================================
app.get('/', (req, res) => {
  if (req.session && req.session.user) {
    if (req.session.user.role === 'admin') {
      return res.redirect('/admin/dashboard');
    }
    return res.redirect('/employee/dashboard');
  }
  res.redirect('/login');
});

// Trang dang nhap
app.get('/login', preventAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

// Trang Admin
app.get('/admin/dashboard', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin-dashboard.html'));
});

app.get('/admin/employees', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'employees.html'));
});

app.get('/admin/shifts', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'shifts.html'));
});

app.get('/admin/attendance', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'attendance-admin.html'));
});

app.get('/admin/reports', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'reports.html'));
});

app.get('/admin/audit-logs', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'audit-logs.html'));
});

app.get('/admin/profile', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'profile.html'));
});

// Trang Nhan Vien
app.get('/employee/dashboard', requireEmployee, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'employee-dashboard.html'));
});

app.get('/employee/attendance', requireEmployee, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'attendance-employee.html'));
});

app.get('/employee/history', requireEmployee, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'reports.html'));
});

app.get('/employee/profile', requireEmployee, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'profile.html'));
});

// ==============================================================
// 3. API ROUTES (BACKEND ENDPOINTS)
// ==============================================================

// Auth
app.post('/api/login', authController.login);
app.post('/api/logout', authController.logout);
app.get('/logout', authController.logout);
app.get('/api/me', requireAuth, authController.getProfile);
app.put('/api/profile', requireAuth, authController.updateProfile);
app.put('/api/change-password', requireAuth, authController.changePassword);

// Dashboard
app.get('/api/dashboard/admin', requireAdmin, dashboardController.getAdminDashboardData);
app.get('/api/dashboard/employee', requireEmployee, dashboardController.getEmployeeDashboardData);

// Nhan vien (Admin only)
app.get('/api/employees', requireAdmin, employeeController.listEmployees);
app.get('/api/employees/:id', requireAdmin, employeeController.getEmployeeById);
app.post('/api/employees', requireAdmin, employeeController.createEmployee);
app.put('/api/employees/:id', requireAdmin, employeeController.updateEmployee);
app.patch('/api/employees/:id/toggle-status', requireAdmin, employeeController.toggleStatus);

// Ca lam viec
app.get('/api/shifts', requireAuth, shiftController.listShifts);
app.get('/api/shifts/:id', requireAdmin, shiftController.getShiftById);
app.post('/api/shifts', requireAdmin, shiftController.createShift);
app.put('/api/shifts/:id', requireAdmin, shiftController.updateShift);
app.delete('/api/shifts/:id', requireAdmin, shiftController.deleteShift);

// Diem danh
app.post('/api/attendance/check-in', requireEmployee, attendanceController.checkIn);
app.post('/api/attendance/check-out', requireEmployee, attendanceController.checkOut);
app.get('/api/attendance/admin', requireAdmin, attendanceController.listAttendanceAdmin);
app.put('/api/attendance/:id/adjust', requireAdmin, attendanceController.adjustAttendance);

// Bao cao & Lich su
app.get('/api/reports/employee-history', requireEmployee, reportController.getEmployeeHistory);
app.get('/api/reports/admin', requireAdmin, reportController.getAdminReport);
app.get('/api/reports/export-csv', requireAuth, reportController.exportCsv);

// Nhat ky kiem toan (Audit Logs)
app.get('/api/audit-logs', requireAdmin, auditController.listAuditLogs);

// 404 Handler
app.use((req, res) => {
  if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
    return res.status(404).json({ success: false, message: 'Đường dẫn API không tồn tại' });
  }
  res.status(404).send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head><meta charset="UTF-8"><title>404 - Không tìm thấy trang</title><link rel="stylesheet" href="/css/style.css"></head>
    <body style="display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f4f6f9;">
      <div style="background: white; padding: 40px; border-radius: 12px; text-align: center; box-shadow: 0 4px 15px rgba(0,0,0,0.05); max-width: 450px;">
        <h1 style="color: #2563eb; font-size: 60px; margin-bottom: 10px;">404</h1>
        <h2>Trang Không Tồn Tại</h2>
        <p style="color: #64748b; margin: 15px 0 25px;">Đường dẫn bạn yêu cầu không tồn tại hoặc đã được chuyển hướng.</p>
        <a href="/" class="btn-primary" style="text-decoration: none; display: inline-block; padding: 10px 20px; border-radius: 6px; background: #2563eb; color: white;">Quay Lại Trang Chủ</a>
      </div>
    </body>
    </html>
  `);
});

// Khoi dong may chu sau khi ket noi Database thanh cong
async function startServer() {
  try {
    console.log('[Server] Dang khoi tao he thong va ket noi toi co so du lieu...');
    await initDatabase();
    app.listen(port, () => {
      console.log(`[Server] He thong diem danh DTC-Khoa dang chay tai cong ${port}`);
      console.log(`[Server] Metrics endpoint: http://localhost:${port}/metrics`);
      console.log(`[Server] Health endpoint:  http://localhost:${port}/health`);
    });
  } catch (err) {
    console.error('[Server] Khong the khoi dong ung dung do loi database:', err.message);
    process.exit(1);
  }
}

startServer();
