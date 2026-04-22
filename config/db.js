// const mysql = require('mysql2/promise');
// require('dotenv').config();

// const pool = mysql.createPool({
//     host: process.env.DB_HOST,
//     user: process.env.DB_USER,
//     password: process.env.DB_PASSWORD,
//     database: process.env.DB_NAME,
//     port: process.env.DB_PORT || 3306,
//     waitForConnections: true,
//     connectionLimit: 10,
//     queueLimit: 0,
//     enableKeepAlive: true,
//     keepAliveInitialDelay: 0
// });

// module.exports = pool;
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: "sampah.caza4y6k4bni.us-east-1.rds.amazonaws.com", // Masukkan endpoint tanpa spasi/http
    user: "admin", // Gunakan user asli kamu
    password: "Password_RDS_Kamu", // Masukkan password aslinya
    database: "sampah",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;