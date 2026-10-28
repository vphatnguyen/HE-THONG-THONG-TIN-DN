-- Chuẩn hóa danh mục sản phẩm và bảo toàn toàn bộ dữ liệu hiện có.
-- Có thể chạy lặp lại an toàn trên đúng database CRM.
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;

  IF OBJECT_ID('dbo.Products','U') IS NULL
    THROW 51000, N'Không tìm thấy bảng Products; không thể tạo danh mục.', 1;

  IF OBJECT_ID('dbo.Categories','U') IS NULL
  BEGIN
    CREATE TABLE dbo.Categories (
      record_version ROWVERSION NOT NULL,
      id INT IDENTITY(1,1) PRIMARY KEY,
      name NVARCHAR(50) NOT NULL,
      description NVARCHAR(500) NULL,
      status NVARCHAR(10) NOT NULL DEFAULT 'ACTIVE'
        CONSTRAINT CK_Categories_status CHECK(status IN ('ACTIVE','INACTIVE')),
      created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
      CONSTRAINT UQ_Categories_Name UNIQUE(name)
    );
  END;

  -- Đưa mọi danh mục đang có trên sản phẩm vào bảng quản lý, không bỏ sót.
  INSERT INTO dbo.Categories(name,status)
  SELECT DISTINCT LTRIM(RTRIM(p.category)), 'ACTIVE'
  FROM dbo.Products p
  WHERE NULLIF(LTRIM(RTRIM(p.category)), N'') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM dbo.Categories c
      WHERE c.name = LTRIM(RTRIM(p.category))
    );

  IF EXISTS (SELECT 1 FROM dbo.Products WHERE NULLIF(LTRIM(RTRIM(category)), N'') IS NULL)
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM dbo.Categories WHERE name=N'Chưa phân loại')
      INSERT INTO dbo.Categories(name,description,status)
      VALUES(N'Chưa phân loại',N'Danh mục tạm cho dữ liệu cũ chưa được phân loại.','INACTIVE');
    UPDATE dbo.Products SET category=N'Chưa phân loại'
    WHERE NULLIF(LTRIM(RTRIM(category)), N'') IS NULL;
  END;

  -- Chuẩn hóa khoảng trắng trước khi tạo khóa ngoại.
  UPDATE dbo.Products SET category = LTRIM(RTRIM(category))
  WHERE category <> LTRIM(RTRIM(category));

  IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID('dbo.Products')
      AND name = 'FK_Products_Categories'
  )
  BEGIN
    ALTER TABLE dbo.Products WITH CHECK
      ADD CONSTRAINT FK_Products_Categories
      FOREIGN KEY(category) REFERENCES dbo.Categories(name) ON UPDATE CASCADE;
    ALTER TABLE dbo.Products CHECK CONSTRAINT FK_Products_Categories;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.Categories')
      AND name = 'IX_Categories_Status'
  )
    CREATE INDEX IX_Categories_Status ON dbo.Categories(status);

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
