import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import { CallDisposition, ContactStatus, UserRole } from '@prisma/client'

export type LiveAiSentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'CRITICAL'
export type AnswerDetection = 'UNKNOWN' | 'HUMAN' | 'VOICEMAIL' | 'NOISE_OR_SILENCE'

type LiveTranscriptChunkInput = {
  speaker?: string
  text: string
  confidence?: number
  source?: string
}

type LiveAiSession = {
  callId: number
  campaignId?: number | null
  contactId?: number | null
  agentId?: number | null
  startedByUserId?: number | null
  startedAt: string
  updatedAt: string
  stoppedAt?: string | null
  status: 'LIVE' | 'STOPPED'
  answerDetection: AnswerDetection
  sentiment: LiveAiSentiment
  sentimentScore: number
  transcriptText: string
  chunks: Array<{
    id: string
    speaker: string
    text: string
    confidence?: number
    source?: string
    sentiment: LiveAiSentiment
    sentimentScore: number
    createdAt: string
  }>
  alerts: Array<{
    id: string
    type: string
    severity: 'INFO' | 'WARNING' | 'CRITICAL'
    message: string
    createdAt: string
  }>
  scriptPrompt?: string | null
  recommendedResponse?: string | null
  autoDisposition?: CallDisposition | null
  followUpSuggestion?: {
    shouldSchedule: boolean
    suggestedMinutesFromNow: number
    reason: string
  } | null
}

const sessions = new Map<number, LiveAiSession>()

const nowIso = () => new Date().toISOString()
const makeId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

const normalizeText = (value: unknown) => String(value || '').trim()

const hasAny = (text: string, words: string[]) => words.some(word => text.includes(word))

const scoreSentiment = (text: string) => {
  const lower = text.toLowerCase()
  const positiveHits = [
    'yes', 'interested', 'good', 'great', 'perfect', 'okay', 'ok', 'thanks', 'thank you',
    'confirm', 'book', 'schedule', 'agree', 'helpful', 'sounds good', 'send me', 'call me',
  ].filter(word => lower.includes(word)).length

  const negativeHits = [
    'angry', 'upset', 'bad', 'worst', 'stop', 'do not call', "don't call", 'remove me',
    'not interested', 'complaint', 'fraud', 'scam', 'busy now', 'wrong number', 'cancel',
  ].filter(word => lower.includes(word)).length

  const criticalHits = [
    'legal', 'lawyer', 'police', 'harassment', 'complain', 'complaint', 'never call',
    'remove my number', 'do not call', "don't call again", 'angry', 'furious',
  ].filter(word => lower.includes(word)).length

  const rawScore = positiveHits * 25 - negativeHits * 30 - criticalHits * 45
  const bounded = Math.max(-100, Math.min(100, rawScore))

  let sentiment: LiveAiSentiment = 'NEUTRAL'
  if (criticalHits > 0 || bounded <= -60) sentiment = 'CRITICAL'
  else if (bounded <= -20) sentiment = 'NEGATIVE'
  else if (bounded >= 25) sentiment = 'POSITIVE'

  return { sentiment, score: bounded }
}

const detectAnswer = (text: string): AnswerDetection => {
  const lower = text.toLowerCase()
  if (!lower || lower.length < 5) return 'NOISE_OR_SILENCE'
  if (hasAny(lower, ['leave a message', 'after the tone', 'mailbox', 'voicemail', 'not available', 'beep'])) {
    return 'VOICEMAIL'
  }
  if (hasAny(lower, ['hello', 'yes', 'speaking', 'who is this', 'how can i help', 'salam', 'assalam'])) {
    return 'HUMAN'
  }
  return 'UNKNOWN'
}

const inferDisposition = (text: string, answerDetection: AnswerDetection): CallDisposition | null => {
  const lower = text.toLowerCase()
  if (answerDetection === 'VOICEMAIL') return CallDisposition.VOICEMAIL
  if (hasAny(lower, ['do not call', "don't call", 'remove me', 'never call', 'stop calling'])) {
    return CallDisposition.DO_NOT_CALL
  }
  if (hasAny(lower, ['wrong number', 'not my number'])) return CallDisposition.WRONG_NUMBER
  if (hasAny(lower, ['call back', 'callback', 'later', 'tomorrow', 'next week', 'busy now'])) {
    return CallDisposition.CALLBACK
  }
  if (answerDetection === 'HUMAN') return CallDisposition.ANSWERED
  return null
}

