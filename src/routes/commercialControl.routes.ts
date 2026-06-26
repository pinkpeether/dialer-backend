import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import * as CommercialControlController from '../controllers/commercialControl.controller'

const router = Router()

router.use(authenticate)

// Customer/admin-readable commercial state.
router.get('/summary', authorize('ADMIN', 'SUPERVISOR'), CommercialControlController.getSummary)
router.get('/catalog', authorize('ADMIN', 'SUPERVISOR'), CommercialControlController.getCatalog)

// PTDT/Admin control actions.
router.post('/admin/seed-catalog', authorize('ADMIN'), CommercialControlController.seedCatalog)
router.get('/admin/accounts', authorize('ADMIN'), CommercialControlController.listAccounts)
router.post('/admin/accounts', authorize('ADMIN'), CommercialControlController.createAccount)
router.patch('/admin/accounts/:accountId/lifecycle', authorize('ADMIN'), CommercialControlController.updateAccountLifecycle)
router.get('/admin/payment-requests', authorize('ADMIN'), CommercialControlController.listPaymentRequests)
router.post('/admin/payment-requests', authorize('ADMIN'), CommercialControlController.createPaymentRequest)
router.patch('/admin/payment-requests/:id/status', authorize('ADMIN'), CommercialControlController.updatePaymentRequestStatus)
router.post('/admin/accounts/:accountId/activate-plan', authorize('ADMIN'), CommercialControlController.activatePlan)
router.post('/admin/accounts/:accountId/topup', authorize('ADMIN'), CommercialControlController.topUpWallet)
router.patch('/admin/accounts/:accountId/addons/:addonCode', authorize('ADMIN'), CommercialControlController.setAddonStatus)
router.patch('/admin/accounts/:accountId/thresholds', authorize('ADMIN'), CommercialControlController.updateThresholds)

export default router
