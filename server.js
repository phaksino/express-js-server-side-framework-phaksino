const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory data store (in production, use a real database)
let products = [
  {
    id: 1,
    name: "Wireless Bluetooth Headphones",
    description: "High-quality wireless headphones with noise cancellation",
    price: 99.99,
    category: "Electronics",
    inStock: true,
    stockQuantity: 50,
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15')
  },
  {
    id: 2,
    name: "Smartphone Case",
    description: "Durable protective case for smartphones",
    price: 19.99,
    category: "Accessories",
    inStock: true,
    stockQuantity: 100,
    createdAt: new Date('2024-01-10'),
    updatedAt: new Date('2024-01-10')
  },
  {
    id: 3,
    name: "Laptop Backpack",
    description: "Water-resistant backpack with laptop compartment",
    price: 49.99,
    category: "Accessories",
    inStock: false,
    stockQuantity: 0,
    createdAt: new Date('2024-01-05'),
    updatedAt: new Date('2024-01-12')
  },
  {
    id: 4,
    name: "Mechanical Keyboard",
    description: "RGB mechanical keyboard with blue switches",
    price: 79.99,
    category: "Electronics",
    inStock: true,
    stockQuantity: 25,
    createdAt: new Date('2024-01-20'),
    updatedAt: new Date('2024-01-20')
  },
  {
    id: 5,
    name: "Wireless Mouse",
    description: "Ergonomic wireless mouse with long battery life",
    price: 29.99,
    category: "Electronics",
    inStock: true,
    stockQuantity: 75,
    createdAt: new Date('2024-01-18'),
    updatedAt: new Date('2024-01-18')
  }
];

let nextId = 6;

// =======================
// MIDDLEWARE
// =======================

// Security middleware
app.use(helmet());

// CORS middleware
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  }
});
app.use(limiter);

// Logging middleware
app.use(morgan('combined'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));

// =======================
// CUSTOM MIDDLEWARE
// =======================

// Request logging middleware
const requestLogger = (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
};
app.use(requestLogger);

// API Key authentication middleware
const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({
      error: 'API key is required',
      message: 'Please provide an API key in the x-api-key header'
    });
  }

  if (apiKey !== process.env.API_KEY) {
    return res.status(403).json({
      error: 'Invalid API key',
      message: 'The provided API key is not valid'
    });
  }

  next();
};

// Admin authorization middleware (for DELETE and PUT operations)
const authorizeAdmin = (req, res, next) => {
  const userRole = req.headers['x-user-role'] || 'user';
  
  if (userRole !== 'admin') {
    return res.status(403).json({
      error: 'Access denied',
      message: 'Admin privileges required for this operation'
    });
  }

  next();
};

// Product validation middleware
const validateProduct = (req, res, next) => {
  const { name, price, category } = req.body;
  const errors = [];

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('Product name is required and must be a non-empty string');
  }

  if (!price || typeof price !== 'number' || price <= 0) {
    errors.push('Product price is required and must be a positive number');
  }

  if (!category || typeof category !== 'string' || category.trim().length === 0) {
    errors.push('Product category is required and must be a non-empty string');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      messages: errors
    });
  }

  next();
};

// =======================
// ROUTES
// =======================

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// GET /api/products - Get all products with filtering, pagination, and search
app.get('/api/products', authenticateApiKey, (req, res) => {
  try {
    let filteredProducts = [...products];

    // Search functionality
    const { search } = req.query;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredProducts = filteredProducts.filter(product =>
        product.name.toLowerCase().includes(searchLower) ||
        product.description.toLowerCase().includes(searchLower) ||
        product.category.toLowerCase().includes(searchLower)
      );
    }

    // Filter by category
    const { category } = req.query;
    if (category) {
      filteredProducts = filteredProducts.filter(product =>
        product.category.toLowerCase() === category.toLowerCase()
      );
    }

    // Filter by inStock
    const { inStock } = req.query;
    if (inStock !== undefined) {
      const inStockBool = inStock === 'true';
      filteredProducts = filteredProducts.filter(product => product.inStock === inStockBool);
    }

    // Filter by price range
    const { minPrice, maxPrice } = req.query;
    if (minPrice) {
      filteredProducts = filteredProducts.filter(product => product.price >= parseFloat(minPrice));
    }
    if (maxPrice) {
      filteredProducts = filteredProducts.filter(product => product.price <= parseFloat(maxPrice));
    }

    // Sorting
    const { sortBy, sortOrder = 'asc' } = req.query;
    if (sortBy) {
      filteredProducts.sort((a, b) => {
        let aValue = a[sortBy];
        let bValue = b[sortBy];

        if (typeof aValue === 'string') {
          aValue = aValue.toLowerCase();
          bValue = bValue.toLowerCase();
        }

        if (sortOrder === 'desc') {
          return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
        }
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      });
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

    // Response with metadata
    res.json({
      success: true,
      data: paginatedProducts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(filteredProducts.length / limit),
        totalProducts: filteredProducts.length,
        hasNext: endIndex < filteredProducts.length,
        hasPrev: startIndex > 0
      },
      filters: {
        search: search || null,
        category: category || null,
        inStock: inStock || null,
        minPrice: minPrice || null,
        maxPrice: maxPrice || null,
        sortBy: sortBy || null,
        sortOrder: sortOrder || null
      }
    });

  } catch (error) {
    next(error);
  }
});

