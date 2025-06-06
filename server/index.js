const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');
const multer = require('multer');

const app = express();
const server = http.createServer(app);

// Servir archivos estáticos (uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(cors());

const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Configuración multer para subir archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// Ruta para subir archivos
app.post('/upload', upload.single('file'), (req, res) => {
  res.json({ url: `/uploads/${req.file.filename}` });
});

// Mapa para usuarios conectados
const users = new Map();

io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);

  socket.on('set_username', (username) => {
    users.set(socket.id, { 
      id: socket.id, 
      name: username || `Usuario-${socket.id.slice(0, 5)}`,
      status: 'online'
    });

    io.emit('users_updated', Array.from(users.values()));
    socket.emit('user_info', users.get(socket.id));
  });

  socket.on('send_message', ({ message, to, type = 'text' }) => {
    const sender = users.get(socket.id);
    if (!sender) return;

    const messageData = {
      from: sender.id,
      fromName: sender.name,
      message,
      to,
      type,
      timestamp: new Date().toLocaleTimeString()
    };

    if (to === 'all') {
      io.emit('new_message', messageData);
    } else {
      // Mensaje privado (emitir a destinatario y remitente)
      socket.to(to).emit('new_message', { ...messageData, private: true });
      socket.emit('new_message', { ...messageData, private: true });

      // Notificación para destinatario si está conectado
      if (users.has(to)) {
        socket.to(to).emit('notification', {
          from: sender.name,
          message: 'Te ha enviado un mensaje privado'
        });
      }
    }
  });

  socket.on('typing', (to) => {
    const sender = users.get(socket.id);
    if (sender && to !== 'all') {
      socket.to(to).emit('user_typing', sender.id);
    }
  });

  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      user.status = 'offline';
      io.emit('users_updated', Array.from(users.values()));
      console.log('Usuario desconectado:', user.name);
      users.delete(socket.id);
    }
  });
});

server.listen(3001, '192.168.100.45', () => {
  console.log('Servidor corriendo en http://192.168.100.45:3001');
});
