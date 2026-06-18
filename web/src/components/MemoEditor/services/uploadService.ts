import { create } from "@bufbuild/protobuf";
import { attachmentServiceClient } from "@/connect";
import type { Attachment } from "@/types/proto/api/v1/attachment_service_pb";
import { AttachmentSchema, MotionMediaSchema } from "@/types/proto/api/v1/attachment_service_pb";
import type { LocalFile } from "../types/attachment";

const COMPRESSIBLE_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);
const WEBP_QUALITY = 0.8;
const SKIP_COMPRESS_MIN_SIZE = 50 * 1024; // 小于 50KB 的图不压缩
const MAX_DIMENSION = 2048; // 最长边不超过 2048px

async function compressImage(file: File): Promise<File> {
  const img = await createImageBitmap(file);

  // 等比缩放：超过 MAX_DIMENSION 的图片缩到该尺寸以内
  let targetW = img.width;
  let targetH = img.height;
  if (targetW > MAX_DIMENSION || targetH > MAX_DIMENSION) {
    const ratio = Math.min(MAX_DIMENSION / targetW, MAX_DIMENSION / targetH);
    targetW = Math.round(targetW * ratio);
    targetH = Math.round(targetH * ratio);
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;

  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, targetW, targetH);
  img.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", WEBP_QUALITY),
  );
  if (!blob || blob.size >= file.size) {
    // 压缩后反而更大（常见于小图/已压缩图片），退回原文件
    return file;
  }

  const webpName = file.name.replace(/\.(jpe?g|png)$/i, ".webp");
  return new File([blob], webpName, { type: "image/webp" });
}

export const uploadService = {
  async uploadFiles(localFiles: LocalFile[]): Promise<Attachment[]> {
    if (localFiles.length === 0) return [];

    const attachments: Attachment[] = [];

    for (const localFile of localFiles) {
      const { file, motionMedia } = localFile;

      // Skip Apple Live Photo still — the video component is the primary asset
      const shouldCompress =
        COMPRESSIBLE_IMAGE_TYPES.has(file.type) &&
        file.size > SKIP_COMPRESS_MIN_SIZE &&
        !file.name.endsWith(".gif");

      const uploadFile = shouldCompress ? await compressImage(file) : file;
      const buffer = new Uint8Array(await uploadFile.arrayBuffer());
      const attachment = await attachmentServiceClient.createAttachment({
        attachment: create(AttachmentSchema, {
          filename: uploadFile.name,
          size: BigInt(uploadFile.size),
          type: uploadFile.type,
          content: buffer,
          motionMedia: motionMedia ? create(MotionMediaSchema, motionMedia) : undefined,
        }),
      });
      attachments.push(attachment);
    }

    return attachments;
  },
};
