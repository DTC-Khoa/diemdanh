const { query } = require('../database/db');

// Helper format date dd/mm/yyyy
function formatDateVN(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const pad = (n) => (n < 10 ? '0' + n : n);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Helper format datetime dd/mm/yyyy HH:mm:ss
function formatDateTimeVN(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const pad = (n) => (n < 10 ? '0' + n : n);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Helper format status sang tieng Viet
function getStatusVN(status) {
  const map = {
    'on_time': 'Đúng giờ',
    'late': 'Đi muộn',
    'early_leave': 'Về sớm',
    'completed': 'Hoàn thành ca',
    'incomplete': 'Chưa hoàn thành'
  };
  return map[status] || status;
}

// 1. Lich su diem danh cua nhan vien hien tai
async function getEmployeeHistory(req, res) {
  try {
    const userId = req.session.user.id;
    const { from_date = '', to_date = '', status = '', page = 1, limit = 15 } = req.query;

    const [empRows] = await query('SELECT id FROM employees WHERE user_id = ?', [userId]);
    if (empRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin nhân viên' });
    }
    const empId = empRows[0].id;

    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const limitNum = parseInt(limit, 10);

    let whereClause = 'WHERE a.employee_id = ?';
    const params = [empId];

    if (from_date.trim()) {
      whereClause += ' AND a.work_date >= ?';
      params.push(from_date.trim());
    }

    if (to_date.trim()) {
      whereClause += ' AND a.work_date <= ?';
      params.push(to_date.trim());
    }

    if (status.trim()) {
      whereClause += ' AND a.status = ?';
      params.push(status.trim());
    }

    // Dem tong ban ghi va tinh tong gio, tong so lan muon/ve som
    const [summaryRows] = await query(`
      SELECT 
        COUNT(*) as totalRecords,
        SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) as totalLate,
        SUM(CASE WHEN a.status = 'early_leave' THEN 1 ELSE 0 END) as totalEarlyLeave,
        IFNULL(SUM(a.working_hours), 0) as totalHours
      FROM attendance a
      ${whereClause}
    `, params);

    const total = summaryRows[0].totalRecords || 0;

    const [rows] = await query(`
      SELECT a.*, s.name as shift_name, s.start_time, s.end_time
      FROM attendance a
      JOIN shifts s ON a.shift_id = s.id
      ${whereClause}
      ORDER BY a.work_date DESC, a.check_in DESC
      LIMIT ? OFFSET ?
    `, [...params, limitNum, offset]);

    res.json({
      success: true,
      data: rows,
      summary: {
        totalRecords: total,
        totalLate: Number(summaryRows[0].totalLate || 0),
        totalEarlyLeave: Number(summaryRows[0].totalEarlyLeave || 0),
        totalHours: parseFloat(summaryRows[0].totalHours || 0).toFixed(2)
      },
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });

  } catch (err) {
    console.error('getEmployeeHistory error:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải lịch sử điểm danh' });
  }
}

// 2. Bao cao tong hop cho Admin (co bo loc nang cao)
async function getAdminReport(req, res) {
  try {
    const {
      search = '',
      from_date = '',
      to_date = '',
      department = '',
      shift_id = '',
      status = '',
      page = 1,
      limit = 20
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

    if (from_date.trim()) {
      whereClause += ' AND a.work_date >= ?';
      params.push(from_date.trim());
    }

    if (to_date.trim()) {
      whereClause += ' AND a.work_date <= ?';
      params.push(to_date.trim());
    }

    if (department.trim()) {
      whereClause += ' AND e.department = ?';
      params.push(department.trim());
    }

    if (shift_id.trim()) {
      whereClause += ' AND a.shift_id = ?';
      params.push(shift_id.trim());
    }

    if (status.trim()) {
      whereClause += ' AND a.status = ?';
      params.push(status.trim());
    }

    // Tong quan thong ke theo dieu kien loc
    const [summaryRows] = await query(`
      SELECT 
        COUNT(*) as totalRecords,
        COUNT(DISTINCT a.employee_id) as totalEmployees,
        SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) as totalLate,
        SUM(CASE WHEN a.status = 'early_leave' THEN 1 ELSE 0 END) as totalEarlyLeave,
        SUM(CASE WHEN a.status = 'completed' OR a.status = 'on_time' THEN 1 ELSE 0 END) as totalOnTime,
        IFNULL(SUM(a.working_hours), 0) as totalHours
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      JOIN shifts s ON a.shift_id = s.id
      ${whereClause}
    `, params);

    const total = summaryRows[0].totalRecords || 0;

    // Danh sach ban ghi
    const [rows] = await query(`
      SELECT a.*, e.employee_code, e.full_name, e.department, e.position,
             s.name as shift_name, s.start_time, s.end_time
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      JOIN shifts s ON a.shift_id = s.id
      ${whereClause}
      ORDER BY a.work_date DESC, a.check_in DESC
      LIMIT ? OFFSET ?
    `, [...params, limitNum, offset]);

    res.json({
      success: true,
      data: rows,
      summary: {
        totalRecords: total,
        totalEmployees: summaryRows[0].totalEmployees || 0,
        totalLate: Number(summaryRows[0].totalLate || 0),
        totalEarlyLeave: Number(summaryRows[0].totalEarlyLeave || 0),
        totalOnTime: Number(summaryRows[0].totalOnTime || 0),
        totalHours: parseFloat(summaryRows[0].totalHours || 0).toFixed(2)
      },
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });

  } catch (err) {
    console.error('getAdminReport error:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải báo cáo điểm danh' });
  }
}

// 3. Xuat bao cao CSV ho tro Excel (UTF-8 voi BOM)
async function exportCsv(req, res) {
  try {
    const { search = '', from_date = '', to_date = '', department = '', shift_id = '', status = '' } = req.query;

    let whereClause = 'WHERE 1=1';
    const params = [];

    // Neu khong phai Admin thi chi xuat cua chinh minh
    if (req.session.user.role !== 'admin') {
      const [empRows] = await query('SELECT id FROM employees WHERE user_id = ?', [req.session.user.id]);
      if (empRows.length > 0) {
        whereClause += ' AND a.employee_id = ?';
        params.push(empRows[0].id);
      }
    }

    if (search.trim()) {
      whereClause += ' AND (e.full_name LIKE ? OR e.employee_code LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s);
    }
    if (from_date.trim()) {
      whereClause += ' AND a.work_date >= ?';
      params.push(from_date.trim());
    }
    if (to_date.trim()) {
      whereClause += ' AND a.work_date <= ?';
      params.push(to_date.trim());
    }
    if (department.trim()) {
      whereClause += ' AND e.department = ?';
      params.push(department.trim());
    }
    if (shift_id.trim()) {
      whereClause += ' AND a.shift_id = ?';
      params.push(shift_id.trim());
    }
    if (status.trim()) {
      whereClause += ' AND a.status = ?';
      params.push(status.trim());
    }

    const [rows] = await query(`
      SELECT a.*, e.employee_code, e.full_name, e.department, e.position,
             s.name as shift_name
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      JOIN shifts s ON a.shift_id = s.id
      ${whereClause}
      ORDER BY a.work_date DESC, a.check_in DESC
    `, params);

    // Xay dung CSV string
    const headers = ['STT', 'Mã Nhân Viên', 'Họ Và Tên', 'Phòng Ban', 'Chức Vụ', 'Ca Làm Việc', 'Ngày Làm', 'Giờ Vào', 'Giờ Ra', 'Số Giờ Làm', 'Trạng Thái', 'Ghi Chú'];
    
    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    let csvContent = headers.map(escapeCsv).join(',') + '\r\n';

    rows.forEach((r, idx) => {
      const row = [
        idx + 1,
        r.employee_code || '',
        r.full_name || '',
        r.department || '',
        r.position || '',
        r.shift_name || '',
        formatDateVN(r.work_date),
        formatDateTimeVN(r.check_in),
        formatDateTimeVN(r.check_out),
        r.working_hours || '0',
        getStatusVN(r.status),
        r.note || ''
      ];
      csvContent += row.map(escapeCsv).join(',') + '\r\n';
    });

    const nowStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `Bao_cao_diem_danh_${nowStr}.csv`;

    // BOM UTF-8 (\uFEFF) de Excel hien thi dung tieng Viet co dau
    const bom = '\uFEFF';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(bom + csvContent);

  } catch (err) {
    console.error('exportCsv error:', err);
    res.status(500).json({ success: false, message: 'Lỗi khi xuất file báo cáo CSV' });
  }
}

module.exports = {
  getEmployeeHistory,
  getAdminReport,
  exportCsv
};
