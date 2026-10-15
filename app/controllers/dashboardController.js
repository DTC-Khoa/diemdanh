const { query } = require('../database/db');

// Du lieu Dashboard cho Admin
async function getAdminDashboardData(req, res) {
  try {
    const today = new Date().toISOString().split('T')[0];

    // 1. Tong so nhan vien dang hoat dong
    const [empTotal] = await query(`
      SELECT COUNT(*) as totalEmployees 
      FROM employees e
      JOIN users u ON e.user_id = u.id
      WHERE u.status = 'active'
    `);
    const totalEmployees = empTotal[0].totalEmployees || 0;

    // 2. Thong ke diem danh hom nay
    const [todayStats] = await query(`
      SELECT 
        COUNT(DISTINCT employee_id) as presentToday,
        SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) as lateToday,
        SUM(CASE WHEN status = 'early_leave' THEN 1 ELSE 0 END) as earlyLeaveToday,
        SUM(CASE WHEN status = 'completed' OR status = 'on_time' THEN 1 ELSE 0 END) as onTimeToday
      FROM attendance
      WHERE work_date = CURDATE() AND check_in IS NOT NULL
    `);

    const presentToday = todayStats[0].presentToday || 0;
    const lateToday = Number(todayStats[0].lateToday || 0);
    const earlyLeaveToday = Number(todayStats[0].earlyLeaveToday || 0);
    const notCheckedIn = Math.max(0, totalEmployees - presentToday);
    const attendanceRate = totalEmployees > 0 ? Math.round((presentToday / totalEmployees) * 100) : 0;

    // 3. Danh sach diem danh moi nhat (10 ban ghi gan nhat)
    const [recentAttendance] = await query(`
      SELECT a.id, a.work_date, a.check_in, a.check_out, a.status, a.working_hours, a.note,
             e.employee_code, e.full_name, e.department,
             s.name as shift_name
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      JOIN shifts s ON a.shift_id = s.id
      ORDER BY a.work_date DESC, a.check_in DESC, a.id DESC
      LIMIT 10
    `);

    // 4. Du lieu bieu do thong ke 7 ngay gan nhat
    const [chartDataRows] = await query(`
      SELECT 
        DATE_FORMAT(work_date, '%d/%m') as date_label,
        work_date,
        COUNT(DISTINCT employee_id) as total_present,
        SUM(CASE WHEN status = 'on_time' OR status = 'completed' THEN 1 ELSE 0 END) as count_on_time,
        SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) as count_late,
        SUM(CASE WHEN status = 'early_leave' THEN 1 ELSE 0 END) as count_early_leave
      FROM attendance
      WHERE work_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY work_date
      ORDER BY work_date ASC
    `);

    // 5. Thong ke theo ca lam viec
    const [shiftStats] = await query(`
      SELECT s.name as shift_name, COUNT(a.id) as attendance_count
      FROM shifts s
      LEFT JOIN attendance a ON s.id = a.shift_id AND a.work_date = CURDATE()
      GROUP BY s.id, s.name
    `);

    res.json({
      success: true,
      data: {
        summary: {
          totalEmployees,
          presentToday,
          notCheckedIn,
          lateToday,
          earlyLeaveToday,
          attendanceRate
        },
        recentAttendance,
        chartData: chartDataRows,
        shiftStats,
        serverTime: new Date()
      }
    });

  } catch (err) {
    console.error('getAdminDashboardData error:', err);
    res.status(500).json({ success: false, message: 'Lỗi khi tải dữ liệu Admin Dashboard' });
  }
}

// Du lieu Dashboard cho Nhan vien
async function getEmployeeDashboardData(req, res) {
  try {
    const userId = req.session.user.id;

    // Lay thong tin employee
    const [emps] = await query(`
      SELECT e.id, e.employee_code, e.full_name, e.department, e.position, e.shift_id,
             s.name as shift_name, s.start_time, s.end_time, s.late_grace_minutes, s.early_grace_minutes, s.is_overnight
      FROM employees e
      LEFT JOIN shifts s ON e.shift_id = s.id
      WHERE e.user_id = ?
    `, [userId]);

    if (emps.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ nhân viên' });
    }

    const employee = emps[0];

    // Ban ghi diem danh hom nay
    const [todayRecords] = await query(`
      SELECT a.id, a.work_date, a.check_in, a.check_out, a.status, a.working_hours, a.note,
             s.name as shift_name, s.start_time, s.end_time
      FROM attendance a
      JOIN shifts s ON a.shift_id = s.id
      WHERE a.employee_id = ? AND a.work_date = CURDATE()
      ORDER BY a.id DESC
      LIMIT 1
    `, [employee.id]);

    const todayAttendance = todayRecords.length > 0 ? todayRecords[0] : null;

    // Thong ke trong thang hien tai
    const [monthlyStats] = await query(`
      SELECT 
        COUNT(*) as totalWorkDays,
        SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) as lateCount,
        SUM(CASE WHEN status = 'early_leave' THEN 1 ELSE 0 END) as earlyLeaveCount,
        IFNULL(SUM(working_hours), 0) as totalHours
      FROM attendance
      WHERE employee_id = ? 
        AND MONTH(work_date) = MONTH(CURDATE()) 
        AND YEAR(work_date) = YEAR(CURDATE())
    `, [employee.id]);

    // Lich su 7 ngay gan nhat cua nhan vien
    const [recentHistory] = await query(`
      SELECT a.id, a.work_date, a.check_in, a.check_out, a.status, a.working_hours,
             s.name as shift_name
      FROM attendance a
      JOIN shifts s ON a.shift_id = s.id
      WHERE a.employee_id = ?
      ORDER BY a.work_date DESC, a.id DESC
      LIMIT 7
    `, [employee.id]);

    res.json({
      success: true,
      data: {
        employee,
        todayAttendance,
        monthlyStats: {
          totalWorkDays: monthlyStats[0].totalWorkDays || 0,
          lateCount: Number(monthlyStats[0].lateCount || 0),
          earlyLeaveCount: Number(monthlyStats[0].earlyLeaveCount || 0),
          totalHours: parseFloat(monthlyStats[0].totalHours || 0).toFixed(2)
        },
        recentHistory,
        serverTime: new Date()
      }
    });

  } catch (err) {
    console.error('getEmployeeDashboardData error:', err);
    res.status(500).json({ success: false, message: 'Lỗi khi tải dữ liệu Employee Dashboard' });
  }
}

module.exports = {
  getAdminDashboardData,
  getEmployeeDashboardData
};
