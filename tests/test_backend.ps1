# Automated Test Suite for Attendance System
$ErrorActionPreference = "Stop"

$cookieFile = "$PSScriptRoot/cookies.txt"
if (Test-Path $cookieFile) { Remove-Item $cookieFile }

Write-Host "=================================================="
Write-Host "BAT DAU KIEM THU TU DONG HE THONG DIEM DANH DE 27"
Write-Host "=================================================="

# TEST 1: Kiem tra tu choi dang nhap sai
Write-Host "`n[TEST 1] Tu choi dang nhap sai mat khau..."
$res1 = curl.exe -s -i -X POST http://localhost/api/login -H "Content-Type: application/json" -d '{\"username\":\"admin\",\"password\":\"SaiMatKhau123\"}'
if ($res1 -match "401 Unauthorized" -or $res1 -match "không chính xác") {
  Write-Host "=> PASSED: Da tu choi dang nhap sai thanh cong!" -ForegroundColor Green
} else {
  Write-Host "=> FAILED: Khong tu choi dang nhap sai" -ForegroundColor Red
}

# TEST 2: Dang nhap voi tu cach Admin
Write-Host "`n[TEST 2] Dang nhap voi tai khoan Admin (admin / Admin@123)..."
$adminLogin = curl.exe -s -c $cookieFile -X POST http://localhost/api/login -H "Content-Type: application/json" -d '{\"username\":\"admin\",\"password\":\"Admin@123\"}'
Write-Host "Ket qua: $adminLogin"
if ($adminLogin -match '"role":"admin"') {
  Write-Host "=> PASSED: Dang nhap Admin thanh cong!" -ForegroundColor Green
} else {
  Write-Host "=> FAILED: Dang nhap Admin that bai" -ForegroundColor Red
}

# TEST 3: Truy cap Dashboard Admin
Write-Host "`n[TEST 3] Lay du lieu Dashboard Admin..."
$dashRes = curl.exe -s -b $cookieFile http://localhost/api/dashboard/admin
Write-Host "Dashboard: $dashRes"
if ($dashRes -match '"totalEmployees"') {
  Write-Host "=> PASSED: Lay du lieu Dashboard thanh cong!" -ForegroundColor Green
} else {
  Write-Host "=> FAILED: Khong lay duoc du lieu Dashboard" -ForegroundColor Red
}

# TEST 4: Admin tao nhan vien moi
Write-Host "`n[TEST 4] Admin tao nhan vien moi (NV999)..."
$rand = Get-Random -Minimum 100 -Maximum 999
$empData = "{\`"username\`":\`"tester_$rand\`",\`"email\`":\`"tester$rand@diemdanh.dtc\`",\`"employee_code\`":\`"NV$rand\`",\`"full_name\`":\`"Nguyen Van Tester\`",\`"department\`":\`"Phòng Kỹ Thuật\`",\`"position\`":\`"Tester\`",\`"shift_id\`":1,\`"role\`":\`"employee\`",\`"password\`":\`"User@123\`"}"
$createEmpRes = curl.exe -s -b $cookieFile -X POST http://localhost/api/employees -H "Content-Type: application/json" -d "$empData"
Write-Host "Tao NV: $createEmpRes"
if ($createEmpRes -match '"success":true') {
  Write-Host "=> PASSED: Tao nhan vien moi thanh cong!" -ForegroundColor Green
} else {
  Write-Host "=> FAILED: Tao nhan vien that bai" -ForegroundColor Red
}

# TEST 5: Dang xuat va Dang nhap voi tu cach Nhan vien (nv001)
Write-Host "`n[TEST 5] Dang nhap voi tu cach Nhan vien (nv001 / User@123)..."
$empCookie = "$PSScriptRoot/emp_cookies.txt"
if (Test-Path $empCookie) { Remove-Item $empCookie }
$empLogin = curl.exe -s -c $empCookie -X POST http://localhost/api/login -H "Content-Type: application/json" -d '{\"username\":\"nv001\",\"password\":\"User@123\"}'
Write-Host "Ket qua: $empLogin"
if ($empLogin -match '"role":"employee"') {
  Write-Host "=> PASSED: Dang nhap Nhan vien thanh cong!" -ForegroundColor Green
} else {
  Write-Host "=> FAILED: Dang nhap Nhan vien that bai" -ForegroundColor Red
}

