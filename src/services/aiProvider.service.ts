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

export const summarizeTranscript = async (_text: string): Promise<SummaryResult> => {
  assertAiConfigured()
  throw new Error('AI summary provider adapter not implemented yet.')
}

export const scoreSentiment = async (_text: string): Promise<SentimentResult> => {
  assertAiConfigured()
  throw new Error('AI sentiment provider adapter not implemented yet.')
}
