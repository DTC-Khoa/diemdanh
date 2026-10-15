// Middleware kiem tra xac thuc va phan quyen (RBAC)

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    if (req.xhr || req.headers.accept?.indexOf('json') > -1 || req.path.startsWith('/api/')) {
      return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập để tiếp tục' });
    }
    return res.redirect('/login?error=' + encodeURIComponent('Vui lòng đăng nhập để truy cập trang này'));
  }

  // Kiem tra trang thai tai khoan co bi khoa khong
  if (req.session.user.status === 'inactive') {
    req.session.destroy();
    if (req.xhr || req.headers.accept?.indexOf('json') > -1 || req.path.startsWith('/api/')) {
      return res.status(403).json({ success: false, message: 'Tài khoản của bạn đã bị khóa' });
    }
    return res.redirect('/login?error=' + encodeURIComponent('Tài khoản của bạn đã bị vô hiệu hóa bởi Quản trị viên'));
  }

  res.locals.currentUser = req.session.user;
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.session.user.role !== 'admin') {
      if (req.xhr || req.headers.accept?.indexOf('json') > -1 || req.path.startsWith('/api/')) {
        return res.status(403).json({ success: false, message: 'Từ chối truy cập: Bạn không có quyền Quản trị viên' });
      }
      return res.status(403).send(`
        <!DOCTYPE html>
        <html>
        <head><title>403 Forbidden</title><meta charset="utf-8"></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1 style="color: #dc2626;">403 - Không Có Quyền Truy Cập</h1>
          <p>Chức năng này chỉ dành cho Quản trị viên (Admin).</p>
          <p><a href="/employee/dashboard" style="color: #2563eb;">Quay lại Dashboard của bạn</a></p>
        </body>
        </html>
      `);
    }
    next();
  });
}

function requireEmployee(req, res, next) {
  requireAuth(req, res, () => {
    // Admin hoac Employee deu co the vao giao dien employee neu can xem thong tin ca nhan
    next();
  });
}

function preventAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    if (req.session.user.role === 'admin') {
      return res.redirect('/admin/dashboard');
    }
    return res.redirect('/employee/dashboard');
  }
  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireEmployee,
  preventAuthenticated
};
