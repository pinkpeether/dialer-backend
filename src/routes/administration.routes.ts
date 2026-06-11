import { Router } from 'express'
import { authenticate, authorizePlatformAdmin, authorizeCustomerAdminOrPlatform } from '../middleware/auth'
import * as AdministrationController from '../controllers/administration.controller'

const router = Router()

router.use(authenticate)

// Current user's commercial/account administration context.
router.get('/me', AdministrationController.getMyAdministration)

// PTDT Platform Super Admin / legacy ADMIN only.
router.get('/platform/overview', authorizePlatformAdmin, AdministrationController.getPlatformOverview)
router.get('/platform/accounts/:accountId/members', authorizePlatformAdmin, AdministrationController.listAccountMembers)
router.post('/platform/accounts/:accountId/members', authorizePlatformAdmin, AdministrationController.addAccountMember)
router.patch('/platform/memberships/:membershipId', authorizePlatformAdmin, AdministrationController.updateAccountMember)
router.patch('/platform/memberships/:membershipId/suspend', authorizePlatformAdmin, AdministrationController.suspendAccountMember)
router.delete('/platform/memberships/:membershipId', authorizePlatformAdmin, AdministrationController.removeAccountMember)

// Customer Admin / Billing Admin can view/manage members only when service-level account membership permits it.
router.get('/accounts/:accountId/members', authorizeCustomerAdminOrPlatform, AdministrationController.listAccountMembers)
router.post('/accounts/:accountId/members', authorizeCustomerAdminOrPlatform, AdministrationController.addAccountMember)
router.patch('/memberships/:membershipId', authorizeCustomerAdminOrPlatform, AdministrationController.updateAccountMember)

export default router
