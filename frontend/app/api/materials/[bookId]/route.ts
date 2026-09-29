import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { getTextbookById } from "../../../materials/textbook_catalog.js";
import { verifyAuthenticatedSession } from "../../_backend";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const denied = await verifyAuthenticatedSession();
  if (denied) return denied;
  const { bookId } = await params;
  const textbook = getTextbookById(bookId);

  if (!textbook) {
    return Response.json({ detail: "没有找到这本教材。" }, { status: 404 });
  }

  // 云端教材走独立私有挂载，仍先验证登录、只接受目录中的已知书目。
  const materialsRoot = process.env.MATERIALS_DIRECTORY || path.resolve(process.cwd(), "..", "教材");
  const filePath = path.resolve(materialsRoot, textbook.fileName);

  try {
    const fileStat = await stat(filePath);
    const nodeStream = createReadStream(filePath);
    const stream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

    return new Response(stream, {
      headers: {
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(textbook.fileName)}`,
        "Content-Length": String(fileStat.size),
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return Response.json({ detail: "教材文件暂时无法读取，请检查项目中的教材目录。" }, { status: 404 });
  }
}
