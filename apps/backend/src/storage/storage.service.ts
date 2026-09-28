import {
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
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
 * built against `S3_PUBLIC_URL` (e.g. `http://localhost/s3` in dev, the
 * real S3 domain in prod) instead — see docker/nginx/dev.conf's `/s3/`
 * location and .env.example.
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
    this.presignClient = new S3Client({ ...shared, endpoint: s3.publicUrl });
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