const buildRecommendedResponse = (text: string, sentiment: LiveAiSentiment) => {
  const lower = text.toLowerCase()

  if (hasAny(lower, ['do not call', "don't call", 'remove me', 'never call'])) {
    return 'Acknowledge politely, confirm removal from calling list, and mark the contact as Do Not Call.'
  }
  if (hasAny(lower, ['call back', 'later', 'busy now', 'tomorrow'])) {
    return 'Acknowledge timing, ask for the best callback time, and schedule a callback before ending the call.'
  }
  if (hasAny(lower, ['price', 'cost', 'rate', 'package'])) {
    return 'Explain package clearly, keep the answer short, and ask one closing question about their preferred plan.'
  }
  if (sentiment === 'CRITICAL' || sentiment === 'NEGATIVE') {
    return 'Slow down, apologize for the inconvenience, lower your tone, and offer to help or end the call respectfully.'
  }
  if (sentiment === 'POSITIVE') {
    return 'Move toward confirmation: summarize the benefit, verify details, and ask for the next action.'
  }
  return 'Ask one clear discovery question and keep the customer engaged without over-talking.'
}

const buildFollowUpSuggestion = (text: string) => {
  const lower = text.toLowerCase()
  if (hasAny(lower, ['tomorrow'])) {
    return { shouldSchedule: true, suggestedMinutesFromNow: 24 * 60, reason: 'Customer mentioned tomorrow.' }
  }
  if (hasAny(lower, ['next week'])) {
    return { shouldSchedule: true, suggestedMinutesFromNow: 7 * 24 * 60, reason: 'Customer mentioned next week.' }
  }
  if (hasAny(lower, ['later', 'busy now', 'call back', 'callback'])) {
    return { shouldSchedule: true, suggestedMinutesFromNow: 120, reason: 'Customer asked for a later callback.' }
  }
  return { shouldSchedule: false, suggestedMinutesFromNow: 0, reason: 'No callback intent detected.' }
}

const createSupervisorAlert = async (session: LiveAiSession, message: string, severity: 'WARNING' | 'CRITICAL') => {
  const supervisors = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: [UserRole.ADMIN, UserRole.SUPERVISOR] },
    },
    select: { id: true },
  })

  if (supervisors.length === 0) return

  await prisma.notification.createMany({
    data: supervisors.map(user => ({
      userId: user.id,
      type: 'LIVE_AI_SENTIMENT_ALERT',
      title: severity === 'CRITICAL' ? 'Critical live call sentiment' : 'Negative live call sentiment',
      body: message,
      metadata: {
        callId: session.callId,
        campaignId: session.campaignId,
        contactId: session.contactId,
        sentiment: session.sentiment,
        sentimentScore: session.sentimentScore,
      },
    })),
  })
}

export const startLiveAiSession = async (callId: number, startedByUserId?: number | null) => {
  if (!Number.isFinite(callId)) throw new AppError('Invalid call id', 400)

  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: {
      campaign: true,
      contact: true,
      agent: { select: { id: true, name: true, role: true, agentCode: true } },
    },
  })

  if (!call) throw new AppError('Call not found', 404)

  const existing = sessions.get(callId)
  if (existing && existing.status === 'LIVE') return existing

  const session: LiveAiSession = {
    callId,
    campaignId: call.campaignId,
    contactId: call.contactId,
    agentId: call.agentId,
    startedByUserId: startedByUserId || null,
    startedAt: nowIso(),
    updatedAt: nowIso(),
    stoppedAt: null,
    status: 'LIVE',
    answerDetection: 'UNKNOWN',
    sentiment: 'NEUTRAL',
    sentimentScore: 0,
    transcriptText: '',
    chunks: [],
    alerts: [],
    scriptPrompt: call.campaign?.script || null,
    recommendedResponse: 'Start with a clear greeting, verify the customer, and follow the campaign script.',
    autoDisposition: null,
    followUpSuggestion: null,
  }

  sessions.set(callId, session)
  return session
}

export const getLiveAiSession = async (callId: number) => {
  if (!Number.isFinite(callId)) throw new AppError('Invalid call id', 400)
  const session = sessions.get(callId)
  if (!session) throw new AppError('Live AI session not found', 404)
  return session
}

