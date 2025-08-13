# 🛠 Adventor - Tourism Management System (Backend)

This is the **backend** for the Tourism Management System, built with **Node.js, Express.js, and MongoDB**.  
It powers the API for user authentication, travel package management, guide applications, bookings, payments, and story sharing.

---

## 🚀 Features

### 🔐 Authentication & Authorization
- JWT-based authentication for secure login and role management.
- Role-based access control for **Tourist**, **Guide**, and **Admin**.

### 📦 Travel Package Management
- Create, read, update, and delete (CRUD) travel packages (Admin only).
- Fetch available packages for tourists.

### 🧭 Guide Management
- Apply to become a guide (Tourist role).
- Admin can approve or reject guide applications.
- List approved guides.

### 📅 Booking System
- Tourists can book packages and select a preferred guide.
- Admin can view all bookings.
- Stripe integration for payment processing.

### 📖 Stories
- Add, edit, and delete stories (Tourist & Guide).
- Fetch stories for all users.

### 💳 Payment Integration
- Stripe API for secure online payments.
- Payments automatically update Admin's total revenue.

---

## 🛠 Technologies Used
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB + Mongoose** - Database & ODM
- **JWT** - Authentication
- **Stripe** - Payment gateway
- **Cors & Helmet** - Security
- **Dotenv** - Environment configuration

---
