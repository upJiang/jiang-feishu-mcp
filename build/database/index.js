import 'dotenv/config';
// 内存数据存储
class InMemoryDatabase {
    spaces = new Map();
    documents = new Map();
    nextDocId = 1;
    constructor() {
        console.log("使用内存数据库...");
    }
    // 保存空间
    saveSpace(id, name) {
        this.spaces.set(id, { id, name });
    }
    // 获取所有空间
    getAllSpaces() {
        return Array.from(this.spaces.values());
    }
    // 保存文档
    saveDocument(doc) {
        const id = this.nextDocId++;
        const newDoc = { id, ...doc };
        this.documents.set(id, newDoc);
        return newDoc;
    }
    // 更新文档内容
    updateDocumentContent(id, content, path) {
        const doc = this.documents.get(id);
        if (doc) {
            doc.content = content;
            doc.path = path;
            this.documents.set(id, doc);
        }
    }
    // 根据名称搜索文档
    searchDocumentsByName(name) {
        const lowerName = name.toLowerCase();
        return Array.from(this.documents.values()).filter(doc => doc.name.toLowerCase().includes(lowerName));
    }
    // 获取特定空间的文档
    getDocumentsBySpace(spaceId) {
        return Array.from(this.documents.values()).filter(doc => doc.spaceId === spaceId);
    }
    // 获取所有文档
    getAllDocuments() {
        return Array.from(this.documents.values());
    }
    // 获取特定文档
    getDocumentByToken(token) {
        return Array.from(this.documents.values()).find(doc => doc.token === token);
    }
}
// 创建并导出数据库实例
const db = new InMemoryDatabase();
export const { saveSpace, getAllSpaces, saveDocument, updateDocumentContent, searchDocumentsByName, getDocumentsBySpace, getAllDocuments, getDocumentByToken } = db;