// GET /api/products/:id - Get a specific product
app.get('/api/products/:id', authenticateApiKey, (req, res, next) => {
  try {
    const productId = parseInt(req.params.id);
    const product = products.find(p => p.id === productId);

    if (!product) {
      return res.status(404).json({
        error: 'Product not found',
        message: `Product with ID ${productId} does not exist`
      });
    }

    res.json({
      success: true,
      data: product
    });

  } catch (error) {
    next(error);
  }
});

// POST /api/products - Create a new product
app.post('/api/products', authenticateApiKey, authorizeAdmin, validateProduct, (req, res, next) => {
  try {
    const { name, description, price, category, inStock = true, stockQuantity = 0 } = req.body;

    const newProduct = {
      id: nextId++,
      name: name.trim(),
      description: description ? description.trim() : '',
      price: parseFloat(price),
      category: category.trim(),
      inStock: Boolean(inStock),
      stockQuantity: parseInt(stockQuantity),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    products.push(newProduct);

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: newProduct
    });

  } catch (error) {
    next(error);
  }
});

// PUT /api/products/:id - Update a product
app.put('/api/products/:id', authenticateApiKey, authorizeAdmin, validateProduct, (req, res, next) => {
  try {
    const productId = parseInt(req.params.id);
    const productIndex = products.findIndex(p => p.id === productId);

    if (productIndex === -1) {
      return res.status(404).json({
        error: 'Product not found',
        message: `Product with ID ${productId} does not exist`
      });
    }

    const { name, description, price, category, inStock, stockQuantity } = req.body;

    products[productIndex] = {
      ...products[productIndex],
      name: name.trim(),
      description: description ? description.trim() : products[productIndex].description,
      price: parseFloat(price),
      category: category.trim(),
      inStock: inStock !== undefined ? Boolean(inStock) : products[productIndex].inStock,
      stockQuantity: stockQuantity !== undefined ? parseInt(stockQuantity) : products[productIndex].stockQuantity,
      updatedAt: new Date()
    };

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: products[productIndex]
    });

  } catch (error) {
    next(error);
  }
});

// DELETE /api/products/:id - Delete a product
app.delete('/api/products/:id', authenticateApiKey, authorizeAdmin, (req, res, next) => {
  try {
    const productId = parseInt(req.params.id);
    const productIndex = products.findIndex(p => p.id === productId);

    if (productIndex === -1) {
      return res.status(404).json({
        error: 'Product not found',
        message: `Product with ID ${productId} does not exist`
      });
    }

    const deletedProduct = products.splice(productIndex, 1)[0];

    res.json({
      success: true,
      message: 'Product deleted successfully',
      data: deletedProduct
    });

  } catch (error) {
    next(error);
  }
});

// =======================
// ERROR HANDLING MIDDLEWARE
// =======================

// 404 handler for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `The route ${req.method} ${req.originalUrl} does not exist`,
    availableEndpoints: [
      'GET /api/products',
      'GET /api/products/:id',
      'POST /api/products',
      'PUT /api/products/:id',
      'DELETE /api/products/:id',
      'GET /health'
    ]
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Error:', error);

  // Mongoose validation error (if using MongoDB)
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: error.message,
      details: error.errors
    });
  }

  // MongoDB duplicate key error
  if (error.code === 11000) {
    return res.status(400).json({
      error: 'Duplicate Entry',
      message: 'A product with this information already exists'
    });
  }

  // Default error
  res.status(error.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong!' : error.message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// =======================
// SERVER STARTUP
// =======================

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📚 API Base URL: http://localhost:${PORT}/api`);
  console.log(`🔑 API Key required for all endpoints (use x-api-key header)`);
});

module.exports = app;
