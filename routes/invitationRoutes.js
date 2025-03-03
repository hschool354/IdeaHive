const express = require('express');
const router = express.Router();
const authenticated = require('../middlewares/auth');
const invitationController  = require('../controllers/invitationController');

// User invitations routes
router.get('/', authenticated, invitationController .getUserInvitations);
router.put('/:id/accept', authenticated, invitationController .acceptInvitation);
router.put('/:id/decline', authenticated, invitationController .declineInvitation);
router.delete('/:id', authenticated, invitationController .cancelInvitation);

// Workspace invitations route
router.post('/:id/invitations', authenticated, invitationController.createInvitation);

module.exports = router;