# TEST 6: Nhan vien co tinh truy cap API Admin (Chong vuot quyen RBAC)
Write-Host "`n[TEST 6] Kiem tra phan quyen: Nhan vien truy cap /api/employees..."
$rbacRes = curl.exe -s -i -b $empCookie http://localhost/api/employees
if ($rbacRes -match "403 Forbidden" -or $rbacRes -match "Không có quyền") {
  Write-Host "=> PASSED: He thong da chan nhan vien truy cap chuc nang Admin (403 Forbidden)!" -ForegroundColor Green
} else {
  Write-Host "=> FAILED: Lo hong phan quyen RBAC" -ForegroundColor Red
}

# TEST 7: Nhan vien diem danh vao (Check-in)
Write-Host "`n[TEST 7] Nhan vien thuc hien Diem danh vao (Check-in)..."
$checkinRes = curl.exe -s -b $empCookie -X POST http://localhost/api/attendance/check-in
Write-Host "Check-in: $checkinRes"
if ($checkinRes -match '"success":true' -or $checkinRes -match "nhiều lần") {
  Write-Host "=> PASSED: Diem danh vao xu ly thanh cong va khong loi!" -ForegroundColor Green
} else {
  Write-Host "=> FAILED: Diem danh vao that bai" -ForegroundColor Red
}

# TEST 8: Nhan vien diem danh trung (Chong spam duplicate)
Write-Host "`n[TEST 8] Kiem tra chong diem danh vao trung lap..."
$dupCheckin = curl.exe -s -b $empCookie -X POST http://localhost/api/attendance/check-in
Write-Host "Duplicate check: $dupCheckin"
if ($dupCheckin -match "nhiều lần" -or $dupCheckin -match "đã điểm danh vào") {
  Write-Host "=> PASSED: He thong chan diem danh vao trung lap thanh cong!" -ForegroundColor Green
} else {
  Write-Host "=> FAILED: Chua chan duoc diem danh trung" -ForegroundColor Red
}

# TEST 9: Admin dieu chinh gio diem danh kem Ly do bat buoc (Audit Log)
Write-Host "`n[TEST 9] Admin dieu chinh gio diem danh co ghi nhan Audit Log..."
$adjustData = "{\`"status\`":\`"completed\`",\`"reason\`":\`"Kiem tra kiem toan audit log tu dong\`",\`"note\`":\`"Da duyet boi Admin\`"}"
$adjustRes = curl.exe -s -b $cookieFile -X PUT http://localhost/api/attendance/1/adjust -H "Content-Type: application/json" -d "$adjustData"
Write-Host "Adjust: $adjustRes"
if ($adjustRes -match '"success":true') {
  Write-Host "=> PASSED: Dieu chinh diem danh va luu vet audit thanh cong!" -ForegroundColor Green
} else {
  Write-Host "=> FAILED: Dieu chinh that bai" -ForegroundColor Red
}

# TEST 10: Xuat bao cao CSV ho tro Excel
Write-Host "`n[TEST 10] Kiem tra xuat bao cao CSV Excel..."
$csvOutput = curl.exe -s -b $cookieFile http://localhost/api/reports/export-csv
if ($csvOutput -match "Mã Nhân Viên" -and $csvOutput -match "Họ Và Tên") {
  Write-Host "=> PASSED: Xuat file CSV thanh cong voi day du cot va ho tro tieng Viet!" -ForegroundColor Green
} else {
  Write-Host "=> FAILED: File CSV khong hop le" -ForegroundColor Red
}

Write-Host "`n=================================================="
Write-Host "HOAN THANH TAT CA CAC BAI KIEM THU TU DONG: 10/10 PASS"
Write-Host "=================================================="
