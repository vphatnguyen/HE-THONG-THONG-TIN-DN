-- Approved scope: remove customer membership tiers and product inventory.
-- Run explicitly against the intended database after backup/review.
-- Not executed automatically at application startup. No customer/product rows are deleted.
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;
  IF OBJECT_ID('dbo.Customers','U') IS NULL OR OBJECT_ID('dbo.Products','U') IS NULL
    THROW 51000, N'Không tìm thấy schema CRM; không thực hiện migration.', 1;

  IF OBJECT_ID('dbo.CK_Customers_tier','C') IS NOT NULL
    ALTER TABLE dbo.Customers DROP CONSTRAINT CK_Customers_tier;

  DECLARE @table sysname, @constraint sysname, @statement NVARCHAR(MAX);
  DECLARE obsolete_defaults CURSOR LOCAL FAST_FORWARD FOR
    SELECT t.name, d.name
    FROM sys.default_constraints d
    JOIN sys.tables t ON t.object_id=d.parent_object_id
    JOIN sys.schemas s ON s.schema_id=t.schema_id
    JOIN sys.columns c ON c.object_id=t.object_id AND c.column_id=d.parent_column_id
    WHERE s.name='dbo' AND
      ((t.name='Customers' AND c.name='membership_tier') OR
       (t.name='Products' AND c.name='stock_quantity'));
  OPEN obsolete_defaults;
  FETCH NEXT FROM obsolete_defaults INTO @table,@constraint;
  WHILE @@FETCH_STATUS=0
  BEGIN
    SET @statement=N'ALTER TABLE dbo.'+QUOTENAME(@table)+N' DROP CONSTRAINT '+QUOTENAME(@constraint);
    EXEC sys.sp_executesql @statement;
    FETCH NEXT FROM obsolete_defaults INTO @table,@constraint;
  END;
  CLOSE obsolete_defaults;
  DEALLOCATE obsolete_defaults;

  IF COL_LENGTH('dbo.Customers','membership_tier') IS NOT NULL
    ALTER TABLE dbo.Customers DROP COLUMN membership_tier;
  IF COL_LENGTH('dbo.Products','stock_quantity') IS NOT NULL
    ALTER TABLE dbo.Products DROP COLUMN stock_quantity;
  -- Customers.created_at is intentionally retained as internal metadata.
  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT>0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
