const multer = require('multer');

// Menyimpan file di RAM (memory) sementara sebelum di-push langsung ke AWS S3
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

module.exports = upload;