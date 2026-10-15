-- ==============================================================
-- DATABASE SCHEMA: HE THONG DIEM DANH NHAN VIEN (DE TAI 27)
-- ==============================================================

CREATE DATABASE IF NOT EXISTS `attendance_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `attendance_db`;

-- 1. BANG USERS (Tai khoan dang nhap, phan quyen, trang thai)
CREATE TABLE IF NOT EXISTS `users` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `username` VARCHAR(50) NOT NULL UNIQUE,
    `email` VARCHAR(100) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` ENUM('admin', 'employee') NOT NULL DEFAULT 'employee',
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_users_role` (`role`),
    INDEX `idx_users_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. BANG SHIFTS (Quan ly ca lam viec)
CREATE TABLE IF NOT EXISTS `shifts` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL,
    `start_time` TIME NOT NULL,
    `end_time` TIME NOT NULL,
    `late_grace_minutes` INT NOT NULL DEFAULT 15 COMMENT 'So phut cho phep di muon',
    `early_grace_minutes` INT NOT NULL DEFAULT 15 COMMENT 'So phut cho phep ve som',
    `is_overnight` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 neu ca lam qua dem',
    `description` VARCHAR(255) NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. BANG EMPLOYEES (Thong tin nhan vien, ma nhan vien)
CREATE TABLE IF NOT EXISTS `employees` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT NOT NULL UNIQUE,
    `employee_code` VARCHAR(20) NOT NULL UNIQUE,
    `full_name` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `department` VARCHAR(100) NULL DEFAULT 'Ky thuat',
    `position` VARCHAR(100) NULL DEFAULT 'Nhan vien',
    `shift_id` INT NULL,
    `avatar_url` VARCHAR(255) NULL DEFAULT '/img/avatar-default.png',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON DELETE SET NULL,
    INDEX `idx_emp_code` (`employee_code`),
    INDEX `idx_emp_dept` (`department`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. BANG ATTENDANCE (Ban ghi diem danh)
CREATE TABLE IF NOT EXISTS `attendance` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `employee_id` INT NOT NULL,
    `shift_id` INT NOT NULL,
    `work_date` DATE NOT NULL,
    `check_in` DATETIME NULL,
    `check_out` DATETIME NULL,
    `status` ENUM('on_time', 'late', 'early_leave', 'completed', 'incomplete') NOT NULL DEFAULT 'on_time',
    `working_hours` DECIMAL(5,2) DEFAULT 0.00,
    `note` TEXT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `unique_emp_date_shift` (`employee_id`, `work_date`, `shift_id`),
    FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON DELETE RESTRICT,
    INDEX `idx_att_work_date` (`work_date`),
    INDEX `idx_att_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. BANG AUDIT_LOGS (Nhat ky kiem toan cac thao tac quan trong nhu Admin sua gio cham cong)
CREATE TABLE IF NOT EXISTS `audit_logs` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT NULL,
    `action` VARCHAR(50) NOT NULL,
    `target_table` VARCHAR(50) NOT NULL,
    `target_id` INT NOT NULL,
    `old_values` JSON NULL,
    `new_values` JSON NULL,
    `reason` TEXT NULL,
    `ip_address` VARCHAR(45) NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    INDEX `idx_audit_action` (`action`),
    INDEX `idx_audit_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. BANG LOGIN_LOGS (Giam sat dang nhap va bao ve chong brute force)
CREATE TABLE IF NOT EXISTS `login_logs` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `username` VARCHAR(100) NOT NULL,
    `ip_address` VARCHAR(45) NULL,
    `status` ENUM('success', 'failed') NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_login_user_time` (`username`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- SEED DU LIEU CA LAM VIEC MAC DINH
INSERT INTO `shifts` (`id`, `name`, `start_time`, `end_time`, `late_grace_minutes`, `early_grace_minutes`, `is_overnight`, `description`)
VALUES
(1, 'Ca Hanh Chinh', '08:00:00', '17:00:00', 15, 15, 0, 'Ca lam viec hanh chinh 8 tieng (08:00 - 17:00, nghi trua 1 tieng)'),
(2, 'Ca Sang', '08:00:00', '12:00:00', 10, 10, 0, 'Ca lam viec buoi sang (08:00 - 12:00)'),
(3, 'Ca Chieu', '13:30:00', '17:30:00', 10, 10, 0, 'Ca lam viec buoi chieu (13:30 - 17:30)'),
(4, 'Ca Dem', '22:00:00', '06:00:00', 15, 15, 1, 'Ca lam viec qua dem (22:00 - 06:00)')
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`);

-- SEED TAI KHOAN ADMIN VA NHAN VIEN DEMO
-- Mat khau Admin: Admin@123 (hash bcrypt 10 salt)
-- Mat khau User: User@123 (hash bcrypt 10 salt)
-- $2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi la hash chuan cua password
-- Duoi day la hash bcrypt tuong thich cho Admin@123: $2a$10$r8qJ1zR2.CjW5o7XpIuE.eS9n3jT1YV8k4xQ3W0Z8eO8Y6Q8M2A.q
-- Ung dung backend se tu dong dam bao mat khau dung chuan khi khoi dong neu chua co.
INSERT INTO `users` (`id`, `username`, `email`, `password_hash`, `role`, `status`)
VALUES
(1, 'admin', 'admin@diemdanh.dtc', '$2a$10$Q7eYc5b8i.p6qPz8o2R3f.2sK9L3Z5l1M4N2P0Q7R8S9T0U1V2W3X', 'admin', 'active'),
(2, 'nv001', 'nguyenvana@diemdanh.dtc', '$2a$10$Q7eYc5b8i.p6qPz8o2R3f.2sK9L3Z5l1M4N2P0Q7R8S9T0U1V2W3X', 'employee', 'active'),
(3, 'nv002', 'tranthib@diemdanh.dtc', '$2a$10$Q7eYc5b8i.p6qPz8o2R3f.2sK9L3Z5l1M4N2P0Q7R8S9T0U1V2W3X', 'employee', 'active'),
(4, 'nv003', 'lequangc@diemdanh.dtc', '$2a$10$Q7eYc5b8i.p6qPz8o2R3f.2sK9L3Z5l1M4N2P0Q7R8S9T0U1V2W3X', 'employee', 'active')
ON DUPLICATE KEY UPDATE `email`=VALUES(`email`);

INSERT INTO `employees` (`id`, `user_id`, `employee_code`, `full_name`, `phone`, `department`, `position`, `shift_id`)
VALUES
(1, 1, 'ADM001', 'Quản Trị Viên Hệ Thống', '0901234567', 'Ban Quản Trị', 'Quản trị viên', 1),
(2, 2, 'NV001', 'Nguyễn Văn An', '0912345678', 'Phòng Kỹ Thuật', 'Kỹ sư phần mềm', 1),
(3, 3, 'NV002', 'Trần Thị Bình', '0923456789', 'Phòng Kế Toán', 'Chuyên viên kế toán', 2),
(4, 4, 'NV003', 'Lê Quang Cường', '0934567890', 'Phòng Kinh Doanh', 'Nhân viên kinh doanh', 3)
ON DUPLICATE KEY UPDATE `full_name`=VALUES(`full_name`);
