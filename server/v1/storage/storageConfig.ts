import path from 'node:path';

export interface StorageConfig {
  provider: 'local' | 's3';
  storageRoot: string;
  s3: {
    region: string;
    bucketName: string;
    kmsKeyId?: string;
    presignedUrlExpiresSeconds: number;
    endpoint?: string;
    forcePathStyle?: boolean;
  };
}

export function getStorageConfig(): StorageConfig {
  const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase().trim();
  const rawProvider = process.env.STORAGE_PROVIDER ? process.env.STORAGE_PROVIDER.toLowerCase().trim() : undefined;

  let provider: 'local' | 's3';

  if (nodeEnv === 'production') {
    if (!rawProvider) {
      throw new Error(
        'Production storage configuration failure: STORAGE_PROVIDER environment variable is required in production and must be set to "s3".'
      );
    }
    if (rawProvider !== 's3') {
      throw new Error(
        `Production storage configuration failure: Invalid STORAGE_PROVIDER "${rawProvider}". Only "s3" is permitted in production.`
      );
    }
    provider = 's3';
  } else {
    if (!rawProvider) {
      provider = 'local';
    } else if (rawProvider === 's3' || rawProvider === 'local') {
      provider = rawProvider;
    } else {
      throw new Error(
        `Invalid storage configuration: Unsupported STORAGE_PROVIDER "${rawProvider}". Must be "local" or "s3".`
      );
    }
  }

  const storageRoot = path.resolve(
    process.env.DOCUMENT_STORAGE_DIR || 'storage'
  );

  const region = (process.env.AWS_REGION || 'ap-south-1').trim();
  const bucketName = (process.env.S3_BUCKET_NAME || '').trim();
  const kmsKeyId = process.env.S3_KMS_KEY_ID?.trim() || undefined;

  const rawExpiry = Number.parseInt(process.env.S3_PRESIGNED_URL_EXPIRES_SECONDS || '900', 10);
  const presignedUrlExpiresSeconds = Number.isFinite(rawExpiry) && rawExpiry >= 60 && rawExpiry <= 3600
    ? rawExpiry
    : 900;

  const endpoint = process.env.S3_ENDPOINT?.trim() || undefined;
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';

  if (provider === 's3') {
    if (!bucketName) {
      throw new Error(
        'Invalid storage configuration: S3_BUCKET_NAME is required when STORAGE_PROVIDER is set to "s3".'
      );
    }
    if (!region) {
      throw new Error(
        'Invalid storage configuration: AWS_REGION is required when STORAGE_PROVIDER is set to "s3".'
      );
    }
  }

  return {
    provider,
    storageRoot,
    s3: {
      region,
      bucketName,
      kmsKeyId,
      presignedUrlExpiresSeconds,
      endpoint,
      forcePathStyle,
    },
  };
}
