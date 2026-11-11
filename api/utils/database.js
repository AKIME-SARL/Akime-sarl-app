const mongoose = require('mongoose');

class DatabaseConnection {
  constructor() {
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxRetries = 3;
  }

  async connect(uri = process.env.MONGODB_URI, options = {}) {
    if (this.isConnected) {
      console.log('📡 Already connected to MongoDB');
      return;
    }

    if (typeof uri !== 'string' || uri.trim() === '') {
      throw new Error('MONGODB_URI is not configured. Set it in the process environment or .env file.');
    }

    const defaultOptions = {
      serverSelectionTimeoutMS: 10000, // 10 second timeout
      socketTimeoutMS: 45000, // 45 second socket timeout
      maxPoolSize: 10, // Maintain up to 10 socket connections
      ...options
    };

    while (this.connectionAttempts < this.maxRetries && !this.isConnected) {
      try {
        this.connectionAttempts++;
        console.log(`📡 Attempting to connect to MongoDB (attempt ${this.connectionAttempts}/${this.maxRetries})...`);

        await mongoose.connect(uri, defaultOptions);
        
        this.isConnected = true;
        console.log('✅ MongoDB connected successfully');
        console.log('📊 Database:', mongoose.connection.name || 'default');
        console.log('🌐 Host:', mongoose.connection.host);
        
        // Reset connection attempts on successful connection
        this.connectionAttempts = 0;
        
        // Set up connection event listeners
        this.setupEventListeners();
        
        return;
        
      } catch (error) {
        console.error(`❌ MongoDB connection attempt ${this.connectionAttempts} failed:`, error.message);
        
        if (error.name === 'MongoServerSelectionError') {
          console.error('🔧 Possible issues:');
          console.error('   - Check your internet connection');
          console.error('   - Verify MongoDB Atlas credentials');
          console.error('   - Ensure your IP is whitelisted in MongoDB Atlas');
          console.error('   - Check if the cluster is running');
        }
        
        if (error.name === 'MongooseError' && error.message.includes('bad auth')) {
          console.error('🔐 Authentication failed:');
          console.error('   - Check username and password in connection string');
          console.error('   - Verify database user permissions');
          console.error('   - Ensure the user has access to the specified database');
        }
        
        if (this.connectionAttempts >= this.maxRetries) {
          console.error(`❌ Failed to connect to MongoDB after ${this.maxRetries} attempts`);
          throw error;
        }
        
        // Wait before retrying
        const delay = this.connectionAttempts * 2000; // Exponential backoff
        console.log(`⏳ Waiting ${delay/1000} seconds before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  setupEventListeners() {
    mongoose.connection.on('connected', () => {
      console.log('🔗 Mongoose connected to MongoDB');
      this.isConnected = true;
    });

    mongoose.connection.on('error', (err) => {
      console.error('❌ Mongoose connection error:', err.message);
      this.isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.log('🔌 Mongoose disconnected from MongoDB');
      this.isConnected = false;
    });

    // Handle application termination
    process.on('SIGINT', async () => {
      await this.disconnect();
      process.exit(0);
    });
  }

  async disconnect() {
    if (this.isConnected) {
      try {
        await mongoose.disconnect();
        console.log('👋 MongoDB connection closed');
        this.isConnected = false;
      } catch (error) {
        console.error('❌ Error closing MongoDB connection:', error.message);
      }
    }
  }

  async testConnection() {
    try {
      if (!this.isConnected) {
        throw new Error('Not connected to database');
      }
      
      // Test the connection by running a simple command
      await mongoose.connection.db.admin().ping();
      console.log('🏓 Database ping successful');
      return true;
    } catch (error) {
      console.error('❌ Database ping failed:', error.message);
      return false;
    }
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      name: mongoose.connection.name,
      connectionAttempts: this.connectionAttempts
    };
  }
}

// Create singleton instance
const dbConnection = new DatabaseConnection();

module.exports = dbConnection;
