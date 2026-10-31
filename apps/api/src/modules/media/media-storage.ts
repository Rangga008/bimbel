import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createReadStream } from 'node:fs';

/**
 * Penyimpanan file media. Bila S3_ENDPOINT diset (MinIO di Railway) file
 * disimpan di bucket S3; bila tidak, fallback ke disk lokal <cwd>/uploads/media
 * (dev lokal). Key = filename acak di tabel media_assets.
 */
const endpoint = process.env.S3_ENDPOINT;
const bucket = process.env.S3_BUCKET ?? 'bimbel-media';
const localDir = join(process.cwd(), 'uploads', 'media');

const client = endpoint
  ? new S3Client({
      endpoint,
      region: process.env.S3_REGION ?? 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? '',
        secretAccessKey: process.env.S3_SECRET_KEY ?? '',
      },
    })
  : null;

export const mediaStorage = {
  /** True bila MinIO/S3 dikonfigurasi (S3_ENDPOINT). */
  enabled: Boolean(client),

  async put(key: string, body: Buffer, contentType: string) {
    if (client) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
      return;
    }
    await mkdir(localDir, { recursive: true });
    await writeFile(join(localDir, key), body);
  },

  async read(key: string): Promise<Buffer> {
    if (client) {
      const res = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      return Buffer.from(await res.Body!.transformToByteArray());
    }
    return readFile(join(localDir, key));
  },

  /** Stream untuk respons HTTP; error (mis. file hilang) dilempar saat dipanggil. */
  async stream(key: string): Promise<Readable> {
    if (client) {
      const res = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      return res.Body as Readable;
    }
    return createReadStream(join(localDir, key));
  },

  async remove(key: string) {
    if (client) {
      await client
        .send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
        .catch(() => undefined);
      return;
    }
    await unlink(join(localDir, key)).catch(() => undefined);
  },
};
