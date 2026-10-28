-- Additive and idempotent: question templates belonging to each Manager.
IF OBJECT_ID('dbo.SurveyQuestionTemplates','U') IS NULL
BEGIN
  CREATE TABLE dbo.SurveyQuestionTemplates (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(100) NOT NULL,
    questions_json NVARCHAR(MAX) NOT NULL,
    created_by INT NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_SurveyQuestionTemplates_Accounts FOREIGN KEY (created_by) REFERENCES dbo.Accounts(id) ON DELETE CASCADE,
    CONSTRAINT UQ_SurveyQuestionTemplates_OwnerName UNIQUE(created_by,name),
    CONSTRAINT CK_SurveyQuestionTemplates_Json CHECK(ISJSON(questions_json)=1)
  );
END;
