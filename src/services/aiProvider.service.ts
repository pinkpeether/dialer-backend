import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import OpenAI from 'openai'

export type TranscriptionResult = {
  text: string
  language?: string
  provider: string
  model?: string
  usage?: {
    seconds?: number
    cost?: number
  }
}

export type SummaryResult = {
  summary: string
  provider: string
}

export type SentimentResult = {
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'UNKNOWN'
  score?: number
  provider: string
}

export type CallInsightAnalysisResult = {
  summary: string
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'UNKNOWN'
  score: number
  intent: string
  objections: string[]
  actionItems: string[]
  provider: string
  model: string
}

const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  '.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm',
])

const getProvider = () => (process.env.AI_PROVIDER || '').toLowerCase()

export const assertAiConfigured = () => {
  const provider = getProvider()

  if (!provider) {
    throw new Error('AI provider is not configured. Set AI_PROVIDER before enabling Phase 4.')
  }

  if (!['openai', 'openrouter'].includes(provider)) {
    throw new Error(`Unsupported AI_PROVIDER "${process.env.AI_PROVIDER}". Supported providers: openai, openrouter.`)
  }

  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured. Set OPENAI_API_KEY before enabling Phase 4.')
  }

  if (provider === 'openrouter' && !process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not configured. Set OPENROUTER_API_KEY before enabling Phase 4.')
  }
}

const getAudioExtension = (recordingUrl: string, contentType?: string | null) => {
  const urlPath = new URL(recordingUrl).pathname
  const extFromUrl = path.extname(urlPath).toLowerCase()

  if (SUPPORTED_AUDIO_EXTENSIONS.has(extFromUrl)) return extFromUrl

  if (contentType?.includes('mpeg')) return '.mp3'
  if (contentType?.includes('mp4')) return '.mp4'
  if (contentType?.includes('mpga')) return '.mpga'
  if (contentType?.includes('m4a')) return '.m4a'
  if (contentType?.includes('wav')) return '.wav'
  if (contentType?.includes('webm')) return '.webm'

  return '.mp3'
}

const downloadRecordingToTempFile = async (recordingUrl: string) => {
  const response = await fetch(recordingUrl)

  if (!response.ok) {
    throw new Error(`Failed to download recording. HTTP ${response.status}`)
  }

  const contentType = response.headers.get('content-type')
  const extension = getAudioExtension(recordingUrl, contentType)
  const tempFile = path.join(os.tmpdir(), `ptdt-recording-${crypto.randomUUID()}${extension}`)

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const maxBytes = 25 * 1024 * 1024
  if (buffer.byteLength > maxBytes) {
    throw new Error('Recording is too large for transcription. Maximum supported size is 25MB.')
  }

  await fs.promises.writeFile(tempFile, buffer)

  return { tempFile, extension, buffer }
}

const transcribeWithOpenAI = async (tempFile: string, model: string): Promise<TranscriptionResult> => {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })

  const transcription = await client.audio.transcriptions.create({
    file: fs.createReadStream(tempFile),
    model,
  })

  return {
    text: transcription.text,
    provider: 'openai',
    model,
  }
}

const transcribeWithOpenRouter = async (
  buffer: Buffer,
  extension: string,
  model: string
): Promise<TranscriptionResult> => {
  const format = extension.replace('.', '') || 'wav'

  const response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://ptdt-dialer.local',
      'X-OpenRouter-Title': process.env.OPENROUTER_SITE_NAME || 'PTDT Dialer',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      provider: {
        allow_fallbacks: true,
      },
      input_audio: {
        data: buffer.toString('base64'),
        format,
      },
    }),
  })

  const raw = await response.text()

  if (!response.ok) {
    throw new Error(`OpenRouter transcription failed. HTTP ${response.status}: ${raw}`)
  }

  const parsed = JSON.parse(raw) as {
    text?: string
    usage?: {
      seconds?: number
      cost?: number
    }
  }

  return {
    text: parsed.text || '',
    provider: 'openrouter',
    model,
    usage: parsed.usage,
  }
}

export const transcribeRecording = async (recordingUrl: string): Promise<TranscriptionResult> => {
  assertAiConfigured()

  const provider = getProvider()
  const defaultModel =
    provider === 'openrouter'
      ? 'openai/whisper-large-v3-turbo'
      : 'gpt-4o-mini-transcribe'

  const model = process.env.AI_TRANSCRIPTION_MODEL || defaultModel

  const { tempFile, extension, buffer } = await downloadRecordingToTempFile(recordingUrl)

  try {
    if (provider === 'openrouter') {
      return await transcribeWithOpenRouter(buffer, extension, model)
    }

    return await transcribeWithOpenAI(tempFile, model)
  } finally {
    await fs.promises.unlink(tempFile).catch(() => undefined)
  }
}

const getInsightModel = (provider: string) => {
  return process.env.AI_INSIGHT_MODEL ||
    process.env.AI_SUMMARY_MODEL ||
    (provider === 'openrouter' ? 'openai/gpt-4o-mini' : 'gpt-4o-mini')
}

