const express = require('express');
const router = express.Router();
const dashboardController = require('../../controllers/adminControllers/dashboardController');
const { protect } = require('../../middleware/adminAuth');
const productImageUpload = require('../../middleware/productImageUpload');

// Dashboard Routes
router.get('/dashboard', protect, dashboardController.getDashboardStats);
router.get('/dashboard/revenue', protect, dashboardController.getRevenueData);
router.get('/dashboard/quarterly', protect, dashboardController.getQuarterlyData);
router.get('/dashboard/daily', protect, dashboardController.getDailyData);

// Analytics Routes
router.get('/analytics/revenue-risk', protect, dashboardController.getRevenueRisk);
router.get('/analytics/projected-revenue', protect, dashboardController.getProjectedRevenue);
router.get('/analytics/revenue-concentration', protect, dashboardController.getRevenueConcentration);

// Business records and transactions routes
router.get('/business-records', protect, dashboardController.getBusinessRecords);
router.get('/transactions', protect, dashboardController.getAllTransactions);
router.get('/transactions/:id', protect, dashboardController.getTransactionById);
router.put('/transactions/:id', protect, dashboardController.updateTransaction);
router.delete('/transactions/:id', protect, dashboardController.deleteTransaction);

// Inventory Routes
router.get('/inventory', protect, dashboardController.getAllInventory);
router.get('/inventory/:id', protect, dashboardController.getInventoryItem);
router.post('/inventory', protect, productImageUpload, dashboardController.addInventoryItem);
router.put('/inventory/:id', protect, productImageUpload, dashboardController.updateInventoryItem);
router.delete('/inventory/:id', protect, dashboardController.deleteInventoryItem);

// Reports
router.get('/reports/sales', protect, dashboardController.getSalesReport);
router.get('/reports/inventory', protect, dashboardController.getInventoryReport);
router.get('/reports/mechanics', protect, dashboardController.getMechanicsReport);

module.exports = router;
