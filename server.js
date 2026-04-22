require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
const { PutObjectCommand } = require('@aws-sdk/client-s3');

const pool = require('./config/db');
const s3Client = require('./config/s3'); 

const app = express();
const port = process.env.PORT || 80;

app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({ secret: process.env.SESSION_SECRET || 'fallback_rahasia', resave: false, saveUninitialized: true }));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- ROUTE: BERANDA ---
app.get('/', async (req, res) => {
    try {
        const [laporan] = await pool.query(`SELECT * FROM reports ORDER BY id DESC`);
        // Disesuaikan: index.ejs membutuhkan variabel bernama 'reports'
        res.render('index', { reports: laporan, user: req.session.user, role: req.session.role });
    } catch (error) {
        console.error("Error di Beranda:", error);
        res.status(500).send("Terjadi kesalahan saat memuat beranda.");
    }
});

// --- ROUTE: SUBMIT LAPORAN ---
// Disesuaikan: index.ejs form action mengarah ke /report, input file bernama 'image'
app.post('/report', upload.single('image'), async (req, res) => {
    const { title, description, location, latitude, longitude } = req.body;
    let fotoUrl = "";

    try {
        if (req.file) {
            const fileName = Date.now() + '-' + req.file.originalname.replace(/\s+/g, '-');
            await s3Client.send(new PutObjectCommand({
                Bucket: process.env.S3_BUCKET_NAME,
                Key: fileName,
                Body: req.file.buffer,
                ContentType: req.file.mimetype
            }));
            fotoUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.S3_REGION}.amazonaws.com/${fileName}`;
        }

        await pool.query(
            "INSERT INTO reports (title, description, location_name, latitude, longitude, image_url) VALUES (?, ?, ?, ?, ?, ?)", 
            [title, description, location, latitude, longitude, fotoUrl]
        );
        res.redirect('/');
    } catch (error) {
        console.error("Error Submit:", error);
        res.status(500).send("Gagal mengunggah laporan.");
    }
});

// --- ROUTE: PETA SEBARAN ---
// Disesuaikan: navbar link mengarah ke /reports
app.get('/reports', async (req, res) => {
    try {
        const [laporan] = await pool.query("SELECT * FROM reports ORDER BY id DESC");
        res.render('reports', { reports: laporan });
    } catch (error) {
        console.error("Error Peta:", error);
        res.status(500).send("Gagal memuat peta.");
    }
});

// --- ROUTE: DETAIL LAPORAN ---
app.get('/reports/:id', async (req, res) => {
    try {
        const [laporan] = await pool.query("SELECT * FROM reports WHERE id = ?", [req.params.id]);
        if (laporan.length > 0) {
            // Disesuaikan: detail.ejs membutuhkan variabel bernama 'report'
            res.render('detail', { report: laporan[0], role: req.session.role });
        } else {
            res.status(404).send("Laporan tidak ditemukan.");
        }
    } catch (error) {
        console.error("Error Detail:", error);
        res.status(500).send("Gagal memuat detail laporan.");
    }
});

// --- API VERIFIKASI PETUGAS ---
// Disesuaikan: action mengarah ke /reports/:id/verify, input file bernama 'evidence'
app.post('/reports/:id/verify', upload.single('evidence'), async (req, res) => {
    if (req.session.role !== 'admin') return res.status(403).send("Hanya petugas yang bisa verifikasi.");
    
    let buktiUrl = "";
    try {
        if (req.file) {
            const fileName = 'bukti-' + Date.now() + '-' + req.file.originalname.replace(/\s+/g, '-');
            await s3Client.send(new PutObjectCommand({
                Bucket: process.env.S3_BUCKET_NAME,
                Key: fileName,
                Body: req.file.buffer,
                ContentType: req.file.mimetype
            }));
            buktiUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.S3_REGION}.amazonaws.com/${fileName}`;
        }

        await pool.query("UPDATE reports SET status = 'Selesai', evidence_url = ? WHERE id = ?", [buktiUrl, req.params.id]);
        res.redirect('/reports/' + req.params.id);
    } catch (error) {
        console.error("Error Verifikasi:", error);
        res.status(500).send("Gagal verifikasi laporan.");
    }
});

// --- API HAPUS LAPORAN ---
// Ditambahkan karena detail.ejs memiliki tombol form penghapusan laporan
app.post('/reports/:id/delete', async (req, res) => {
    try {
        await pool.query("DELETE FROM reports WHERE id = ?", [req.params.id]);
        res.redirect('/');
    } catch (error) {
        console.error("Error Hapus:", error);
        res.status(500).send("Gagal menghapus laporan.");
    }
});

// --- ROUTE: LOGIN SIMPEL ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === '123') {
        req.session.user = 'Admin Petugas';
        req.session.role = 'admin';
        return res.json({ status: "success" });
    }
    res.status(401).json({ status: "error", message: "Login Gagal" });
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.listen(port, () => { console.log(`Server AWS (S3 + RDS) berjalan di port ${port}`); });