// server.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();

// Configuración de CORS para permitir peticiones desde tu IP de AWS o Localhost
app.use(cors({
  origin: '*', 
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Detectar si estamos en producción (AWS) o desarrollo (Mac)
const isProduction = process.env.NODE_ENV === 'production' || fs.existsSync('/var/www/sb_ope_001a');

// -------------------- CONFIGURACIÓN DE RUTAS DINÁMICAS --------------------
// En AWS usamos la ruta absoluta de /var/www/, en Mac usamos la carpeta local del proyecto
const BASE_SFTP = isProduction 
  ? '/var/www/sb_ope_001a/public_sftp' 
  : path.join(__dirname, 'public_sftp');

const UPLOAD_DIR = path.join(BASE_SFTP, 'carga_sftp', 'excel');
const PDF_BASE_DIR = BASE_SFTP;

// Tipos permitidos
const tiposPermitidos = ['notificaciones', 'reporte', 'consolidado', 'procesados'];

// -------------------- CREAR CARPETAS SI NO EXISTEN --------------------
try {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    console.log('Carpeta creada:', UPLOAD_DIR);
  }
  
  tiposPermitidos.forEach(tipo => {
    const dir = path.join(PDF_BASE_DIR, tipo);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Carpeta de tipo [${tipo}] creada en:`, dir);
    }
  });
} catch (err) {
  console.error('ERROR creando carpetas iniciales. Revisa permisos de sudo:', err.message);
}

console.log('--- CONFIGURACIÓN ACTUAL ---');
console.log('Modo:', isProduction ? 'PRODUCTION (AWS)' : 'DEVELOPMENT (MAC)');
console.log('Upload Excel en:', UPLOAD_DIR);
console.log('PDF Base en:', PDF_BASE_DIR);
console.log('----------------------------');

// -------------------- CONFIGURACIÓN DE MULTER --------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Verificación extra de seguridad antes de guardar
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Limpiamos el nombre de archivos para evitar problemas en Linux
    const safeName = file.originalname.replace(/\s+/g, '_');
    cb(null, Date.now() + '-' + safeName); 
  }
});
const upload = multer({ storage });

// -------------------- RUTAS --------------------

// Subida de Excel
app.post('/upload', upload.single('archivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se envió archivo' });
  console.log('Archivo recibido y guardado en:', req.file.path);
  res.json({ 
    message: 'Archivo subido correctamente', 
    nombreArchivo: req.file.filename,
    path: req.file.path 
  });
});

// Listar carpetas de un tipo (notificaciones, reporte, etc)
app.get('/listar/:tipo', (req, res) => {
  const tipo = req.params.tipo;
  if (!tiposPermitidos.includes(tipo)) return res.status(400).json({ error: 'Tipo no permitido' });

  const tipoPath = path.join(PDF_BASE_DIR, tipo);
  
  if (!fs.existsSync(tipoPath)) return res.json({ carpetas: [] });

  fs.readdir(tipoPath, { withFileTypes: true }, (err, files) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error leyendo directorio' });
    }
    // Filtramos solo los directorios (las carpetas por fecha/id)
    const carpetas = files.filter(f => f.isDirectory()).map(f => f.name);
    res.json({ carpetas });
  });
});

// Listar archivos dentro de una carpeta específica
app.get('/listar/:tipo/:carpeta', (req, res) => {
  const { tipo, carpeta } = req.params;
  if (!tiposPermitidos.includes(tipo)) return res.status(400).json({ error: 'Tipo no permitido' });

  const carpetaPath = path.join(PDF_BASE_DIR, tipo, carpeta);
  
  if (!fs.existsSync(carpetaPath)) return res.status(404).json({ error: 'Carpeta no encontrada' });

  fs.readdir(carpetaPath, (err, files) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error leyendo archivos' });
    }
    // Retornamos solo archivos (filtramos si hay carpetas ocultas)
    res.json({ archivos: files.filter(f => fs.lstatSync(path.join(carpetaPath, f)).isFile()) });
  });
});

// Descargar/Ver archivo PDF
app.get('/download/:tipo/:carpeta/:archivo', (req, res) => {
  const { tipo, carpeta, archivo } = req.params;
  const filePath = path.join(PDF_BASE_DIR, tipo, carpeta, archivo);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Archivo no encontrado físicamente' });
  }

  // Detectar si es PDF para que el navegador lo abra en lugar de descargarlo
  const isPdf = archivo.toLowerCase().endsWith('.pdf');
  
  res.download(filePath, archivo, err => {
    if (err && !res.headersSent) {
      console.error('Error en descarga:', err);
      res.status(500).send('Error al procesar el archivo');
    }
  });
});

// Inicio servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor Node.js activo en puerto ${PORT}`);
});