const express = require('express');
const multer = require('multer');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs').promises; // Utiliser les API promises pour une gestion asynchrone
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = process.env.PORT || 8080; // Utiliser la variable d'environnement PORT pour Render

// Dossier pour stocker les images
const uploadsDir = path.join(__dirname, 'Uploads');

// Créer le dossier Uploads de manière asynchrone
async function ensureUploadsDir() {
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
    console.log('Dossier Uploads créé ou déjà existant');
  } catch (err) {
    console.error('Erreur lors de la création du dossier Uploads :', err);
  }
}

// Appeler la fonction pour s'assurer que le dossier existe
ensureUploadsDir();

// Configuration de multer pour l'upload des images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, `capture_${Date.now()}.jpg`);
  }
});
const upload = multer({ storage: storage });

// Fichier pour stocker les configurations
const configFilePath = path.join(__dirname, 'config.json');

// Configuration par défaut
let config = {
  ssid: 'DEFAULT_SSID',
  password: 'DEFAULT_PASS',
  phoneNumber: '+261000000000',
  startHour: 18,
  endHour: 6
};

// Charger la configuration depuis le fichier
async function loadConfig() {
  try {
    const data = await fs.readFile(configFilePath, 'utf8');
    config = JSON.parse(data);
    console.log('Configuration chargée :', config);
  } catch (err) {
    console.error('Erreur lors du chargement de la configuration, utilisation des valeurs par défaut :', err);
    await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
    console.log('Configuration par défaut enregistrée :', config);
  }
}
loadConfig();

// Middleware pour parser les requêtes JSON
app.use(express.json());

// Servir les images statiquement
app.use('/Uploads', express.static(uploadsDir));

// Route de test
app.get('/', (req, res) => {
  res.send('✅ Serveur Node.js pour ESP32-CAM est opérationnel !');
});

// Endpoint pour l'upload des images depuis l'ESP32-CAM
app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('Aucune image reçue');
  }
  const filePath = `/Uploads/${req.file.filename}`;
  console.log('📸 Image reçue et enregistrée :', filePath);
  
  // Notifier les clients Android connectés via Socket.IO
  io.emit('new_image', { url: filePath, timestamp: Date.now() });
  
  res.status(200).send('Image reçue et stockée avec succès');
});

// Endpoint pour recevoir les configurations depuis l'application Android
app.post('/set-config', async (req, res) => {
  const { ssid, password, phoneNumber, startHour, endHour } = req.body;

  // Valider les champs fournis
  if (ssid !== undefined && typeof ssid !== 'string') {
    return res.status(400).send('SSID doit être une chaîne de caractères');
  }
  if (password !== undefined && typeof password !== 'string') {
    return res.status(400).send('Mot de passe doit être une chaîne de caractères');
  }
  if (phoneNumber !== undefined) {
    if (typeof phoneNumber !== 'string' || !/^\+\d{9,15}$/.test(phoneNumber)) {
      return res.status(400).send('Numéro de téléphone invalide (ex: +261123456789)');
    }
  }
  if (startHour !== undefined) {
    if (typeof startHour !== 'number' || startHour < 0 || startHour > 23) {
      return res.status(400).send('Heure de début invalide (0-23)');
    }
  }
  if (endHour !== undefined) {
    if (typeof endHour !== 'number' || endHour < 0 || endHour > 23) {
      return res.status(400).send('Heure de fin invalide (0-23)');
    }
  }

  // Mettre à jour uniquement les champs fournis
  if (ssid !== undefined) config.ssid = ssid;
  if (password !== undefined) config.password = password;
  if (phoneNumber !== undefined) config.phoneNumber = phoneNumber;
  if (startHour !== undefined) config.startHour = parseInt(startHour);
  if (endHour !== undefined) config.endHour = parseInt(endHour);

  // Enregistrer dans le fichier
  try {
    await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
    console.log('Configuration mise à jour :', config);
    res.status(200).send('Configuration mise à jour avec succès');
  } catch (err) {
    console.error('Erreur lors de l\'enregistrement de la configuration :', err);
    res.status(500).send('Erreur serveur lors de l\'enregistrement');
  }
});

// Endpoint pour envoyer la configuration à l'ESP32-CAM
app.get('/get-config', (req, res) => {
  res.json(config);
});

// Gestion des connexions Socket.IO
io.on('connection', (socket) => {
  console.log('📱 Client Android connecté');
  socket.on('disconnect', () => {
    console.log('❌ Client Android déconnecté');
  });
});

// Lancer le serveur
server.listen(port, () => {
  console.log(`🚀 Serveur en écoute sur http://0.0.0.0:${port}`);
});
