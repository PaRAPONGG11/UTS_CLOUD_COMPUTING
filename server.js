require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
const { PutObjectCommand } = require('@aws-sdk/client-s3');

// Pastikan dua file config ini ada!
const pool = require('./config/db');
const s3Client = require('./config/s3'); 

const app = express();
const port = process.env.PORT || 80;

app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({ secret: process.env.SESSION_SECRET || 'fallback_rahasia', resave: false, saveUninitialized: true }));

// --- KONFIGURASI UPLOAD FOTO AWS S3 (Memory Storage) ---
// Kita simpan di memori (buffer) sementara, lalu langsung dilempar ke S3
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- ROUTE: BERANDA (FORM & LIST) ---
app.get('/', async (req, res) => {
    try {
        // Trik Alias dipertahankan: Ambil dari reports (Inggris), jadikan variabel (Indonesia)
        const [laporan] = await pool.query(`
            SELECT id, title AS subjek, description AS deskripsi, 
                   location_name AS lokasi, latitude, longitude, 
                   image_url AS foto_url, status, 
                   evidence_url AS bukti_selesai_url, created_at AS tanggal 
            FROM reports ORDER BY id DESC
        `);
        res.render('index', { laporan_list: laporan, user: req.session.user, role: req.session.role });
    } catch (error) {
        console.error(error);
        res.status(500).send("Database Error.");
    }
});

// --- ROUTE: SUBMIT LAPORAN ---
app.post('/submit', upload.single('foto'), async (req, res) => {
    const { subjek, deskripsi, lokasi, latitude, longitude } = req.body;
    let fotoUrl = "";

    try {
        // Jika ada file foto, lempar ke AWS S3
        if (req.file) {
            const fileName = Date.now() + '-' + req.file.originalname.replace(/\s+/g, '-');
            
            await s3Client.send(new PutObjectCommand({
                Bucket: process.env.S3_BUCKET_NAME,
                Key: fileName,
                Body: req.file.buffer,
                ContentType: req.file.mimetype
            }));
            
            // Format URL publik S3
            fotoUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.S3_REGION}.amazonaws.com/${fileName}`;
        }

        // Masukkan data ke AWS RDS (tabel reports)
        await pool.query(
            "INSERT INTO reports (title, description, location_name, latitude, longitude, image_url) VALUES (?, ?, ?, ?, ?, ?)", 
            [subjek, deskripsi, lokasi, latitude, longitude, fotoUrl]
        );
        res.redirect('/');
    } catch (error) {
        console.error(error);
        res.status(500).send("Gagal mengunggah laporan ke AWS.");
    }
});

// --- ROUTE: DETAIL & VERIFIKASI PETUGAS ---
app.get('/detail/:id', async (req, res) => {
    try {
        const [laporan] = await pool.query(`
            SELECT id, title AS subjek, description AS deskripsi, 
                   location_name AS lokasi, latitude, longitude, 
                   image_url AS foto_url, status, 
                   evidence_url AS bukti_selesai_url, created_at AS tanggal 
            FROM reports WHERE id = ?
        `, [req.params.id]);

        if (laporan.length > 0) {
            res.render('detail', { lap: laporan[0], role: req.session.role });
        } else {
            res.status(404).send("Laporan tidak ditemukan.");
        }
    } catch (error) {
        res.status(500).send("Database Error.");
    }
});

// --- API VERIFIKASI PETUGAS ---
app.post('/verify/:id', upload.single('foto_bukti'), async (req, res) => {
    if (req.session.role !== 'admin') return res.status(403).send("Hanya petugas yang bisa verifikasi.");
    
    let buktiUrl = "";

    try {
        // Jika petugas upload bukti foto, lempar ke S3
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
        res.redirect('/detail/' + req.params.id);
    } catch (error) {
        console.error(error);
        res.status(500).send("Gagal verifikasi laporan.");
    }
});

// --- ROUTE: PETA SEBARAN ---
app.get('/map', async (req, res) => {
    try {
        const [laporan] = await pool.query("SELECT id, title AS subjek, latitude, longitude, status FROM reports WHERE latitude IS NOT NULL");
        res.render('map', { laporan_list: JSON.stringify(laporan) });
    } catch (error) {
        res.status(500).send("Database Error.");
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