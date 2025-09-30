import mysql from "mysql2/promise";

let pool;

export function init(config) {
  pool = mysql.createPool(config);
  console.log("Database pool initialized.");
}

export { pool };
