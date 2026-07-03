import type { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'

export type ScopeActor = { id: number; email?: string; role?: string } | undefined

const PLATFORM_ROLES = new Set(['SUPER_ADMIN', 'ADMIN'])

export const isPlatformActor = (actor?: ScopeActor) =>
  Boolean(actor?.role && PLATFORM_ROLES.has(String(actor.role).trim().toUpperCase()))

const emptyAccountIds = [-1]
const roleOf = (actor?: ScopeActor) => String(actor?.role || '').trim().toUpperCase()


export const getActorAccountIds = async (actor?: ScopeActor) => {
  if (!actor?.id) throw new AppError('Unauthorized', 401)

  const rows = await prisma.commercialAccountMembership.findMany({
    where: {
      userId: actor.id,
      status: 'ACTIVE',
      account: {
        status: { not: 'ARCHIVED' },
      },
    },
    select: { accountId: true },
    orderBy: { createdAt: 'asc' },
  })

  return rows.map(row => row.accountId)
}

export const primaryAccountIdForActor = async (actor?: ScopeActor) => {
  if (isPlatformActor(actor)) return null
  const accountIds = await getActorAccountIds(actor)
  if (!accountIds.length) {
    throw new AppError('No active commercial account assigned to this user.', 403)
  }
  return accountIds[0]
}

export const campaignScopeWhere = async (actor?: ScopeActor): Promise<Prisma.CampaignWhereInput> => {
  if (isPlatformActor(actor)) return {}
  const accountIds = await getActorAccountIds(actor)
  return { commercialAccountId: { in: accountIds.length ? accountIds : emptyAccountIds } }
}

export const contactScopeWhere = async (actor?: ScopeActor): Promise<Prisma.ContactWhereInput> => {
  if (isPlatformActor(actor)) return {}

  const accountIds = await getActorAccountIds(actor)
  const ids = accountIds.length ? accountIds : emptyAccountIds
  const accountScopedWhere: Prisma.ContactWhereInput = {
    campaign: { commercialAccountId: { in: ids } },
  }

  const role = roleOf(actor)

  if (role === 'CUSTOMER_ADMIN' || role === 'SUPERVISOR') return accountScopedWhere

  if (role === 'AGENT') {
    return {
      AND: [
        accountScopedWhere,
        {
          OR: [
            { calls: { some: { agentId: actor!.id } } },
            { callbacks: { some: { agentId: actor!.id } } },
          ],
        },
      ],
    }
  }

  return {
    AND: [
      accountScopedWhere,
      {
        OR: [
          { calls: { some: { agentId: actor!.id } } },
          { callbacks: { some: { agentId: actor!.id } } },
        ],
      },
    ],
  }
}



export const callScopeWhere = async (actor?: ScopeActor): Promise<Prisma.CallWhereInput> => {
  if (isPlatformActor(actor)) return {}

  const accountIds = await getActorAccountIds(actor)
  const ids = accountIds.length ? accountIds : emptyAccountIds
  const accountScopedWhere: Prisma.CallWhereInput = {
    campaign: { commercialAccountId: { in: ids } },
  }

  const role = roleOf(actor)

  if (role === 'CUSTOMER_ADMIN') return accountScopedWhere

  if (role === 'SUPERVISOR') {
    return {
      AND: [
        accountScopedWhere,
        {
          OR: [
            { agentId: actor!.id },
            { agent: { role: 'AGENT' } },
          ],
        },
      ],
    }
  }

  if (role === 'AGENT') {
    return {
      AND: [
        accountScopedWhere,
        { agentId: actor!.id },
      ],
    }
  }

  return {
    AND: [
      accountScopedWhere,
      { agentId: actor!.id },
    ],
  }
}



export const userScopeWhere = async (actor?: ScopeActor): Promise<Prisma.UserWhereInput> => {
  if (isPlatformActor(actor)) return {}

  const accountIds = await getActorAccountIds(actor)
  const ids = accountIds.length ? accountIds : emptyAccountIds
  const accountScopedWhere: Prisma.UserWhereInput = {
    commercialMemberships: {
      some: {
        accountId: { in: ids },
        status: 'ACTIVE',
      },
    },
  }

  const role = roleOf(actor)

  if (role === 'CUSTOMER_ADMIN') return accountScopedWhere

  if (role === 'SUPERVISOR') {
    return {
      AND: [
        accountScopedWhere,
        {
          OR: [
            { id: actor!.id },
            { role: 'AGENT' },
          ],
        },
      ],
    }
  }

  if (role === 'AGENT') return { id: actor!.id }

  return { id: actor!.id }
}



export const callbackScopeWhere = async (actor?: ScopeActor): Promise<Prisma.CallbackWhereInput> => {
  if (isPlatformActor(actor)) return {}

  const accountIds = await getActorAccountIds(actor)
  const ids = accountIds.length ? accountIds : emptyAccountIds
  const accountScopedWhere: Prisma.CallbackWhereInput = {
    OR: [
      { agent: { commercialMemberships: { some: { accountId: { in: ids }, status: 'ACTIVE' } } } },
      { call: { campaign: { commercialAccountId: { in: ids } } } },
      { contact: { campaign: { commercialAccountId: { in: ids } } } },
    ],
  }

  const role = roleOf(actor)

  if (role === 'CUSTOMER_ADMIN') return accountScopedWhere

  if (role === 'SUPERVISOR') {
    return {
      AND: [
        accountScopedWhere,
        {
          OR: [
            { agentId: actor!.id },
            { agent: { role: 'AGENT' } },
            { call: { agentId: actor!.id } },
            { call: { agent: { role: 'AGENT' } } },
          ],
        },
      ],
    }
  }

  if (role === 'AGENT') {
    return {
      AND: [
        accountScopedWhere,
        {
          OR: [
            { agentId: actor!.id },
            { call: { agentId: actor!.id } },
          ],
        },
      ],
    }
  }

  return {
    AND: [
      accountScopedWhere,
      { agentId: actor!.id },
    ],
  }
}


export const assertCampaignAccess = async (campaignId: number, actor?: ScopeActor) => {
  if (!Number.isFinite(campaignId)) throw new AppError('Invalid campaign id', 400)
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, ...(await campaignScopeWhere(actor)) },
    select: { id: true },
  })
  if (!campaign) throw new AppError('Campaign not found for this commercial account', 404)
}

export const assertContactAccess = async (contactId: number, actor?: ScopeActor) => {
  if (!Number.isFinite(contactId)) throw new AppError('Invalid contact id', 400)
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, ...(await contactScopeWhere(actor)) },
    select: { id: true },
  })
  if (!contact) throw new AppError('Contact not found for this commercial account', 404)
}

export const assertCallAccess = async (callId: number, actor?: ScopeActor) => {
  if (!Number.isFinite(callId)) throw new AppError('Invalid call id', 400)
  const call = await prisma.call.findFirst({
    where: { id: callId, ...(await callScopeWhere(actor)) },
    select: { id: true },
  })
  if (!call) throw new AppError('Call not found for this commercial account', 404)
}
