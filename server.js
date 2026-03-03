// server.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();

const isLinux = process.platform === 'linux';

let BASE_SFTP;
let UPLOAD_DIR;
let PDF_BASE_DIR;

if (isLinux) {
  BASE_SFTP = '/var/www/sb_ope_001a/public_sftp';
  UPLOAD_DIR = path.join(BASE_SFTP, 'upload');
  PDF_BASE_DIR = BASE_SFTP;
} else {
  BASE_SFTP = path.join(__dirname, 'public_sftp');
  UPLOAD_DIR = path.join(__dirname, 'public_sftp/upload'); 
  PDF_BASE_DIR = BASE_SFTP;
}

app.use(cors({ origin: '*', methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- 1. SE AGREGA 'upload' A LOS TIPOS PERMITIDOS ---
const tiposPermitidos = ['notificaciones', 'reporte', 'consolidado', 'procesados', 'upload'];

const inicializarDirectorios = () => {
  try {
    if (!fs.existsSync(PDF_BASE_DIR)) fs.mkdirSync(PDF_BASE_DIR, { recursive: true });

    // --- 2. SE ASEGURA QUE TODAS LAS CARPETAS INCLUYENDO UPLOAD EXISTAN ---
    tiposPermitidos.forEach(tipo => {
      const dir = path.join(PDF_BASE_DIR, tipo);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`✅ Carpeta [${tipo}] lista.`);
      }
    });
  } catch (err) {
    console.error('❌ ERROR CRÍTICO:', err.message);
  }
};

inicializarDirectorios();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Quitamos el uniqueSuffix (timestamp)
    // Solo reemplazamos espacios por guiones bajos para que Linux no tenga problemas
    const safeName = file.originalname.replace(/\s+/g, '_');
    cb(null, safeName);
  }
});

const upload = multer({ storage: storage, limits: { fileSize: 50 * 1024 * 1024 } });

// --- RUTAS ---

app.post('/upload', upload.single('archivo'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo.' });
    res.json({ message: 'Subida exitosa', ruta: req.file.path });
  } catch (error) {
    res.status(500).json({ error: 'Error en subida' });
  }
});

// MODIFICADO: Listar carpetas o archivos de primer nivel
app.get('/listar/:tipo', (req, res) => {
  const { tipo } = req.params;
  
  // Agregamos estas cabeceras para evitar el 304
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  if (!tiposPermitidos.includes(tipo)) return res.status(400).send('Tipo inválido');
  
  const tipoPath = path.join(PDF_BASE_DIR, tipo);
  if (!fs.existsSync(tipoPath)) return res.json({ carpetas: [], archivos: [] });

  fs.readdir(tipoPath, { withFileTypes: true }, (err, files) => {
    if (err) return res.status(500).send('Error');
    const carpetas = files.filter(f => f.isDirectory()).map(f => f.name);
    const archivos = files.filter(f => f.isFile()).map(f => f.name);
    
    res.json({ carpetas, archivos });
  });
});

// Listar archivos dentro de una subcarpeta (para notificaciones, etc)
app.get('/listar/:tipo/:carpeta', (req, res) => {
  const { tipo, carpeta } = req.params;
  const carpetaPath = path.join(PDF_BASE_DIR, tipo, carpeta);
  if (!fs.existsSync(carpetaPath)) return res.status(404).send('No existe');
  
  fs.readdir(carpetaPath, (err, files) => {
    if (err) return res.status(500).send('Error');
    const listaArchivos = files.filter(f => fs.lstatSync(path.join(carpetaPath, f)).isFile());
    res.json({ archivos: listaArchivos });
  });
});

// Descargar archivo (funciona para cualquier tipo, incluido upload)
app.get('/download/:tipo/:archivo', (req, res) => {
    const { tipo, archivo } = req.params;
    const filePath = path.join(PDF_BASE_DIR, tipo, archivo);
    if (!fs.existsSync(filePath)) return res.status(404).send('No existe');
    res.download(filePath, archivo);
});

// Sobrecarga de ruta para descargar archivos dentro de carpetas (retrocompatibilidad)
app.get('/download/:tipo/:carpeta/:archivo', (req, res) => {
  const { tipo, carpeta, archivo } = req.params;
  const filePath = path.join(PDF_BASE_DIR, tipo, carpeta, archivo);
  if (!fs.existsSync(filePath)) return res.status(404).send('No existe');
  res.download(filePath, archivo);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 SERVIDOR LISTO EN PUERTO: ${PORT}`);
  console.log(`📂 MODO: ${isLinux ? 'PROD' : 'DEV'}`);
});