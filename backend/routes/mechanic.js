const express = require('express');
const router = express.Router();
const mechanicController = require('../controllers/mechanic');
const createLoginRateLimit = require('../middleware/loginRateLimit');
const { authenticate, adminOnly } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/authorize');
const {
  validateLogin,
  validateCreateMechanic,
  validateUpdateMechanic
} = require('../middleware/validate');

// Mechanic login (public)
router.post('/login', createLoginRateLimit(), validateLogin, mechanicController.login);

// Admin creates mechanic account
router.post('/create', adminOnly, validateCreateMechanic, mechanicController.createMechanic);

// Protected list for admin dashboard (frontend) to show persisted mechanics
router.get('/all', adminOnly, mechanicController.listAllMechanics);
router.get('/available', authorizeRoles('customer'), mechanicController.listAvailableMechanics);

// SPECIFIC ROUTES MUST COME BEFORE GENERIC /:id ROUTES
// Protected routes (mechanic only) - SPECIFIC /profile routes
router.get('/profile', authorizeRoles('mechanic'), mechanicController.getProfile);
router.put('/profile', authorizeRoles('mechanic'), validateUpdateMechanic, mechanicController.updateProfile);

// POST fallback delete endpoint for clients that can't send DELETE
router.post('/delete', adminOnly, async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ message: 'Mechanic id required' });
    req.params.id = id;
    return mechanicController.deleteMechanic(req, res);
  } catch (e) {
    console.error('[mechanics POST delete] error', e);
    res.status(500).json({ message: e.message });
  }
});

// Fallback delete route (explicit path) to avoid routing edge-cases
router.delete('/delete/:id', adminOnly, mechanicController.deleteMechanic);

// GENERIC ROUTES MUST COME LAST
// Admin deletes mechanic
router.delete('/:id', adminOnly, mechanicController.deleteMechanic);

// Admin updates mechanic
router.put('/:id', adminOnly, validateUpdateMechanic, mechanicController.updateMechanic);

module.exports = router;
