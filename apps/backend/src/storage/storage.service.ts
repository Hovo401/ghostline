import {
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
  type HeadObjectCommandOutput,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable } from "@nestjs/common";

import { AppConfigService } from "../config/app-config.service";

const PRESIGN_UPLOAD_TTL_SECONDS = 15 * 60;
const PRESIGN_DOWNLOAD_TTL_SECONDS = 10 * 60;

/**
 * Thin wrapper around the S3 client — every other module that needs object
 * storage (media, avatars, exports) goes through this service instead of
 * constructing its own `S3Client`, so the endpoint/credentials/bucket are
 * configured in exactly one place (see REQUIREMENTS.md §7.6 for the
 * upload flow this supports: presigned PUT → client uploads directly →
 * `complete` verifies the object → presigned GET to download).
 *
 * Two clients, one signed URL host each — this is the part that's easy to
 * get wrong: the browser can't resolve the internal Docker hostname
 * (`S3_ENDPOINT`, e.g. `http://seaweedfs:8333`), so presigned URLs must be
 * built against `S3_PUBLIC_URL` (e.g. `http://localhost:8333` in dev, the
 * real S3 domain on its own port in prod) instead — see
 * docker/nginx/dev.conf's dedicated `:8333` server and .env.example.
 * `S3_PUBLIC_URL` must never carry a path suffix (breaks SigV4 — see
 * docs/adr/0008-s3-public-url-needs-its-own-port.md).
 */
@Injectable()
export class StorageService {
  private readonly internalClient: S3Client;
  private readonly presignClient: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: AppConfigService) {
    const s3 = this.config.s3;
    this.bucket = s3.bucket;

    const shared: Omit<S3ClientConfig, "endpoint"> = {
      region: s3.region,
      forcePathStyle: s3.forcePathStyle,
      credentials: { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey },
    };
    this.internalClient = new S3Client({ ...shared, endpoint: s3.endpoint });
    // `WHEN_REQUIRED` (default is `WHEN_SUPPORTED`): the SDK v3's flexible-
    // checksum middleware otherwise bakes an `x-amz-checksum-crc32` (of an
    // *empty* body — the real body isn't known at presign time) into every
    // presigned URL's signed query string. The browser then PUTs the real
    // file bytes straight to that URL and SeaweedFS validates the checksum
    // against the actual body, mismatches, and 403s — every upload fails.
    // `PutObjectCommand`/`GetObjectCommand` don't require a checksum, so
    // `WHEN_REQUIRED` leaves it off presigned requests entirely.
    this.presignClient = new S3Client({
      ...shared,
      endpoint: s3.publicUrl,
      requestChecksumCalculation: "WHEN_REQUIRED",
    });
  }

  async checkBucket(): Promise<void> {
    await this.internalClient.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  async createUploadUrl(key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.presignClient, command, {
      expiresIn: PRESIGN_UPLOAD_TTL_SECONDS,
    });
  }

  /**
   * Confirms an object actually landed in S3 before a client-driven upload
   * is trusted (REQUIREMENTS.md §7.6 step 3) — `null` if it isn't there
   * (still uploading, upload abandoned, or the client lied about `kind`).
   */
  async headObject(key: string): Promise<HeadObjectCommandOutput | null> {
    try {
      return await this.internalClient.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      if (error instanceof NotFound) return null;
      throw error;
    }
  }

  async createDownloadUrl(key: string, fileName?: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(fileName ? { ResponseContentDisposition: `attachment; filename="${fileName}"` } : {}),
    });
    return getSignedUrl(this.presignClient, command, {
      expiresIn: PRESIGN_DOWNLOAD_TTL_SECONDS,
    });
  }
}
