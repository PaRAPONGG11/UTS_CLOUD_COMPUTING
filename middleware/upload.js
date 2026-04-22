const multer = require('multer');
const multerS3 = require('multer-s3');
const s3 = require('../config/s3');
require('dotenv').config();

const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.S3_BUCKET_NAME,
        acl: 'public-read', // Memastikan file yang diupload bisa dibaca publik
        metadata: function (req, file, cb) {
            cb(null, { fieldName: file.fieldname });
        },
        key: function (req, file, cb) {
            // Nama file unik: angka-timestamp-namaasli.jpg
            cb(null, `uploads/${Date.now().toString()}-${file.originalname}`);
        }
    })
});

module.exports = upload;