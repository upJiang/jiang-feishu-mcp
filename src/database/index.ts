import path from "path";
import fs from 'fs-extra';
import 'dotenv/config';

// 定义文档类型
export interface Document {
  id: number;
  token: string;
  name: string;
  type: string;
  spaceName: string;
  spaceId: string;
  content?: string;
  path?: string;
  [key: string]: any;
}

// 内存数据存储
class InMemoryDatabase {
  private spaces: Map<string, { id: string; name: string }> = new Map();
  private documents: Map<number, Document> = new Map();
  private nextDocId: number = 1;

  constructor() {
    console.log("使用内存数据库...");
  }

  // 保存空间
  saveSpace(id: string, name: string): void {
    this.spaces.set(id, { id, name });
  }

  // 获取所有空间
  getAllSpaces(): { id: string; name: string }[] {
    return Array.from(this.spaces.values());
  }

  // 保存文档
  saveDocument(doc: Document): Document {
    const id = this.nextDocId++;
    // 移除doc中的id以避免冲突
    const { id: _, ...docWithoutId } = doc;
    const newDoc = { id, ...docWithoutId };
    this.documents.set(id, newDoc);
    return newDoc;
  }

  // 更新文档内容
  updateDocumentContent(id: number, content: string, path: string): void {
    const doc = this.documents.get(id);
    if (doc) {
      doc.content = content;
      doc.path = path;
      this.documents.set(id, doc);
    }
  }

  // 根据名称搜索文档
  searchDocumentsByName(name: string): Document[] {
    const lowerName = name.toLowerCase();
    return Array.from(this.documents.values()).filter(
      doc => doc.name.toLowerCase().includes(lowerName)
    );
  }

  // 获取特定空间的文档
  getDocumentsBySpace(spaceId: string): Document[] {
    return Array.from(this.documents.values()).filter(
      doc => doc.spaceId === spaceId
    );
  }

  // 获取所有文档
  getAllDocuments(): Document[] {
    return Array.from(this.documents.values());
  }

  // 获取特定文档
  getDocumentByToken(token: string): Document | null {
    return Array.from(this.documents.values()).find(
      doc => doc.token === token
    ) || null;
  }
}

// 创建并导出数据库实例
const db = new InMemoryDatabase();

export const { 
  saveSpace,
  getAllSpaces,
  saveDocument,
  updateDocumentContent,
  searchDocumentsByName,
  getDocumentsBySpace,
  getAllDocuments,
  getDocumentByToken
} = db; 