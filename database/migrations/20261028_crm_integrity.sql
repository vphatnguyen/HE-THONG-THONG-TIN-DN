-- Additive migration; never deletes application data. Run against the selected database.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH('dbo.Accounts','record_version') IS NULL ALTER TABLE dbo.Accounts ADD record_version ROWVERSION NOT NULL;
IF COL_LENGTH('dbo.Products','record_version') IS NULL ALTER TABLE dbo.Products ADD record_version ROWVERSION NOT NULL;
IF COL_LENGTH('dbo.Suppliers','record_version') IS NULL ALTER TABLE dbo.Suppliers ADD record_version ROWVERSION NOT NULL;
IF COL_LENGTH('dbo.Surveys','record_version') IS NULL ALTER TABLE dbo.Surveys ADD record_version ROWVERSION NOT NULL;
IF COL_LENGTH('dbo.Feedbacks','record_version') IS NULL ALTER TABLE dbo.Feedbacks ADD record_version ROWVERSION NOT NULL;
IF COL_LENGTH('dbo.Feedbacks','replied_at') IS NULL ALTER TABLE dbo.Feedbacks ADD replied_at DATETIME2 NULL;
IF COL_LENGTH('dbo.Feedbacks','updated_at') IS NULL ALTER TABLE dbo.Feedbacks ADD updated_at DATETIME2 NULL;
IF OBJECT_ID('dbo.FeedbackReplyHistory','U') IS NULL
CREATE TABLE dbo.FeedbackReplyHistory (
  id INT IDENTITY(1,1) PRIMARY KEY,
  feedback_id INT NOT NULL REFERENCES dbo.Feedbacks(id),
  manager_id INT NULL REFERENCES dbo.Accounts(id),
  old_content NVARCHAR(MAX) NULL,
  new_content NVARCHAR(MAX) NOT NULL,
  changed_at DATETIME2 NOT NULL DEFAULT GETDATE()
);
-- SQL Server UNIQUE constraints allow only one NULL. Email is optional in the app.
-- Keep uniqueness for real emails, allow multiple accounts without an email.
DECLARE @constraint sysname;
SELECT @constraint=kc.name FROM sys.key_constraints kc
JOIN sys.index_columns ic ON ic.object_id=kc.parent_object_id AND ic.index_id=kc.unique_index_id
JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
WHERE kc.parent_object_id=OBJECT_ID('dbo.Accounts') AND kc.type='UQ' AND c.name='email'
AND (SELECT COUNT(*) FROM sys.index_columns n WHERE n.object_id=kc.parent_object_id AND n.index_id=kc.unique_index_id)=1;
IF @constraint IS NOT NULL
BEGIN
  DECLARE @statement NVARCHAR(MAX)=N'ALTER TABLE dbo.Accounts DROP CONSTRAINT '+QUOTENAME(@constraint);
  EXEC sys.sp_executesql @statement;
END;
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.Accounts') AND name='UX_Accounts_Email_NotNull')
CREATE UNIQUE INDEX UX_Accounts_Email_NotNull ON dbo.Accounts(email) WHERE email IS NOT NULL;
COMMIT;
