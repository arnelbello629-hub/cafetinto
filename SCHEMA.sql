-- MySQL Schema for Café Tinto POS
-- You can import this into phpMyAdmin

CREATE TABLE products (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    category VARCHAR(50) NOT NULL,
    stock INT NOT NULL,
    imageUrl VARCHAR(500),
    createdAt BIGINT
);

CREATE TABLE users (
    id VARCHAR(50) PRIMARY KEY,
    email VARCHAR(255),
    displayName VARCHAR(255),
    photoURL VARCHAR(500),
    loyaltyPoints INT DEFAULT 0,
    isAdmin TINYINT(1) DEFAULT 0,
    createdAt BIGINT,
    passwordHash VARCHAR(500)
);

CREATE TABLE orders (
    id VARCHAR(50) PRIMARY KEY,
    userId VARCHAR(50),
    totalAmount DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'completed',
    createdAt BIGINT,
    isActive TINYINT(1) NOT NULL DEFAULT 1,
    FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    orderId VARCHAR(50) NOT NULL,
    productId VARCHAR(50) NOT NULL,
    name VARCHAR(255),
    price DECIMAL(10,2),
    quantity INT,
    cancelled TINYINT(1) NOT NULL DEFAULT 0,
    FOREIGN KEY (orderId) REFERENCES orders(id),
    FOREIGN KEY (productId) REFERENCES products(id)
);

CREATE TABLE expenses (
    id VARCHAR(50) PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    category VARCHAR(50) NOT NULL,
    date BIGINT NOT NULL,
    createdAt BIGINT
);

CREATE TABLE categories (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    sortOrder INT DEFAULT 0,
    createdAt BIGINT,
    UNIQUE KEY uq_categories_name (name)
);
