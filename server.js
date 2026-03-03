// server.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const isProduction = process.env.NODE_ENV === 'production';

// Directorios base
const UPLOAD_DIR = path.join(__dirname, 'public_sftp', 'carga_sftp', 'excel');
const PDF_BASE_DIR = path.join(__dirname, 'public_sftp');

// Tipos permitidos
const tiposPermitidos = ['notificaciones', 'reporte', 'consolidado', 'procesados'];

// Crear carpetas si no existen
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
tiposPermitidos.forEach(tipo => {
  const dir = path.join(PDF_BASE_DIR, tipo);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

console.log('Modo:', isProduction ? 'PRODUCTION' : 'DEVELOPMENT');
console.log('Upload Excel en:', UPLOAD_DIR);
console.log('PDF Base en:', PDF_BASE_DIR);

// Configuración de Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

// -------------------- RUTAS --------------------

// Subida de Excel
app.post('/upload', upload.single('archivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se envió archivo' });
  console.log('Archivo recibido:', req.file.originalname);
  res.json({ message: 'Archivo subido correctamente', nombreArchivo: req.file.originalname });
});

// Listar carpetas de un tipo
app.get('/listar/:tipo', (req, res) => {
  const tipo = req.params.tipo;
  if (!tiposPermitidos.includes(tipo)) return res.status(400).json({ error: 'Tipo no permitido' });

  const tipoPath = path.join(PDF_BASE_DIR, tipo);
  fs.readdir(tipoPath, { withFileTypes: true }, (err, files) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error leyendo directorio' });
    }
    const carpetas = files.filter(f => f.isDirectory()).map(f => f.name);
    res.json({ carpetas });
  });
});

// Listar archivos dentro de una carpeta
app.get('/listar/:tipo/:carpeta', (req, res) => {
  const { tipo, carpeta } = req.params;
  if (!tiposPermitidos.includes(tipo)) return res.status(400).json({ error: 'Tipo no permitido' });

  const carpetaPath = path.join(PDF_BASE_DIR, tipo, carpeta);
  fs.readdir(carpetaPath, (err, files) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error leyendo directorio' });
    }
    res.json({ archivos: files });
  });
});

// Descargar archivo
app.get('/download/:tipo/:carpeta/:archivo', (req, res) => {
  const { tipo, carpeta, archivo } = req.params;
  if (!tiposPermitidos.includes(tipo)) return res.status(400).json({ error: 'Tipo no permitido' });

  const filePath = path.join(PDF_BASE_DIR, tipo, carpeta, archivo);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado' });

  res.download(filePath, archivo, err => {
    if (err) console.error('Error descargando archivo:', err);
  });
});

// Inicio servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor Node.js corriendo en http://localhost:${PORT}`);
});