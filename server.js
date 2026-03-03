// server.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();

// --- CONFIGURACIÓN DE MIDDLEWARES ---
app.use(cors({
  origin: '*', // Permite peticiones desde cualquier origen (tu IP de AWS)
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Aumentamos el límite de JSON para procesar metadatos de archivos grandes
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- CONFIGURACIÓN DE RUTAS ABSOLUTAS (AWS PRODUCCIÓN) ---
// Forzamos la ruta hacia /var/www/ para que no dependa de la carpeta del proyecto
const BASE_SFTP = '/var/www/sb_ope_001a/public_sftp';
const UPLOAD_DIR = path.join(BASE_SFTP, 'carga_sftp', 'excel');
const PDF_BASE_DIR = BASE_SFTP;

const tiposPermitidos = ['notificaciones', 'reporte', 'consolidado', 'procesados'];

// --- CREACIÓN ESTRUCTURA DE DIRECTORIOS ---
const inicializarDirectorios = () => {
  try {
    // Crear carpeta de subida de Excel
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      console.log('✅ Carpeta de subida creada:', UPLOAD_DIR);
    }

    // Crear subcarpetas para cada tipo de documento
    tiposPermitidos.forEach(tipo => {
      const dir = path.join(PDF_BASE_DIR, tipo);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`✅ Carpeta tipo [${tipo}] lista.`);
      }
    });
  } catch (err) {
    console.error('❌ ERROR CRÍTICO creando directorios:', err.message);
    console.error('Asegúrate de ejecutar: sudo chown -R ec2-user:ec2-user /var/www/sb_ope_001a/');
  }
};

inicializarDirectorios();

// --- CONFIGURACIÓN DE MULTER (ALMACENAMIENTO) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Verificación de seguridad antes de escribir
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Limpiamos el nombre: quitamos espacios y añadimos timestamp para evitar duplicados
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const safeName = file.originalname.replace(/\s+/g, '_');
    cb(null, uniqueSuffix + '-' + safeName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 } // Límite de 50MB en Multer
});

// --- RUTAS DEL API ---

// 1. Subida de Archivo Excel
app.post('/upload', upload.single('archivo'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo.' });
    }
    console.log(`🚀 Archivo recibido: ${req.file.filename}`);
    res.json({
      message: 'Archivo subido con éxito',
      nombreOriginal: req.file.originalname,
      nombreServidor: req.file.filename,
      rutaAbsoluta: req.file.path
    });
  } catch (error) {
    console.error('Error en /upload:', error);
    res.status(500).json({ error: 'Error interno al procesar la subida.' });
  }
});

// 2. Listar carpetas dentro de un tipo (ej: /listar/notificaciones)
app.get('/listar/:tipo', (req, res) => {
  const { tipo } = req.params;
  if (!tiposPermitidos.includes(tipo)) {
    return res.status(400).json({ error: 'Tipo de documento no válido.' });
  }

  const tipoPath = path.join(PDF_BASE_DIR, tipo);
  
  if (!fs.existsSync(tipoPath)) return res.json({ carpetas: [] });

  fs.readdir(tipoPath, { withFileTypes: true }, (err, files) => {
    if (err) return res.status(500).json({ error: 'No se pudo leer el directorio.' });
    
    // Solo devolvemos los nombres de las carpetas
    const carpetas = files.filter(f => f.isDirectory()).map(f => f.name);
    res.json({ carpetas });
  });
});

// 3. Listar archivos dentro de una carpeta específica (ej: /listar/notificaciones/2024-05)
app.get('/listar/:tipo/:carpeta', (req, res) => {
  const { tipo, carpeta } = req.params;
  const carpetaPath = path.join(PDF_BASE_DIR, tipo, carpeta);

  if (!fs.existsSync(carpetaPath)) {
    return res.status(404).json({ error: 'La carpeta especificada no existe.' });
  }

  fs.readdir(carpetaPath, (err, files) => {
    if (err) return res.status(500).json({ error: 'Error al leer los archivos.' });
    
    // Filtramos para devolver solo archivos reales
    const listaArchivos = files.filter(f => {
      return fs.lstatSync(path.join(carpetaPath, f)).isFile();
    });
    res.json({ archivos: listaArchivos });
  });
});

// 4. Descargar o Ver Archivo
app.get('/download/:tipo/:carpeta/:archivo', (req, res) => {
  const { tipo, carpeta, archivo } = req.params;
  const filePath = path.join(PDF_BASE_DIR, tipo, carpeta, archivo);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'El archivo no existe en el almacenamiento.' });
  }

  res.download(filePath, archivo, (err) => {
    if (err) {
      if (!res.headersSent) {
        res.status(500).send('Error al descargar el archivo.');
      }
      console.error('Error en descarga:', err.message);
    }
  });
});

// --- INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('=========================================');
  console.log(`🚀 BACKEND CORRIENDO EN PUERTO: ${PORT}`);
  console.log(`📂 RUTA BASE SFTP: ${BASE_SFTP}`);
  console.log(`📁 CARGA EXCEL: ${UPLOAD_DIR}`);
  console.log('=========================================');
});