export const listLiveAiSessions = async () => {
  return Array.from(sessions.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export const ingestLiveTranscriptChunk = async (
  callId: number,
  input: LiveTranscriptChunkInput,
  actorId?: number | null,
) => {
  const text = normalizeText(input.text)
  if (!text) throw new AppError('Transcript chunk text is required', 400)

  let session = sessions.get(callId)
  if (!session) session = await startLiveAiSession(callId, actorId)

  if (session.status !== 'LIVE') throw new AppError('Live AI session is stopped', 400)

  const chunkSentiment = scoreSentiment(text)
  const aggregateText = `${session.transcriptText}\n${text}`.trim()
  const aggregateSentiment = scoreSentiment(aggregateText)
  const answerDetection = session.answerDetection === 'UNKNOWN' || session.answerDetection === 'NOISE_OR_SILENCE'
    ? detectAnswer(aggregateText)
    : session.answerDetection

  const autoDisposition = inferDisposition(aggregateText, answerDetection)
  const followUpSuggestion = buildFollowUpSuggestion(aggregateText)
  const recommendedResponse = buildRecommendedResponse(text, aggregateSentiment.sentiment)

  const chunk = {
    id: makeId('chunk'),
    speaker: normalizeText(input.speaker) || 'customer',
    text,
    confidence: typeof input.confidence === 'number' ? input.confidence : undefined,
    source: normalizeText(input.source) || 'manual-live-feed',
    sentiment: chunkSentiment.sentiment,
    sentimentScore: chunkSentiment.score,
    createdAt: nowIso(),
  }

  session.chunks.push(chunk)
  session.transcriptText = aggregateText
  session.sentiment = aggregateSentiment.sentiment
  session.sentimentScore = aggregateSentiment.score
  session.answerDetection = answerDetection
  session.autoDisposition = autoDisposition
  session.followUpSuggestion = followUpSuggestion
  session.recommendedResponse = recommendedResponse
  session.updatedAt = nowIso()

  if (session.sentiment === 'NEGATIVE' || session.sentiment === 'CRITICAL') {
    const severity = session.sentiment === 'CRITICAL' ? 'CRITICAL' : 'WARNING'
    const alert = {
      id: makeId('alert'),
      type: 'SENTIMENT_ALERT',
      severity,
      message: `Live AI detected ${session.sentiment.toLowerCase()} sentiment on Call #${session.callId}.`,
      createdAt: nowIso(),
    } as const
    session.alerts.push(alert)
    await createSupervisorAlert(session, alert.message, severity)
  }

  sessions.set(callId, session)
  return session
}

export const getSmartScriptPrompt = async (callId: number) => {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { campaign: true, contact: true },
  })
  if (!call) throw new AppError('Call not found', 404)

  const session = sessions.get(callId)
  const contactName = call.contact?.name || 'the customer'
  const baseScript = call.campaign?.script || 'No campaign script configured. Use a friendly discovery call flow.'
  const liveHint = session?.recommendedResponse || 'Ask one clear question and follow the campaign objective.'

  return {
    callId,
    campaignId: call.campaignId,
    contactId: call.contactId,
    contactName,
    campaignName: call.campaign?.name || null,
    baseScript,
    liveHint,
    objectionHandling: [
      'If the customer is busy, ask for a callback time.',
      'If the customer is angry, apologize and offer to end the call politely.',
      'If the customer asks pricing, answer briefly and move to one qualifying question.',
    ],
  }
}

export const applyAutoDisposition = async (callId: number, actorId?: number | null) => {
  const session = sessions.get(callId)
  if (!session) throw new AppError('Live AI session not found', 404)
  if (!session.autoDisposition) throw new AppError('No auto disposition suggestion available', 400)

  const disposition = session.autoDisposition
  const contactStatusByDisposition: Partial<Record<CallDisposition, ContactStatus>> = {
    [CallDisposition.ANSWERED]: ContactStatus.ANSWERED,
    [CallDisposition.NO_ANSWER]: ContactStatus.NO_ANSWER,
    [CallDisposition.VOICEMAIL]: ContactStatus.VOICEMAIL,
    [CallDisposition.CALLBACK]: ContactStatus.CALLBACK,
    [CallDisposition.WRONG_NUMBER]: ContactStatus.WRONG_NUMBER,
    [CallDisposition.DO_NOT_CALL]: ContactStatus.DNC,
  }

  await prisma.call.update({
    where: { id: callId },
    data: {
      disposition,
      notes: `Live AI auto-disposition suggested/applied by user ${actorId || 'system'}: ${disposition}`,
    },
  })

  if (session.contactId && contactStatusByDisposition[disposition]) {
    await prisma.contact.update({
      where: { id: session.contactId },
      data: {
        status: contactStatusByDisposition[disposition],
        lastDisposition: disposition,
      },
    })
  }

  return { callId, disposition, contactStatus: contactStatusByDisposition[disposition] || null }
}

export const createLiveAiFollowUp = async (callId: number, agentId: number, minutesFromNow?: number, notes?: string) => {
  const session = sessions.get(callId)
  if (!session) throw new AppError('Live AI session not found', 404)
  if (!session.contactId) throw new AppError('Call has no contact attached', 400)

  const minutes = Math.max(5, Math.min(60 * 24 * 30, Math.floor(minutesFromNow || session.followUpSuggestion?.suggestedMinutesFromNow || 120)))
  const scheduledAt = new Date(Date.now() + minutes * 60 * 1000)

  const callback = await prisma.callback.create({
    data: {
      contactId: session.contactId,
      callId,
      agentId,
      scheduledAt,
      notes: notes || session.followUpSuggestion?.reason || 'Live AI suggested follow-up.',
      status: 'PENDING',
    },
  })

  return callback
}

export const stopLiveAiSession = async (callId: number) => {
  const session = sessions.get(callId)
  if (!session) throw new AppError('Live AI session not found', 404)
  session.status = 'STOPPED'
  session.stoppedAt = nowIso()
  session.updatedAt = nowIso()
  sessions.set(callId, session)
  return session
}
