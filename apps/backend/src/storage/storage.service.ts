import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListPartsCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  type HeadObjectCommandOutput,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable } from "@nestjs/common";

import { AppConfigService } from "../config/app-config.service";

const PRESIGN_UPLOAD_TTL_SECONDS = 15 * 60;
const PRESIGN_DOWNLOAD_TTL_SECONDS = 10 * 60;
const PRESIGN_PART_TTL_SECONDS = 15 * 60;

/**
 * RFC 5987/6266 `Content-Disposition` filename — an ASCII-sanitized fallback
 * for old clients plus a percent-encoded UTF-8 `filename*`, so non-ASCII
 * names (e.g. Cyrillic) survive the header instead of breaking it.
 */
function buildContentDisposition(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  const encoded = encodeURIComponent(fileName);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

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
      ...(fileName ? { ResponseContentDisposition: buildContentDisposition(fileName) } : {}),
    });
    return getSignedUrl(this.presignClient, command, {
      expiresIn: PRESIGN_DOWNLOAD_TTL_SECONDS,
    });
  }

  /** Starts a multipart upload (REQUIREMENTS.md §7.6) — returns the S3 upload id. */
  async createMultipartUpload(key: string, contentType: string): Promise<string> {
    const result = await this.internalClient.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
    );
    if (!result.UploadId) throw new Error("S3 did not return an upload id");
    return result.UploadId;
  }

  /** Presigned `UploadPart` URL for one part of an in-progress multipart upload. */
  async createUploadPartUrl(key: string, uploadId: string, partNumber: number): Promise<string> {
    const command = new UploadPartCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });
    return getSignedUrl(this.presignClient, command, {
      expiresIn: PRESIGN_PART_TTL_SECONDS,
    });
  }

  /**
   * Completes a multipart upload. Parts/ETags are resolved server-side via
   * `ListParts` rather than trusted from the browser — the browser can't
   * read the `ETag` response header without S3 CORS `ExposeHeaders`, and we
   * don't want to rely on that (docs/adr/0010).
   */
  async completeMultipartUpload(key: string, uploadId: string): Promise<void> {
    const listed = await this.internalClient.send(
      new ListPartsCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId }),
    );
    const parts = (listed.Parts ?? [])
      .filter((part) => part.PartNumber !== undefined)
      .sort((a, b) => (a.PartNumber ?? 0) - (b.PartNumber ?? 0))
      .map((part) => ({ PartNumber: part.PartNumber, ETag: part.ETag }));
    await this.internalClient.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      }),
    );
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    await this.internalClient.send(
      new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.internalClient.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
