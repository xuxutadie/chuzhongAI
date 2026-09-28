import {
  callBackend,
  currentSessionToken,
  EXPECTED_USER_ID_HEADER,
  getExpectedUserHeader,
  relayBackendResponse,
} from "../../../_backend";
import { NextResponse } from "next/server";

const MAX_WRONG_QUESTION_IMAGE_BYTES = 5 * 1024 * 1024;
const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

class ImageTooLargeError extends Error {}

/**
 * 缺失 Content-Length 时仍要在读取过程中限制累计字节，避免把超大请求整体缓冲到内存。
 */
async function readBoundedImageBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_WRONG_QUESTION_IMAGE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new ImageTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const imageBytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    imageBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return imageBytes;
}

/**
 * 原始题目图片必须保持 bytes 和 MIME；不能使用 request.text() 或 Base64。
 * 会话令牌只在此服务器端从 HttpOnly Cookie 读取。
 */
export async function POST(request: Request) {
  const token = await currentSessionToken();
  if (!token) {
    return NextResponse.json({ detail: "请先登录" }, { status: 401 });
  }

  try {
    const expectedUserId = getExpectedUserHeader(request);
    const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim() || "";
    if (!supportedImageTypes.has(mediaType)) {
      return NextResponse.json({ detail: "请选择 JPG、PNG 或 WebP 图片。" }, { status: 415 });
    }
    const contentLengthHeader = request.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
        return NextResponse.json({ detail: "图片大小信息无效，请重新选择。" }, { status: 400 });
      }
      if (contentLength > MAX_WRONG_QUESTION_IMAGE_BYTES) {
        return NextResponse.json({ detail: "图片不能超过 5MB，请裁剪题目区域后重试。" }, { status: 413 });
      }
    }
    const imageBytes = await readBoundedImageBody(request);
    const response = await callBackend(
      "/wrong-questions/uploads",
      {
        body: imageBytes,
        headers: {
          "Content-Length": String(imageBytes.byteLength),
          "Content-Type": mediaType,
          ...(expectedUserId ? { [EXPECTED_USER_ID_HEADER]: expectedUserId } : {}),
        },
        method: "POST",
      },
      token,
    );
    return relayBackendResponse(response);
  } catch (error) {
    if (error instanceof ImageTooLargeError) {
      return NextResponse.json({ detail: "图片不能超过 5MB，请裁剪题目区域后重试。" }, { status: 413 });
    }
    return NextResponse.json({ detail: "图片上传服务暂时不可用，请稍后重试。" }, { status: 503 });
  }
}
