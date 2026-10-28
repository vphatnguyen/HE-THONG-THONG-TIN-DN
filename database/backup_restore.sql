-- ============================================================
-- SAO LƯU VÀ PHỤC HỒI CSDL ĐƠN GIẢN BẰNG FULL BACKUP
-- CSDL: CosmeticsCRM_DB - Microsoft SQL Server
-- CHỈ chạy phần giả lập xóa dữ liệu trên CSDL học tập/kiểm thử.
-- ============================================================

-- Thư mục C:\CosmeticsCRM_Backup phải tồn tại trên máy SQL Server.
USE master;
GO
EXEC master.dbo.xp_create_subdir N'C:\CosmeticsCRM_Backup';
GO

-- BƯỚC 1: TẠO DỮ LIỆU DEMO
USE CosmeticsCRM_DB;
GO

DELETE FROM dbo.Suppliers
WHERE name = N'NHÀ CUNG CẤP DEMO PHỤC HỒI';
GO

INSERT INTO dbo.Suppliers
    (name, contact_name, email, phone, address, status)
VALUES
    (N'NHÀ CUNG CẤP DEMO PHỤC HỒI',
     N'Người kiểm thử',
     N'restore.demo@example.com',
     N'0900000000',
     N'Dữ liệu dùng để kiểm tra phục hồi',
     'ACTIVE');
GO

SELECT * FROM dbo.Suppliers
WHERE name = N'NHÀ CUNG CẤP DEMO PHỤC HỒI';
GO
-- Kết quả: 1 dòng.

-- BƯỚC 2: FULL BACKUP TOÀN BỘ CSDL
USE master;
GO

BACKUP DATABASE CosmeticsCRM_DB
TO DISK = N'C:\CosmeticsCRM_Backup\CosmeticsCRM_FULL.bak'
WITH
    INIT,
    CHECKSUM,
    NAME = N'Full Backup CosmeticsCRM_DB',
    STATS = 10;
GO

RESTORE VERIFYONLY
FROM DISK = N'C:\CosmeticsCRM_Backup\CosmeticsCRM_FULL.bak'
WITH CHECKSUM;
GO
-- Full Backup chứa toàn bộ 15 bảng và dữ liệu tại thời điểm backup.

-- BƯỚC 3: GIẢ LẬP XÓA MẤT DỮ LIỆU
-- CẢNH BÁO: chỉ chạy trên CSDL học tập/kiểm thử.
USE CosmeticsCRM_DB;
GO

DELETE FROM dbo.Suppliers
WHERE name = N'NHÀ CUNG CẤP DEMO PHỤC HỒI';
GO

SELECT COUNT(*) AS SoDongSauKhiXoa
FROM dbo.Suppliers
WHERE name = N'NHÀ CUNG CẤP DEMO PHỤC HỒI';
GO
-- Kết quả: 0.

-- BƯỚC 4: PHỤC HỒI FULL BACKUP
-- Trước khi chạy: dừng ứng dụng Node.js và đóng query đang dùng DB.
USE master;
GO

ALTER DATABASE CosmeticsCRM_DB
SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
GO

RESTORE DATABASE CosmeticsCRM_DB
FROM DISK = N'C:\CosmeticsCRM_Backup\CosmeticsCRM_FULL.bak'
WITH
    REPLACE,
    RECOVERY,
    CHECKSUM,
    STATS = 10;
GO

ALTER DATABASE CosmeticsCRM_DB SET MULTI_USER;
GO

-- BƯỚC 5: KIỂM TRA SAU PHỤC HỒI
USE CosmeticsCRM_DB;
GO

SELECT * FROM dbo.Suppliers
WHERE name = N'NHÀ CUNG CẤP DEMO PHỤC HỒI';
GO
-- Kết quả: dữ liệu demo xuất hiện lại.

SELECT COUNT(*) AS TongSoBang
FROM sys.tables;
GO
-- Kết quả: 15 bảng.

SELECT name, state_desc
FROM sys.databases
WHERE name = N'CosmeticsCRM_DB';
GO
-- Kết quả: ONLINE.

DBCC CHECKDB (N'CosmeticsCRM_DB') WITH NO_INFOMSGS;
GO
-- Kết quả: không có lỗi consistency.

PRINT N'HOÀN THÀNH: CSDL đã được phục hồi từ Full Backup.';
GO
