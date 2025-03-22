// server.js
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const authRoutes = require('./routes/authRoutes');
const userProfile = require('./routes/userProfileRoute');
const workspaceRoutes = require('./routes/workspaceRoutes');
const invitationRoutes = require('./routes/invitationRoutes');
const pageRoutes = require('./routes/pageRoutes');
const pageContentRoutes = require('./routes/pageContentRoutes');
const blockRoutes = require('./routes/blockRoutes');
const commentRoutes = require('./routes/commentRoutes');
const templateRoutes = require('./routes/templatesRoute');
const attachmentRoutes = require('./routes/attachmentsRoute');
const searchRoutes = require('./routes/searchRoute');
const favoritesRoutes = require('./routes/favoritesRoute');

const app = express();
require('dotenv').config();

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/usersProfile', userProfile);
app.use('/api/templates', templateRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api', pageRoutes);
app.use('/api', pageContentRoutes);
app.use('/api', blockRoutes);
app.use('/api', commentRoutes);
app.use('/api/attachments', attachmentRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/favorites', favoritesRoutes);

// Xử lý WebSocket
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Khi client tham gia một trang cụ thể
  socket.on('joinPage', (pageId) => {
    socket.join(pageId);
    console.log(`User ${socket.id} joined page ${pageId}`);
  });

  // Lắng nghe sự kiện cập nhật block từ client
  socket.on('blockUpdate', (data) => {
    console.log(`Received block update for page ${data.pageId}, block ${data.blockId}:`, data);
    const payload = typeof data === 'string' ? { content: data } : data;
    if (!payload.pageId || !payload.blockId) {
      console.error('Invalid blockUpdate payload:', payload);
      return;
    }
    socket.to(payload.pageId).emit('blockUpdate', payload);
  });

  // Lắng nghe sự kiện thêm block mới
  socket.on('addBlock', ({ pageId, block }) => {
    console.log(`New block added to page ${pageId}:`, block);
    io.to(pageId).emit('blockAdded', block); // Gửi đến tất cả client trong page
  });

  // Lắng nghe sự kiện xóa block
  socket.on('deleteBlock', ({ pageId, blockId }) => {
    console.log(`Block ${blockId} deleted from page ${pageId}`);
    io.to(pageId).emit('blockDeleted', blockId); // Gửi đến tất cả client trong page
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// MongoDB connection và các phần khác giữ nguyên
const mongoose = require('mongoose');
const config = require('./config/mongodb');

async function testConnection() {
  try {
    await mongoose.connect(`${config.url}/${config.dbName}`);
    console.log('Successfully connected to MongoDB.');
    await mongoose.connection.close();
    console.log('Connection closed.');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
  }
}

testConnection();

app.get('/', (req, res) => {
  res.send('ideaHive API is running');
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

if (process.env.NODE_ENV === 'production') {
  const path = require('path');
  app.use(express.static(path.join(__dirname, '../client/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}