const extractJsonObject = (raw: string) => {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = fenced?.[1]?.trim() || trimmed
  const firstBrace = candidate.indexOf('{')
  const lastBrace = candidate.lastIndexOf('}')

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('AI insight response did not contain a JSON object.')
  }

  return candidate.slice(firstBrace, lastBrace + 1)
}

const normalizeSentiment = (value: unknown): CallInsightAnalysisResult['sentiment'] => {
  const normalized = String(value || '').toUpperCase()
  if (['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'UNKNOWN'].includes(normalized)) {
    return normalized as CallInsightAnalysisResult['sentiment']
  }
  return 'UNKNOWN'
}

const normalizeScore = (value: unknown) => {
  const score = Number(value)
  if (!Number.isFinite(score)) return 50
  return Math.max(0, Math.min(100, Math.round(score)))
}

const normalizeStringArray = (value: unknown) => {
  if (!Array.isArray(value)) return []
  return value
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 8)
}

const parseInsightJson = (
  raw: string,
  provider: string,
  model: string
): CallInsightAnalysisResult => {
  const parsed = JSON.parse(extractJsonObject(raw)) as {
    summary?: unknown
    sentiment?: unknown
    score?: unknown
    intent?: unknown
    objections?: unknown
    actionItems?: unknown
  }

  return {
    summary: String(parsed.summary || 'No summary generated.').trim(),
    sentiment: normalizeSentiment(parsed.sentiment),
    score: normalizeScore(parsed.score),
    intent: String(parsed.intent || 'UNKNOWN').trim(),
    objections: normalizeStringArray(parsed.objections),
    actionItems: normalizeStringArray(parsed.actionItems),
    provider,
    model,
  }
}

const buildInsightPrompt = (text: string) => {
  return [
    'You are analyzing a call transcript for PTDT Dialer supervisors.',
    'Return ONLY valid JSON. No markdown. No extra text.',
    'Use this exact JSON shape:',
    '{"summary":"2-4 sentence concise call summary","sentiment":"POSITIVE|NEUTRAL|NEGATIVE|UNKNOWN","score":0,"intent":"customer intent in a short phrase","objections":["short objection"],"actionItems":["short next action"]}',
    'Score must be an integer from 0 to 100, where 100 means excellent sales/support outcome and 0 means very poor outcome.',
    'If the transcript is too short or unclear, use UNKNOWN/NEUTRAL and explain briefly in summary.',
    '',
    'Transcript:',
    text.slice(0, 12000),
  ].join('\n')
}

const analyzeWithOpenRouter = async (
  transcriptText: string,
  model: string
): Promise<CallInsightAnalysisResult> => {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://ptdt-dialer.local',
      'X-OpenRouter-Title': process.env.OPENROUTER_SITE_NAME || 'PTDT Dialer',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You produce strict JSON call intelligence for a dialer CRM.',
        },
        {
          role: 'user',
          content: buildInsightPrompt(transcriptText),
        },
      ],
      temperature: 0.2,
      provider: {
        allow_fallbacks: true,
      },
    }),
  })

  const raw = await response.text()

  if (!response.ok) {
    throw new Error(`OpenRouter insight generation failed. HTTP ${response.status}: ${raw}`)
  }

  const parsed = JSON.parse(raw) as {
    choices?: Array<{
      message?: {
        content?: string
      }
    }>
  }

  const content = parsed.choices?.[0]?.message?.content || ''
  return parseInsightJson(content, 'openrouter', model)
}

const analyzeWithOpenAI = async (
  transcriptText: string,
  model: string
): Promise<CallInsightAnalysisResult> => {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })

  const response = await client.chat.completions.create({
    model,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You produce strict JSON call intelligence for a dialer CRM.',
      },
      {
        role: 'user',
        content: buildInsightPrompt(transcriptText),
      },
    ],
  })

  const content = response.choices[0]?.message?.content || ''
  return parseInsightJson(content, 'openai', model)
}

export const analyzeTranscriptInsight = async (
  transcriptText: string
): Promise<CallInsightAnalysisResult> => {
  assertAiConfigured()

  if (!transcriptText.trim()) {
    throw new Error('Transcript is empty. Generate a transcript before creating call insight.')
  }

  const provider = getProvider()
  const model = getInsightModel(provider)

  if (provider === 'openrouter') {
    return analyzeWithOpenRouter(transcriptText, model)
  }

  return analyzeWithOpenAI(transcriptText, model)
}

export const summarizeTranscript = async (text: string): Promise<SummaryResult> => {
  const insight = await analyzeTranscriptInsight(text)
  return {
    summary: insight.summary,
    provider: insight.provider,
  }
}

export const scoreSentiment = async (text: string): Promise<SentimentResult> => {
  const insight = await analyzeTranscriptInsight(text)
  return {
    sentiment: insight.sentiment,
    score: insight.score,
    provider: insight.provider,
  }
}
