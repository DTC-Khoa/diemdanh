// ==============================================================
// HE THONG DIEM DANH DTC-KHOA - MAIN.JS
// Client-side UI helpers, Live Clock, Modals, Toasts
// ==============================================================

// Toast Notification
function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  toast.innerHTML = `
    <span style="font-weight: 700; font-size: 16px;">${icon}</span>
    <span style="flex: 1;">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Live Digital Clock
function initLiveClock(timeElementId = 'live-clock-time', dateElementId = 'live-clock-date') {
  function update() {
    const now = new Date();
    const timeEl = document.getElementById(timeElementId);
    const dateEl = document.getElementById(dateElementId);

    if (timeEl) {
      const pad = (n) => (n < 10 ? '0' + n : n);
      timeEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    }

    if (dateEl) {
      const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      dateEl.textContent = now.toLocaleDateString('vi-VN', options);
    }
  }

  update();
  setInterval(update, 1000);
}

// Dinh dang ngay gio
function formatDateVN(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const pad = (n) => (n < 10 ? '0' + n : n);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatTimeVN(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const pad = (n) => (n < 10 ? '0' + n : n);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDateTimeVN(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const pad = (n) => (n < 10 ? '0' + n : n);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Status badge renderer
function getStatusBadge(status) {
  const map = {
    'on_time': { text: 'Đúng giờ', class: 'badge-on_time' },
    'late': { text: 'Đi muộn', class: 'badge-late' },
    'early_leave': { text: 'Về sớm', class: 'badge-early_leave' },
    'completed': { text: 'Hoàn thành ca', class: 'badge-completed' },
    'incomplete': { text: 'Chưa hoàn thành', class: 'badge-incomplete' },
    'active': { text: 'Đang hoạt động', class: 'badge-active' },
    'inactive': { text: 'Đã khóa', class: 'badge-inactive' },
    'admin': { text: 'Admin', class: 'badge-admin' },
    'employee': { text: 'Nhân viên', class: 'badge-employee' }
  };
  const item = map[status] || { text: status, class: 'badge-info' };
  return `<span class="badge ${item.class}">${item.text}</span>`;
}

// API Fetch Helper
async function apiCall(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      ...options
    });

    if (res.status === 401) {
      window.location.href = '/login?error=' + encodeURIComponent('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return null;
    }

    const data = await res.json();
    return data;
  } catch (err) {
    console.error('API Call Error:', err);
    showToast('Lỗi kết nối máy chủ', 'error');
    return null;
  }
}

// Modal Helpers
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
  }
}

// Auto bind modal close
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay') || e.target.classList.contains('modal-close')) {
    const modal = e.target.closest('.modal-overlay');
    if (modal) modal.classList.remove('active');
  }
});
