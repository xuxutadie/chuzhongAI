import { relayAuthenticatedRequest } from "../../../_backend";

/** OCR 只接收已经归属当前学生的上传编号，识别结果仍需学生确认。 */
export async function POST(request: Request) {
  return relayAuthenticatedRequest(request, "/ocr/recognize", "POST");
}
