import {
  CreateCollectionCommand,
  DeleteFacesCommand,
  DescribeCollectionCommand,
  IndexFacesCommand,
  RekognitionClient,
  SearchFacesByImageCommand,
} from '@aws-sdk/client-rekognition';

export class FaceRecognitionError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 503) {
    super(message);
    this.name = 'FaceRecognitionError';
  }
}

let client: RekognitionClient | undefined;
let collectionReady: Promise<string> | undefined;

function region() {
  const value = process.env.REKOGNITION_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  if (!value) throw new FaceRecognitionError('FACE_PROVIDER_NOT_CONFIGURED', 'Face recognition is not configured by the system administrator.');
  return value;
}

function collectionId() {
  const value = (process.env.REKOGNITION_COLLECTION_ID || 'orbithr-production').replace(/[^A-Za-z0-9_.-]/g, '-').slice(0, 255);
  if (!value) throw new FaceRecognitionError('FACE_PROVIDER_NOT_CONFIGURED', 'Face recognition collection is not configured.');
  return value;
}

function rekognition() {
  if (!client) client = new RekognitionClient({ region: region() });
  return client;
}

async function ensureCollection() {
  if (!collectionReady) {
    collectionReady = (async () => {
      const id = collectionId();
      try {
        await rekognition().send(new DescribeCollectionCommand({ CollectionId: id }));
      } catch (error) {
        if ((error as { name?: string }).name !== 'ResourceNotFoundException') throw error;
        await rekognition().send(new CreateCollectionCommand({ CollectionId: id }));
      }
      return id;
    })().catch(error => {
      collectionReady = undefined;
      throw error;
    });
  }
  return collectionReady;
}

function providerFailure(error: unknown): never {
  if (error instanceof FaceRecognitionError) throw error;
  const name = (error as { name?: string }).name;
  if (name === 'InvalidImageFormatException' || name === 'ImageTooLargeException') {
    throw new FaceRecognitionError('FACE_IMAGE_INVALID', 'Use a clear JPEG or PNG photo smaller than 5 MB.', 422);
  }
  if (name === 'InvalidParameterException') {
    throw new FaceRecognitionError('FACE_NOT_DETECTED', 'Exactly one clear, front-facing face is required.', 422);
  }
  console.error('Face recognition provider error:', name || error);
  throw new FaceRecognitionError('FACE_PROVIDER_UNAVAILABLE', 'Face recognition is temporarily unavailable. Attendance remains locked.');
}

export async function enrollEmployeeFace(employeeId: string, image: Buffer) {
  try {
    const collection = await ensureCollection();
    const result = await rekognition().send(new IndexFacesCommand({
      CollectionId: collection,
      Image: { Bytes: image },
      ExternalImageId: employeeId,
      MaxFaces: 1,
      QualityFilter: 'HIGH',
      DetectionAttributes: ['DEFAULT'],
    }));
    const faceId = result.FaceRecords?.[0]?.Face?.FaceId;
    if (!faceId || (result.FaceRecords?.length || 0) !== 1) {
      const reasons = result.UnindexedFaces?.flatMap(face => face.Reasons || []).join(', ');
      throw new FaceRecognitionError('FACE_ENROLLMENT_REJECTED', reasons
        ? `The enrollment photo was rejected (${reasons}). Use a sharp, well-lit, front-facing photo.`
        : 'Exactly one clear, front-facing face is required.', 422);
    }
    return faceId;
  } catch (error) {
    providerFailure(error);
  }
}

export async function deleteEmployeeFace(faceId: string) {
  try {
    const collection = await ensureCollection();
    await rekognition().send(new DeleteFacesCommand({ CollectionId: collection, FaceIds: [faceId] }));
  } catch (error) {
    providerFailure(error);
  }
}

export async function verifyEmployeeFace(expectedFaceId: string, image: Buffer) {
  try {
    const collection = await ensureCollection();
    const threshold = Math.min(99, Math.max(80, Number(process.env.FACE_MATCH_THRESHOLD || 95)));
    const result = await rekognition().send(new SearchFacesByImageCommand({
      CollectionId: collection,
      Image: { Bytes: image },
      FaceMatchThreshold: threshold,
      MaxFaces: 10,
      QualityFilter: 'HIGH',
    }));
    const match = result.FaceMatches?.find(candidate => candidate.Face?.FaceId === expectedFaceId);
    return { matched: Boolean(match), similarity: match?.Similarity ?? null, threshold };
  } catch (error) {
    providerFailure(error);
  }
}

