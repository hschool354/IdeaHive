const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const workspaceRoutes = require('./routes/workspaceRoutes');
const invitationRoutes = require('./routes/invitationRoutes');
//const pageRoutes = require('./routes/pageRoutes');

const app = express();
require('dotenv').config();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/invitations', invitationRoutes);
//app.use('/api/page', pageRoutes); 

// Basic route
app.get('/', (req, res) => {
  res.send('ideaHive API is running');
});

// Start server
const PORT = process.env.PORT || 5000; // Thay đổi từ 3000 sang 5000
app.listen(PORT, () => {
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