const express = require('express');
const cors = require('cors');
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

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
// Template routes
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