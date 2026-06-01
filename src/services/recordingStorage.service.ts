import fs from 'fs'
import path from 'path'
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

type UploadRecordingInput = {
  localFilePath: string
  destinationKey?: string
  contentType?: string
}

type UploadRecordingResult = {
  bucket: string
  key: string
  signedUrl: string
  expiresInSeconds: number
  sizeBytes: number
}

const getRequiredEnv = (name: string) => {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not configured`)
  }
  return value
}

const getBucket = () => getRequiredEnv('SUPABASE_RECORDINGS_BUCKET')

const getSignedUrlTtlSeconds = () => {
  const ttl = Number(process.env.RECORDING_SIGNED_URL_TTL_SECONDS || 3600)
  if (!Number.isFinite(ttl) || ttl <= 0) return 3600
  return ttl
}

const getS3Client = () => {
  return new S3Client({
    region: getRequiredEnv('SUPABASE_S3_REGION'),
    endpoint: getRequiredEnv('SUPABASE_S3_ENDPOINT'),
    credentials: {
      accessKeyId: getRequiredEnv('SUPABASE_S3_ACCESS_KEY_ID'),
      secretAccessKey: getRequiredEnv('SUPABASE_S3_SECRET_ACCESS_KEY'),
    },
    forcePathStyle: true,
  })
}

const sanitizeFileName = (fileName: string) => {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
}

const inferContentType = (localFilePath: string, fallback?: string) => {
  if (fallback) return fallback

  const ext = path.extname(localFilePath).toLowerCase()

  if (ext === '.wav') return 'audio/wav'
  if (ext === '.mp3') return 'audio/mpeg'
  if (ext === '.mp4') return 'audio/mp4'
  if (ext === '.webm') return 'audio/webm'
  if (ext === '.m4a') return 'audio/mp4'
  if (ext === '.gsm') return 'audio/gsm'

  return 'application/octet-stream'
}

export const buildRecordingStorageKey = (localFilePath: string, date = new Date()) => {
  const year = String(date.getUTCFullYear())
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const fileName = sanitizeFileName(path.basename(localFilePath))

  return `recordings/${year}/${month}/${day}/${fileName}`
}

export const uploadRecordingAndCreateSignedUrl = async (
  input: UploadRecordingInput
): Promise<UploadRecordingResult> => {
  const bucket = getBucket()
  const client = getS3Client()
  const key = input.destinationKey || buildRecordingStorageKey(input.localFilePath)
  const contentType = inferContentType(input.localFilePath, input.contentType)
  const stat = await fs.promises.stat(input.localFilePath)

  const maxBytes = 25 * 1024 * 1024
  if (stat.size > maxBytes) {
    throw new Error('Recording is too large to upload. Maximum supported size is 25MB.')
  }

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fs.createReadStream(input.localFilePath),
      ContentType: contentType,
    })
  )

  await client.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  )

  const expiresInSeconds = getSignedUrlTtlSeconds()

  const signedUrl = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    { expiresIn: expiresInSeconds }
  )

  return {
    bucket,
    key,
    signedUrl,
    expiresInSeconds,
    sizeBytes: stat.size,
  }
}
