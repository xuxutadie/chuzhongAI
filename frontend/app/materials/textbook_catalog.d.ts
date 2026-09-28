export type Textbook = {
  id: string;
  subject: "数学" | "英语" | "语文";
  semester: "上册" | "下册";
  edition: string;
  fileName: string;
};

export const textbookCatalog: Textbook[];
export function getTextbookById(bookId: string): Textbook | null;
