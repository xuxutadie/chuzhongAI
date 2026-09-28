import { textbookCatalog } from "../materials/textbook_catalog.js";
import { isSubjectEnabled } from "../subject-visibility.js";
import { WorkspaceIcon } from "./workspace_icon";

export function MaterialsWorkspace() {
  const books = textbookCatalog.filter(book => isSubjectEnabled(book.subject));
  return <section className="textbook-library" aria-label="可用教材">
    {books.map(book => <article className="textbook-entry" key={book.id}>
      <div className="textbook-mark" aria-hidden="true"><WorkspaceIcon name="book" /><span>{book.subject}</span><small>{book.semester}</small></div>
      <div className="textbook-copy"><span className="resource-kicker">{book.edition} · 七年级</span><h2>{book.subject} · {book.semester}</h2><p>PDF 教材 · 在新窗口打开，方便对照学习。</p><a className="workspace-button" href={`/api/materials/${book.id}`} target="_blank" rel="noreferrer">打开教材 <span aria-hidden="true">↗</span></a></div>
    </article>)}
    {!books.length ? <p role="status">教材正在整理中，你可以先返回数学学习进行章节复习。</p> : null}
  </section>;
}
