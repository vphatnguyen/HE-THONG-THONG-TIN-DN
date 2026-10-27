require('dotenv').config();

const sql = require('msnodesqlv8');

let sqlServerPool = null;
let activeEngine = 'none';

function connectionString() {
  const server = process.env.DB_SERVER || 'localhost\\SQLEXPRESS';
  const database = process.env.DB_DATABASE || 'CosmeticsCRM_DB';
  return `Driver={ODBC Driver 18 for SQL Server};Server=${server};Database=${database};Trusted_Connection=yes;TrustServerCertificate=yes;`;
}

async function initSqlServer() {
  const pool = new sql.Pool({
    connectionString: connectionString(),
    floor: 1,
    ceiling: 10,
    useUTC: false
  });
  await pool.promises.open();
  return pool;
}

function normalizeParams(args) {
  return args.flat().map(value => value === undefined ? null : value);
}

function rowsFrom(result) {
  return (Array.isArray(result?.first) ? result.first : []).map(row => {
    if (row.record_version && typeof row.record_version !== 'string') {
      return { ...row, record_version: Buffer.from(row.record_version).toString('hex') };
    }
    return row;
  });
}

function createPrepared(executor, sqlQuery) {
  return {
    async get(...args) {
      const result = await executor.promises.query(sqlQuery, normalizeParams(args));
      return rowsFrom(result)[0];
    },

    async all(...args) {
      const result = await executor.promises.query(sqlQuery, normalizeParams(args));
      return rowsFrom(result);
    },

    async run(...args) {
      const isInsert = /^\s*INSERT\s+INTO/i.test(sqlQuery);
      let wrappedSql = sqlQuery;
      if (isInsert && !/SCOPE_IDENTITY/i.test(sqlQuery)) {
        wrappedSql += '; SELECT CAST(SCOPE_IDENTITY() AS INT) AS lastInsertRowid, @@ROWCOUNT AS changes;';
      } else if (!/@@ROWCOUNT/i.test(sqlQuery)) {
        wrappedSql += '; SELECT CAST(0 AS INT) AS lastInsertRowid, @@ROWCOUNT AS changes;';
      }

      const result = await executor.promises.query(wrappedSql, normalizeParams(args));
      const resultSets = Array.isArray(result?.results) ? result.results : [];
      const infoSet = resultSets[resultSets.length - 1] || [];
      const info = infoSet[0] || {};
      return {
        lastInsertRowid: Number(info.lastInsertRowid) || 0,
        changes: Number(info.changes) || 0
      };
    }
  };
}

const db = {
  get engine() {
    return activeEngine;
  },

  get databaseName() {
    return process.env.DB_DATABASE || 'CosmeticsCRM_DB';
  },

  async init() {
    if (activeEngine !== 'none') return db;

    console.log(`Dang ket noi Microsoft SQL Server Express (${process.env.DB_SERVER || 'localhost\\SQLEXPRESS'})...`);
    sqlServerPool = await initSqlServer();
    activeEngine = 'msnodesqlv8';
    console.log(`Da ket noi thanh cong toi Microsoft SQL Server Express: ${db.databaseName}`);
    return db;
  },

  prepare(sqlQuery) {
    if (!sqlServerPool) throw new Error('Database chưa được khởi tạo');
    return createPrepared(sqlServerPool, sqlQuery);
  },

  async transaction(callback) {
    if (!sqlServerPool) throw new Error('Database chưa được khởi tạo');
    const description = await sqlServerPool.promises.beginTransaction();
    const connection = description.connection;
    try {
      await connection.promises.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
      const result = await callback({ prepare: sqlQuery => createPrepared(connection, sqlQuery) });
      await sqlServerPool.promises.commitTransaction(description);
      return result;
    } catch (error) {
      try { await sqlServerPool.promises.rollbackTransaction(description); } catch { }
      throw error;
    }
  },

  async close() {
    if (sqlServerPool) {
      await sqlServerPool.promises.close();
      sqlServerPool = null;
    }
    activeEngine = 'none';
  }
};

module.exports = db;
