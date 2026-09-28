export const textbookCatalog = [
  {
    id: "math-7-upper",
    subject: "数学",
    semester: "上册",
    edition: "北师大版",
    fileName: "北师大版·数学七年级上册.pdf"
  },
  {
    id: "math-7-lower",
    subject: "数学",
    semester: "下册",
    edition: "北师大版",
    fileName: "北师大版·数学七年级下册.pdf"
  },
  {
    id: "english-7-upper",
    subject: "英语",
    semester: "上册",
    edition: "人教版",
    fileName: "最新【人教版】7年级英语课本•上册.pdf"
  },
  {
    id: "english-7-lower",
    subject: "英语",
    semester: "下册",
    edition: "人教版",
    fileName: "最新【人教版】7年级英语课本•下册.pdf"
  },
  {
    id: "chinese-7-upper",
    subject: "语文",
    semester: "上册",
    edition: "人教部编版",
    fileName: "最新【人教版】7年级语文课本•上册.pdf"
  },
  {
    id: "chinese-7-lower",
    subject: "语文",
    semester: "下册",
    edition: "人教部编版",
    fileName: "最新【人教版】7年级语文课本•下册.pdf"
  }
];

export function getTextbookById(bookId) {
  return textbookCatalog.find((book) => book.id === bookId) ?? null;
}
