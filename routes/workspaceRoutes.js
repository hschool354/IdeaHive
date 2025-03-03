const express = require('express');
const router = express.Router();
const authenticated = require('../middlewares/auth');
const workspaceController = require('../controllers/workspaceController');
const { validateWorkspace } = require('../middlewares/validator');

// Existing workspace routes
router.get('/', authenticated, workspaceController.getWorkspaces);
router.post('/', authenticated, validateWorkspace, workspaceController.createWorkspace);
router.get('/:id', authenticated, workspaceController.getWorkspaceById);
router.put('/:id', authenticated, validateWorkspace, workspaceController.updateWorkspace);
router.delete('/:id', authenticated, workspaceController.deleteWorkspace);

// Workspace members routes
router.get('/:id/members', authenticated, workspaceController.getWorkspaceMembers);
router.post('/:id/members', authenticated, workspaceController.addWorkspaceMember);
router.put('/:id/members/:userId', authenticated, workspaceController.updateMemberRole);
router.delete('/:id/members/:userId', authenticated, workspaceController.removeMember);

module.exports = router;