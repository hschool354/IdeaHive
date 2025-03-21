const express = require('express');
const cors = require('cors');
const http = require('http'); // Thêm http để tạo server
const { Server } = require('socket.io'); // Thêm socket.io
const authRoutes = require('./routes/authRoutes');
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

// Tạo HTTP server từ Express app
const server = http.createServer(app);

// Khởi tạo socket.io
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000", // URL của React app
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
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
    socket.join(pageId); // Tham gia room dựa trên pageId
    console.log(`User ${socket.id} joined page ${pageId}`);
  });

  // Lắng nghe sự kiện thay đổi blocks từ client
  socket.on('blockUpdate', ({ pageId, blocks }) => {
    console.log(`Received block update for page ${pageId}:`, blocks);
    // Gửi thay đổi đến tất cả client trong cùng pageId (room)
    io.to(pageId).emit('blockUpdate', blocks);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

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

// Basic route
app.get('/', (req, res) => {
  res.send('ideaHive API is running');
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => { // Dùng server.listen thay vì app.listen
  console.log(`Server running on port ${PORT}`);
});

if (process.env.NODE_ENV === 'production') {
  const path = require('path');
  // Serve static files
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  // Handle React routing, return all requests to React app
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}