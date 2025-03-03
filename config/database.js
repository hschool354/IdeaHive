const mysql = require('mysql2/promise');
require('dotenv').config();

// Create a connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ideahive',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

/**
 * Execute a single query and return results
 * @param {string} sql - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>} - Query results
 */
const executeQuery = async (sql, params = []) => {
  try {
    // Special handling for transaction commands which can't use prepared statements
    if (sql === 'START TRANSACTION' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      const connection = await pool.getConnection();
      try {
        await connection.query(sql);
        return [];
      } finally {
        connection.release();
      }
    }
    
    // Normal query execution with prepared statements
    const [results] = await pool.execute(sql, params);
    return results;
  } catch (error) {
    console.error('Database error:', error);
    throw error;
  }
};

/**
 * Execute a query and return both results and fields
 * @param {string} sql - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>} - Array containing results and fields
 */
const query = async (sql, params = []) => {
  try {
    return await pool.query(sql, params);
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

/**
 * Begin a transaction
 * @returns {Promise<Object>} - Transaction object
 */
const beginTransaction = async () => {
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  
  // Return a transaction object with methods for queries within this transaction
  return {
    execute: async (sql, params = []) => {
      const [results] = await connection.execute(sql, params);
      return results;
    },
    commit: async () => {
      await connection.commit();
      connection.release();
    },
    rollback: async () => {
      await connection.rollback();
      connection.release();
    },
    release: () => {
      connection.release();
    }
  };
};

// Export available functions
module.exports = {
  pool,
  query,
  executeQuery,
  beginTransaction
};