import type { Prisma } from '@prisma/client'

type Tx = Prisma.TransactionClient

export const RETRYABLE_DISPOSITIONS = ['NO_ANSWER', 'VOICEMAIL'] as const

export const shouldRetryDisposition = (disposition: string) => {
  return RETRYABLE_DISPOSITIONS.includes(disposition as (typeof RETRYABLE_DISPOSITIONS)[number])
}

export const getNextRetryAt = (delayMinutes: number) => {
  return new Date(Date.now() + delayMinutes * 60 * 1000)
}

export const applyDispositionRetry = async (tx: Tx, args: {
  contactId: number
  disposition: string
  campaignMaxRetries?: number | null
  campaignRetryDelaySeconds?: number | null
}) => {
  const contact = await tx.contact.findUnique({
    where: { id: args.contactId },
    select: { id: true, retryCount: true, maxRetries: true, status: true },
  })

  if (!contact) return

  const maxRetries = args.campaignMaxRetries ?? contact.maxRetries ?? 3
  const currentRetryCount = contact.retryCount ?? 0

  if (!shouldRetryDisposition(args.disposition)) {
    await tx.contact.update({
      where: { id: contact.id },
      data: {
        nextRetryAt: null,
        lastDisposition: args.disposition,
      },
    })
    return
  }

  const nextRetryCount = currentRetryCount + 1
  if (nextRetryCount >= maxRetries) {
    await tx.contact.update({
      where: { id: contact.id },
      data: {
        retryCount: nextRetryCount,
        nextRetryAt: null,
        lastDisposition: args.disposition,
      },
    })
    return
  }

  const delayMinutes = Math.max(1, Math.round((args.campaignRetryDelaySeconds ?? 3600) / 60))
  await tx.contact.update({
    where: { id: contact.id },
    data: {
      retryCount: nextRetryCount,
      nextRetryAt: getNextRetryAt(delayMinutes),
      lastDisposition: args.disposition,
      status: 'PENDING',
    },
  })
}
