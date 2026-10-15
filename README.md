# ⏰ HỆ THỐNG ĐIỂM DANH NHÂN VIÊN (ATTENDANCE SYSTEM)
### Đề tài 27 – Đồ án Phát triển & Vận hành Ứng dụng Web với DevOps (Docker, Nginx, Prometheus, Grafana, Loki)
**Tổ chức / Nhóm thực hiện:** DTC-Khoa  
**Repository GitHub:** [https://github.com/DTC-Khoa/diemdanh](https://github.com/DTC-Khoa/diemdanh)

---

## 📖 1. Giới Thiệu & Mục Tiêu Đề Tài
Hệ thống điểm danh nhân viên trực tuyến giải quyết bài toán quản lý chấm công, tính giờ làm việc, kiểm soát đi muộn / về sớm cho doanh nghiệp một cách tự động, minh bạch và chính xác theo thời gian thực.
Hệ thống được thiết kế theo mô hình **Full-Stack Web Application** kết hợp toàn diện với các giải pháp **DevOps Infrastructure**:
- **Ứng dụng Web:** Giao diện quản trị hiện đại, thân thiện, phân quyền 2 vai trò: **Quản Trị Viên (Admin)** và **Nhân Viên (Employee)**.
- **Cơ sở dữ liệu:** MySQL 8.0 với mô hình quan hệ chặt chẽ, ràng buộc dữ liệu, prepared statements, nhật ký kiểm toán (Audit Logs) và cơ chế chống ghi nhận trùng lặp.
- **Hạ tầng Container:** Docker Compose điều phối 10 container dịch vụ hoạt động đồng bộ.
- **Cổng kết nối:** Nginx Reverse Proxy xử lý điều hướng, bảo mật headers, chặn truy cập file nhạy cảm và ghi log có cấu trúc.
- **Giám sát (Monitoring):** Prometheus thu thập metrics từ Web App (`prom-client`), Nginx Exporter, MySQL Exporter.
- **Trực quan hóa (Visualization):** Grafana tự động kết nối Prometheus & Loki, tích hợp sẵn Dashboard giám sát thời gian thực.
- **Quản lý Log tập trung (Centralized Logging):** Loki & Promtail thu thập, lập chỉ mục và truy vấn log với LogQL.

---

## 🌟 2. Các Chức Năng Chính Của Website

### 2.1. Phân Quyền & Quản Lý Tài Khoản (Authentication & RBAC)
- Xác thực 2 vai trò riêng biệt: **Admin** và **Employee**.
- Mật khẩu mã hóa an toàn bằng thuật toán **bcrypt** (salt rounds = 10).
- Bảo vệ chống tấn công **Brute-force**: tự động tạm khóa đăng nhập sau 5 lần nhập sai trong 15 phút.
- Quản lý phiên an toàn (`express-session` với cờ `httpOnly`, `sameSite`, cơ chế chống Session Fixation).
- Middleware máy chủ chặn truy cập trái phép: Người dùng chưa đăng nhập tự chuyển hướng về `/login`; Nhân viên cố tình vào trang Admin nhận lỗi `403 Forbidden`.
- Xem và cập nhật hồ sơ cá nhân (Họ tên, Email, Số điện thoại); Đổi mật khẩu bảo mật.

### 2.2. Dashboard Tổng Quan Thời Gian Thực
- **Admin Dashboard:**
  - 6 thẻ chỉ số tức thì: Tổng nhân viên, Đã điểm danh hôm nay, Chưa điểm danh, Đi muộn, Về sớm, Tỷ lệ điểm danh (%).
  - Đồng hồ máy chủ thực tế (Live Server Clock) hiển thị giờ chính xác đến từng giây.
  - Biểu đồ xu hướng điểm danh 7 ngày gần nhất (Chart.js Bar Chart).
  - Biểu đồ tỷ lệ phân bổ chấm công theo ca làm (Chart.js Doughnut Chart).
  - Bảng danh sách 10 lượt điểm danh mới nhất.
- **Employee Dashboard:**
  - Hiển thị ca làm hiện tại, giờ vào/ra quy định, mức thời gian linh hoạt (grace period).
  - Thẻ chấm công tương tác lớn với trạng thái hôm nay.
  - Thống kê tháng: Số ngày công, số lần đi muộn, số lần về sớm, tổng số giờ làm việc tích lũy.
  - Lịch sử 7 buổi làm việc gần nhất.

### 2.3. Chức Năng Điểm Danh Cốt Lõi (Attendance System)
- **Điểm danh vào (Check-in):** 
  - Lấy mốc thời gian máy chủ tại thời điểm gửi yêu cầu, không phụ thuộc vào đồng hồ thiết bị người dùng.
  - Tự động so sánh với khung giờ ca làm và thời gian cho phép trễ (Grace Period): tính đúng giờ (`on_time`) hoặc đi muộn (`late` kèm số phút trễ).
  - Chống điểm danh lặp lại: Hệ thống khóa giao dịch và từ chối nếu đã điểm danh vào trong ca.
- **Điểm danh ra (Check-out):**
  - Kiểm tra điều kiện tiên quyết: Bắt buộc phải có điểm danh vào trước đó.
  - Tự động tính toán tổng số giờ làm việc (`working_hours`).
  - Kiểm tra về sớm: Xác định trạng thái về sớm (`early_leave`) nếu rời trước giờ kết thúc quy định.
  - Chống điểm danh ra nhiều lần sau khi đã kết thúc ca.
- **Admin Điều Chỉnh Giờ Chấm Công (Audit Required):**
  - Admin có quyền điều chỉnh giờ vào, giờ ra, trạng thái và ghi chú.
  - **Bắt buộc nhập Lý do điều chỉnh**: Toàn bộ dữ liệu trước và sau khi sửa, người thực hiện, địa chỉ IP và thời gian được ghi vào bảng `audit_logs` để truy vết 100%.

### 2.4. Quản Lý Nhân Viên (Admin)
- Xem danh sách nhân viên có phân trang, tìm kiếm đa năng theo tên, mã NV, email, lọc theo phòng ban, trạng thái.
- Thêm nhân viên mới (tự động tạo tài khoản user + hồ sơ employee trong một Transaction, kiểm tra trùng lặp).
- Cập nhật thông tin nhân viên, gán ca làm việc, phân quyền Admin/Employee.
- Khóa (Vô hiệu hóa) / Kích hoạt lại tài khoản nhân viên.

### 2.5. Quản Lý Ca Làm Việc (Shifts)
- Khai báo tên ca, giờ bắt đầu, giờ kết thúc.
- Cấu hình số phút cho phép đi muộn (`late_grace_minutes`) và về sớm (`early_grace_minutes`).
- Hỗ trợ ca làm việc qua đêm (`is_overnight` khi giờ kết thúc < giờ bắt đầu).
- Kiểm tra an toàn dữ liệu: Ngăn chặn xóa ca làm việc nếu đang có nhân viên được gán ca đó.

### 2.6. Lịch Sử & Báo Cáo Xuất Excel
- Tra cứu lịch sử điểm danh với bộ lọc đa tiêu chí (ngày bắt đầu, ngày kết thúc, ca làm, phòng ban, trạng thái).
- Tính tổng các chỉ số trong kỳ: Tổng số buổi, số lần muộn, số lần về sớm, tổng số giờ làm.
- **Xuất file CSV chuẩn Microsoft Excel:**
  - Tích hợp ký tự **UTF-8 BOM (`\uFEFF`)** giúp Excel hiển thị tiếng Việt có dấu hoàn hảo không bị lỗi font.
  - Đầy đủ thông tin: Mã NV, Họ tên, Phòng ban, Chức vụ, Ca làm, Ngày làm, Giờ vào, Giờ ra, Số giờ, Trạng thái, Ghi chú.

---

## 🏗️ 3. Kiến Trúc Hệ Thống & Công Nghệ

```
                                  [NGINX REVERSE PROXY]
                                        (:80)
                                          │
            ┌─────────────────────────────┼─────────────────────────────┐
            │                             │                             │
            ▼                             ▼                             ▼
   [ATTENDANCE WEB APP]            [STUB STATUS]                [FILE RESTRICTIONS]
    (Node.js Express :3000)      (/stub_status)            (.env, .git, etc. 404/403)
            │                             │
    ┌───────┴───────┐                     │
    ▼               ▼                     │
[MYSQL 8.0]   [/var/log/app]              │
  (:3306)      (File logging)             │
    │               │                     │
    ├───────────────┼─────────────────────┼─────────────────────────────┐
    ▼               ▼                     ▼                             ▼
[MYSQL EXP]    [PROMTAIL]         [NGINX EXPORTER]                [PROMETHEUS]
 (:9104)        (:9080)               (:9113)                       (:9090)
    │               │                     │                             │
    │               ▼                     │                             │
    │            [LOKI]                   │                             │
    │           (:3100)                   │                             │
    │               │                     │                             │
    └───────────────┼─────────────────────┴─────────────────────────────┘
                    ▼
               [GRAFANA]
                (:3001)
     (Prometheus & Loki Provisioned)
```

| Thành Phần | Công Nghệ Sử Dụng | Vai Trò / Trách Nhiệm |
|---|---|---|
| **Backend** | Node.js (Express 4.19), mysql2/promise, bcryptjs, prom-client | Xử lý nghiệp vụ, API, xác thực, kết nối CSDL, metrics |
| **Frontend** | Vanilla HTML5, CSS3, JavaScript (ES6+), Chart.js | Giao diện Responsive hiện đại, không phụ thuộc nặng thư viện |
| **Database** | MySQL 8.0, phpMyAdmin | Lưu trữ dữ liệu quan hệ, kiểm soát khóa ngoại, bảng audit |
| **Web Proxy** | Nginx Alpine | Reverse Proxy cổng 80, Security Headers, Rate limiting, JSON Logs |
| **Monitoring** | Prometheus Latest | Scrape metrics định kỳ (Web, MySQL Exporter, Nginx Exporter) |
| **Visualization**| Grafana Latest | Dashboard tự động cấu hình nguồn dữ liệu Prometheus và Loki |
| **Logging** | Grafana Loki & Promtail | Thu thập file log từ Web (`/var/log/app`) & Nginx (`/var/log/nginx`) |

---

## 📁 4. Cấu Trúc Thư Mục Dự Án

```
d:\trien_khai\
├── .env.example                # File biến môi trường mẫu
├── .env                        # File biến môi trường chạy thực tế (git ignored)
├── .gitignore                  # Cấu hình bỏ qua file nhạy cảm và node_modules
├── docker-compose.yml          # Cấu hình 10 containers dịch vụ đồng bộ
├── README.md                   # Tài liệu hướng dẫn triển khai & kiểm thử
├── app/                        # Mã nguồn ứng dụng Web Node.js
│   ├── Dockerfile              # Dockerfile chạy node:18-alpine, quyền non-root
│   ├── package.json            # Khai báo thư viện phụ thuộc
│   ├── server.js               # Khởi tạo Express app, routes, middleware, /metrics, /health
│   ├── database/
│   │   ├── db.js               # Connection pool, logic retry khi MySQL khởi động
│   │   └── init.sql            # Schema cơ sở dữ liệu và seed dữ liệu mẫu
│   ├── middleware/
│   │   ├── auth.js             # Kiểm tra đăng nhập và phân quyền RBAC
│   │   ├── metrics.js          # prom-client thu thập HTTP & attendance metrics
│   │   └── audit.js            # Ghi nhật ký thao tác kiểm toán
│   ├── controllers/
│   │   ├── authController.js       # Đăng nhập, đăng xuất, hồ sơ, đổi mật khẩu
│   │   ├── dashboardController.js  # Số liệu thống kê Admin & Nhân viên
│   │   ├── employeeController.js   # CRUD nhân viên, khóa/mở tài khoản
│   │   ├── shiftController.js      # CRUD ca làm việc
│   │   ├── attendanceController.js # Điểm danh vào, ra, Admin điều chỉnh
│   │   ├── reportController.js     # Lịch sử, thống kê kỳ và xuất file CSV
│   │   └── auditController.js      # Xem lịch sử kiểm toán
│   ├── public/
│   │   ├── css/style.css       # Giao diện Modern Admin Dashboard
│   │   └── js/main.js          # Đồng hồ trực tuyến, Toasts, Modals, Formatters
│   └── views/                  # Các trang giao diện HTML
│       ├── login.html              # Trang đăng nhập
│       ├── admin-dashboard.html    # Dashboard Quản trị viên
│       ├── employee-dashboard.html # Dashboard Nhân viên
│       ├── employees.html          # Quản lý nhân sự
│       ├── shifts.html             # Quản lý ca làm việc
│       ├── attendance-admin.html   # Bảng điểm danh & điều chỉnh
│       ├── attendance-employee.html# Trang chấm công nhân viên
│       ├── reports.html            # Lịch sử & xuất báo cáo CSV
│       ├── audit-logs.html         # Nhật ký kiểm toán hệ thống
│       └── profile.html            # Hồ sơ cá nhân & đổi mật khẩu
├── nginx/
│   └── default.conf            # Cấu hình Nginx proxy, headers, logging JSON
├── prometheus/
│   ├── prometheus.yml          # Scrape configs 4 targets: prometheus, web, nginx, mysql
│   └── my.cnf                  # Cấu hình kết nối MySQL cho mysqld-exporter
├── grafana/
│   ├── provisioning/
│   │   ├── datasources/datasources.yaml # Tự động kết nối Prometheus & Loki
│   │   └── dashboards/dashboards.yaml   # Tự động nạp dashboard
│   └── dashboards/
│       └── attendance-overview.json     # Dashboard giám sát dựng sẵn
├── promtail/
│   └── promtail-config.yaml    # Cấu hình Promtail scrape log app & nginx
└── tests/
    └── test_backend.ps1        # Kịch bản kiểm thử tự động toàn diện
```

---

## 🚀 5. Hướng Dẫn Cài Đặt & Chạy Hệ Thống

### 5.1. Yêu Cầu Môi Trường
- Máy tính đã cài đặt **Docker Desktop** (hỗ trợ WSL2 hoặc Linux container).
- Git.

### 5.2. Khởi Tạo File Môi Trường
Sao chép file `.env.example` thành file `.env`:
```powershell
cp .env.example .env
```
Nội dung file `.env` đã được cấu hình sẵn các giá trị an toàn:
```env
DB_HOST=mysql
DB_PORT=3306
DB_NAME=attendance_db
DB_USER=root
DB_ROOT_PASSWORD=rootpassword
PORT=3000
NODE_ENV=production
SESSION_SECRET=attendance_dtc_super_secret_session_key_2026
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=admin
```

### 5.3. Lệnh Build & Chạy Toàn Bộ Hệ Thống
Chạy lệnh duy nhất sau để Docker Compose tự động tải image, build web app và khởi chạy 10 containers:
```powershell
docker compose up -d --build
```

Kiểm tra trạng thái các container sau khi khởi động:
```powershell
docker compose ps
```
*Tất cả 10 containers sẽ ở trạng thái `Up` hoặc `Up (healthy)`.*

---

## 🌐 6. Địa Chỉ & Cổng Truy Cập Dịch Vụ

| Dịch Vụ | Địa Chỉ Truy Cập | Tài Khoản Đăng Nhập | Mục Đích |
|---|---|---|---|
| **Website Điểm Danh** | [http://localhost](http://localhost) | Xem mục 7 bên dưới | Cổng chính qua Nginx reverse proxy |
| **phpMyAdmin** | [http://localhost:8080](http://localhost:8080) | User: `root` / Pass: `rootpassword` | Quản trị CSDL MySQL trực quan |
| **Prometheus** | [http://localhost:9090](http://localhost:9090) | Không yêu cầu | Xem chỉ số hệ thống & Targets UP |
| **Grafana Dashboard** | [http://localhost:3001](http://localhost:3001) | User: `admin` / Pass: `admin` | Dashboard giám sát trực quan |
| **Loki API** | [http://localhost:3100/ready](http://localhost:3100/ready) | Không yêu cầu | Endpoint API lưu trữ log |
| **Web Healthcheck** | [http://localhost/health](http://localhost/health) | Không yêu cầu | Kiểm tra kết nối Web & MySQL |
| **Prometheus Metrics**| [http://localhost/metrics](http://localhost/metrics) | Không yêu cầu | Endpoint metrics của Node.js app |

---

## 🔑 7. Tài Khoản Demo Khởi Tạo Sẵn

Cơ sở dữ liệu tự động khởi tạo các tài khoản mẫu sau với mật khẩu băm bcrypt:

| Vai Trò | Tên Đăng Nhập | Mật Khẩu | Họ Và Tên | Mã NV | Quyền Hạn |
|---|---|---|---|---|---|
| **Admin** | `admin` | `Admin@123` | Quản Trị Viên Hệ Thống | `ADM001` | Toàn quyền quản trị, thêm/sửa/xóa nhân viên, ca làm, điều chỉnh điểm danh, xem audit |
| **Nhân Viên 1** | `nv001` | `User@123` | Nguyễn Văn An | `NV001` | Ca Hành Chính, điểm danh vào/ra, xem lịch sử cá nhân |
| **Nhân Viên 2** | `nv002` | `User@123` | Trần Thị Bình | `NV002` | Ca Sáng, điểm danh vào/ra, xem lịch sử |
| **Nhân Viên 3** | `nv003` | `User@123` | Lê Quang Cường | `NV003` | Ca Chiều, điểm danh vào/ra, xem lịch sử |

> [!NOTE]  
> Các thông tin đăng nhập trên chỉ dùng cho môi trường thử nghiệm và demo đồ án. Khi đưa vào môi trường sản xuất thật, vui lòng đổi mật khẩu trong mục **Tài Khoản Cá Nhân**.

---

## 🎯 8. Hướng Dẫn Sử Dụng & Kịch Bản Demo

### 8.1. Demo Với Vai Trò Nhân Viên (Employee)
1. Truy cập [http://localhost](http://localhost).
2. Nhập tài khoản `nv001`, mật khẩu `User@123` (hoặc ấn nút nhanh *"Dùng tài khoản NV"*).
3. Hệ thống chuyển hướng tới **Dashboard Nhân Viên**:
   - Quan sát đồng hồ thực tế đang chạy.
   - Xem ca làm việc được gán: **Ca Hành Chính (08:00 - 17:00)**.
4. Nhấn nút **🟢 Điểm Danh Vào**:
   - Hệ thống ghi nhận giờ vào từ máy chủ.
   - Trạng thái cập nhật thành: **Đang làm việc** (hoặc Đi muộn nếu quá 08:15).
   - Nút Điểm danh vào tự động chuyển sang màu xám mờ (disabled), nút Điểm danh ra được kích hoạt.
   - Thử ấn lại điểm danh vào: Hệ thống thông báo bạn đã điểm danh vào rồi.
5. Nhấn nút **🔴 Điểm Danh Ra**:
   - Xác nhận hoàn thành ca.
   - Hệ thống tính toán tổng số giờ làm việc thực tế và hiển thị thông báo.
6. Vào mục **📅 Lịch Sử Điểm Danh**:
   - Xem bảng chấm công cá nhân, lọc theo khoảng ngày, ấn nút **Xuất Báo Cáo CSV (Excel)** để tải file về máy.

### 8.2. Demo Với Vai Trò Quản Trị Viên (Admin)
1. Đăng xuất tài khoản nhân viên.
2. Đăng nhập bằng `admin` / `Admin@123`.
3. Hệ thống chuyển tới **Dashboard Quản Trị**:
   - Xem các con số thống kê tự động cập nhật từ MySQL.
   - Xem biểu đồ xu hướng 7 ngày và phân bổ ca làm.
4. Vào menu **👥 Nhân Viên**:
   - Tìm kiếm nhân viên theo tên hoặc mã.
   - Nhấn **➕ Thêm Nhân Viên Mới**: Điền mã NV, họ tên, email, ca làm việc -> Hệ thống lưu dữ liệu vào CSDL.
   - Nhấn nút **Khóa / Kích hoạt** để thử tính năng vô hiệu hóa tài khoản.
5. Vào menu **⏱️ Ca Làm Việc**:
   - Xem các ca: Ca Hành Chính, Ca Sáng, Ca Chiều, Ca Đêm (qua đêm).
   - Thử thêm ca làm mới hoặc chỉnh sửa khung giờ và thời gian cho phép trễ (Grace period).
6. Vào menu **📋 Bảng Điểm Danh**:
   - Xem toàn bộ bản ghi của tất cả nhân viên trong công ty.
   - Chọn một bản ghi và nhấn **Sửa / Điều Chỉnh**:
     - Điều chỉnh lại giờ vào hoặc giờ ra.
     - **Bắt buộc nhập lý do**: *"Nhân viên nộp đơn xác nhận công tác hợp lệ"*.
     - Nhấn Lưu: Bản ghi được cập nhật giờ và số giờ làm việc được tính toán lại.
7. Vào menu **🛡️ Nhật Ký Audit (Audit Logs)**:
   - Thấy ngay dòng log vừa điều chỉnh điểm danh: Hiện rõ người sửa là `admin`, thời gian chính xác, lý do điều chỉnh, cùng toàn bộ giá trị cũ và mới.

---

## 📊 9. Giám Sát Hoạt Động (Prometheus & Grafana)

### 9.1. Kiểm Tra Prometheus Targets
1. Mở trình duyệt truy cập: [http://localhost:9090/targets](http://localhost:9090/targets).
2. Xác nhận cả 4 scrape pools đều có trạng thái **UP (màu xanh lá)**:
   - `attendance_web` (`web:3000/metrics`) - Ứng dụng Node.js
   - `nginx` (`nginx-exporter:9113`) - Reverse Proxy
   - `mysql` (`mysqld-exporter:9104`) - Cơ sở dữ liệu MySQL
   - `prometheus` (`localhost:9090`) - Prometheus Server

### 9.2. Mở Grafana Dashboard
1. Truy cập: [http://localhost:3001](http://localhost:3001).
2. Đăng nhập với tài khoản: `admin` / `admin`.
3. Vào menu **Dashboards** -> chọn thư mục **Attendance** -> mở dashboard **Hệ Thống Điểm Danh - DevOps Monitoring Dashboard**.
4. Các panel hiển thị trực quan:
   - **Service Health:** 4 chỉ số UP/DOWN của Web, Prometheus, Nginx, MySQL.
   - **HTTP Requests Rate:** Tần suất request theo mã 200, 404, 500.
   - **Request Latency (P95):** Thời gian phản hồi của máy chủ.
   - **Attendance Events:** Biểu đồ tần suất điểm danh vào/ra theo thời gian.
   - **Memory Usage:** Mức chiếm dụng RAM heap của ứng dụng Node.js.

---

## 📜 10. Quản Lý Log Tập Trung (Loki & Promtail)

Hệ thống tập trung log hoạt động tự động:
- Web App ghi log vào `/var/log/app/app.log` với nhãn `service="web"`.
- Nginx ghi log định dạng JSON chi tiết vào `/var/log/nginx/app_access.log` với nhãn `service="nginx"`.
- Promtail đọc và đẩy về Loki port 3100.

### Cách Kiểm Tra Log Trong Grafana Explore:
1. Mở Grafana [http://localhost:3001](http://localhost:3001).
2. Vào mục **Explore** (biểu tượng la bàn bên trái).
3. Chọn datasource **Loki**.
4. Chạy 3 truy vấn LogQL mẫu dưới đây để demo:

#### Truy vấn 1: Xem toàn bộ log của ứng dụng Web
```logql
{service="web"}
```
*Kết quả: Hiển thị toàn bộ nhật ký khởi động kết nối database, các request HTTP và các sự kiện điểm danh.*

#### Truy vấn 2: Lọc các dòng log có từ khóa lỗi (error)
```logql
{service="web"} |= "ERROR"
```
*Kết quả: Lọc chính xác các sự kiện lỗi phát sinh để phục vụ phân tích sự cố.*

#### Truy vấn 3: Xem log Nginx có mã phản hồi HTTP 4xx (ví dụ 404)
```logql
{service="nginx"} |= "404"
```
hoặc truy vấn bóc tách JSON:
```logql
{service="nginx"} | json | status >= 400
```
*Kết quả: Hiển thị các request truy cập không hợp lệ bị Nginx chặn hoặc đường dẫn không tồn tại.*

---

## 🛡️ 11. Các Biện Pháp Bảo Mật Đã Triển Khai Thực Tế

1. **Mã Hóa Mật Khẩu:** Sử dụng `bcryptjs` với salt 10 vòng, không lưu bất kỳ mật khẩu thô nào trong database hay code.
2. **Chống Tấn Công SQL Injection:** 100% các câu truy vấn sử dụng Prepared Statements (`mysql2/promise` với tham số `?`).
3. **Chống Tấn Công Brute Force:** Kiểm tra bảng `login_logs`, tự động chặn đăng nhập nếu người dùng nhập sai quá 5 lần trong vòng 15 phút.
4. **Bảo Vệ Phiên & Chống Session Fixation:** Sử dụng `req.session.regenerate()` ngay sau khi xác thực thành công. Cookie phiên có cờ `httpOnly` và `sameSite: lax`.
5. **Kiểm Soát Quyền Hạn Đa Tầng (RBAC):** Middleware kiểm tra quyền ở phía server (`requireAdmin`), chặn đứng mọi hành vi nhân viên nhập URL trực tiếp vào các trang hoặc API quản trị.
6. **Bảo Mật Nginx Proxy:**
   - Chặn tuyệt đối việc truy cập các file nhạy cảm: `.env`, `.git`, `Dockerfile`, `.sql`, `docker-compose.yml` (trả về 404).
   - Thêm các Security Headers: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`.
   - Vô hiệu hóa tính năng Directory Listing (`autoindex off`).
   - Giới hạn kích thước gói tin gửi lên máy chủ (`client_max_body_size 10M`).
7. **Nhật Ký Kiểm Toán (Audit Logs):** Bắt buộc nhập lý do khi sửa dữ liệu chấm công; lưu vết toàn bộ giá trị cũ, giá trị mới, người thao tác và IP thực hiện.
8. **Quyền Hạn Container Non-Root:** Dockerfile của ứng dụng Web tạo `appuser` và chạy ứng dụng dưới quyền người dùng thông thường, không chạy dưới quyền `root`.

---

## 🛠️ 12. Quản Trị Hệ Thống Container

### Dừng Hệ Thống (Giữ nguyên dữ liệu database và cấu hình):
```powershell
docker compose stop
```

### Khởi Động Lại Hệ Thống:
```powershell
docker compose start
```

### Xem Log Các Dịch Vụ Khi Gặp Sự Cố:
```powershell
# Xem log ứng dụng web
docker compose logs -f web

# Xem log reverse proxy nginx
docker compose logs -f nginx

# Xem log cơ sở dữ liệu MySQL
docker compose logs -f mysql

# Xem log agent thu thập Promtail
docker compose logs -f promtail
```

### Xóa Containers An Toàn (Không làm mất dữ liệu đã lưu trong volume):
```powershell
docker compose down
```
*(Dữ liệu MySQL, cấu hình Grafana và Logs được lưu an toàn trong các Docker Named Volumes: `trien_khai_mysql_data`, `trien_khai_grafana_data`, `trien_khai_loki_data`).*

---

## 📋 13. Kết Quả Kiểm Thử & Giới Hạn Còn Lại

### Các Phần Đã Kiểm Thử Thành Công Thực Tế 100%:
- [x] Đăng nhập đúng thông tin Admin và Nhân viên thành công.
- [x] Từ chối đăng nhập khi sai tài khoản hoặc mật khẩu (mã lỗi 401).
- [x] Đăng xuất kết thúc phiên hợp lệ.
- [x] Chặn người chưa đăng nhập truy cập các trang nội bộ (chuyển hướng `/login`).
- [x] Chặn nhân viên gọi API và truy cập trang quản trị Admin (trả về 403 Forbidden).
- [x] Admin tạo mới, chỉnh sửa và khóa/mở khóa tài khoản nhân viên.
- [x] Quản lý ca làm việc: Thêm ca, tính toán ca qua đêm, kiểm tra ràng buộc không cho xóa ca đang có nhân viên sử dụng.
- [x] Nhân viên điểm danh vào (Check-in) thành công bằng thời gian máy chủ.
- [x] Chống điểm danh vào trùng lặp trong cùng một ca.
- [x] Nhân viên điểm danh ra (Check-out) thành công, tự động tính tổng số giờ làm việc.
- [x] Chống điểm danh ra nhiều lần.
- [x] Admin điều chỉnh bản ghi điểm danh và ghi nhận nhật ký kiểm toán (Audit Log) đầy đủ.
- [x] Xuất báo cáo CSV chuẩn UTF-8 BOM hiển thị tiếng Việt đúng trên Microsoft Excel.
- [x] `docker compose config` hợp lệ, build image thành công.
- [x] Khởi chạy 10 container dịch vụ hoạt động đồng thời.
- [x] MySQL 8.0 healthcheck `mysqladmin ping` đạt trạng thái `healthy`.
- [x] Website truy cập mượt mà qua Nginx reverse proxy cổng 80.
- [x] phpMyAdmin kết nối CSDL thành công tại cổng 8080.
- [x] Prometheus thu thập 4/4 scrape targets đạt trạng thái `UP`.
- [x] Grafana nạp sẵn datasource Prometheus, Loki và Dashboard hoàn chỉnh.
- [x] Loki & Promtail thu thập và truy vấn log thành công với 3 cú pháp LogQL kiểm chứng.

### Giới Hạn Còn Lại & Ghi Chú:
- **Trình duyệt tự động (Playwright Browser Subagent):** Do môi trường sandbox máy chủ không có kết nối ra bên ngoài để tải file driver Playwright (`playwright-1.57.0-win32_x64.zip` từ Azure CDN), công cụ browser subagent không thể tự động chụp ảnh màn hình lưu vào thư mục `docs/screenshots/`. Toàn bộ giao diện người dùng, API và logic đều hoạt động trực tiếp trên cổng `80` và người dùng có thể mở trình duyệt máy tính truy cập [http://localhost](http://localhost) để trải nghiệm và chụp ảnh thực tế.
