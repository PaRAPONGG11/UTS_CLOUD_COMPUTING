require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const bcrypt = require('bcryptjs');

const pool = require('./config/db');
const s3Client = require('./config/s3');
const upload = require('./middleware/upload');

const app = express();
const port = process.env.PORT || 5000;

app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({ secret: process.env.SESSION_SECRET || 'fallback_rahasia', resave: false, saveUninitialized: true }));

// --- ROUTE: BERANDA (FORM & LIST) ---
app.get('/', async (req, res) => {
    try {
        const [laporan] = await pool.query("SELECT * FROM laporan ORDER BY id DESC");
        res.render('index', { laporan_list: laporan, user: req.session.user, role: req.session.role });
    } catch (error) {
        res.status(500).send("Database Error.");
    }
});

// --- ROUTE: SUBMIT LAPORAN ---
app.post('/submit', upload.single('foto'), async (req, res) => {
    const { subjek, deskripsi, lokasi, latitude, longitude } = req.body;
    let fotoUrl = "";

    try {
        if (req.file) {
            const fileName = Date.now() + '-' + req.file.originalname.replace(/\s+/g, '-');
            // Cukup seperti ini:
            await s3Client.send(new PutObjectCommand({
                Bucket: process.env.S3_BUCKET_NAME,
                Key: fileName,
                Body: req.file.buffer,
                ContentType: req.file.mimetype
            }));
            fotoUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.S3_REGION}.amazonaws.com/${fileName}`;
        }
        await pool.query(
            "INSERT INTO laporan (subjek, deskripsi, lokasi, latitude, longitude, foto_url) VALUES (?, ?, ?, ?, ?, ?)", 
            [subjek, deskripsi, lokasi, latitude, longitude, fotoUrl]
        );
        res.redirect('/');
    } catch (error) {
        console.error(error);
        res.status(500).send("Gagal mengunggah laporan.");
    }
});

// --- ROUTE: DETAIL & VERIFIKASI PETUGAS ---
app.get('/detail/:id', async (req, res) => {
    try {
        const [laporan] = await pool.query("SELECT * FROM laporan WHERE id = ?", [req.params.id]);
        if (laporan.length > 0) {
            res.render('detail', { lap: laporan[0], role: req.session.role });
        } else {
            res.status(404).send("Laporan tidak ditemukan.");
        }
    } catch (error) {
        res.status(500).send("Database Error.");
    }
});

// API Verifikasi Petugas (Ubah Status ke Selesai + Upload Bukti)
app.post('/verify/:id', upload.single('foto_bukti'), async (req, res) => {
    if (req.session.role !== 'admin') return res.status(403).send("Hanya petugas yang bisa verifikasi.");
    
    let buktiUrl = "";
    try {
        if (req.file) {
            const fileName = 'bukti-' + Date.now() + '-' + req.file.originalname.replace(/\s+/g, '-');
            await s3Client.send(new PutObjectCommand({
                Bucket: process.env.S3_BUCKET_NAME,
                Key: fileName,
                Body: req.file.buffer,
                ContentType: req.file.mimetype,
                ACL: 'public-read'
            }));
            buktiUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.S3_REGION}.amazonaws.com/${fileName}`;
        }
        await pool.query("UPDATE laporan SET status = 'Selesai', bukti_selesai_url = ? WHERE id = ?", [buktiUrl, req.params.id]);
        res.redirect('/detail/' + req.params.id);
    } catch (error) {
        res.status(500).send("Gagal verifikasi laporan.");
    }
});

// --- ROUTE: PETA SEBARAN ---
app.get('/map', async (req, res) => {
    try {
        const [laporan] = await pool.query("SELECT id, subjek, latitude, longitude, status FROM laporan WHERE latitude IS NOT NULL");
        res.render('map', { laporan_list: JSON.stringify(laporan) });
    } catch (error) {
        res.status(500).send("Database Error.");
    }
});

// --- ROUTE: LOGIN SIMPEL ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === '123') { // Login Petugas
        req.session.user = 'Admin Petugas';
        req.session.role = 'admin';
        return res.json({ status: "success" });
    }
    res.status(401).json({ status: "error", message: "Login Gagal" });
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.listen(port, () => { console.log(`Server berjalan di port ${port}`); });