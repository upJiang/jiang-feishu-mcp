import { z } from 'zod';
import feishuAPI from '../api/feishu.js';
import converter from '../utils/converter.js';
import * as db from '../database/index.js';
// 注册工具函数到MCP服务器
export function registerTools(server) {
    // 获取所有文档空间
    server.tool('list-spaces', {}, async () => {
        try {
            const response = await feishuAPI.getSpaces();
            const spaces = response.items || [];
            // 保存空间到数据库
            spaces.forEach(space => {
                db.saveSpace(space.id, space.name);
            });
            return {
                content: [
                    {
                        type: 'text',
                        text: `找到 ${spaces.length} 个文档空间:\n\n` +
                            spaces.map((space, index) => `${index + 1}. ${space.name} (ID: ${space.id})`).join('\n')
                    }
                ]
            };
        }
        catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `获取文档空间失败: ${error instanceof Error ? error.message : String(error)}`
                    }
                ]
            };
        }
    });
    // 获取特定空间的文档列表
    server.tool('list-documents', {
        spaceId: z.string().optional()
    }, async ({ spaceId }) => {
        try {
            let docs = [];
            let responseText = '';
            if (spaceId) {
                // 获取特定空间的文档
                const response = await feishuAPI.getDocuments(spaceId);
                docs = response.files || [];
                // 获取空间信息
                const spaces = await feishuAPI.getSpaces();
                const space = spaces.items.find(s => s.id === spaceId);
                const spaceName = space ? space.name : '未知空间';
                // 保存文档到数据库
                docs.forEach(doc => {
                    db.saveDocument({
                        token: doc.token,
                        name: doc.name,
                        type: doc.type,
                        spaceName,
                        spaceId
                    });
                });
                responseText = `在空间 "${spaceName}" 中找到 ${docs.length} 个文档:\n\n`;
            }
            else {
                // 获取所有空间
                const spaces = await feishuAPI.getSpaces();
                // 遍历所有空间获取文档
                for (const space of spaces.items) {
                    const response = await feishuAPI.getDocuments(space.id);
                    const spaceDocs = response.files || [];
                    // 保存文档到数据库
                    spaceDocs.forEach(doc => {
                        db.saveDocument({
                            token: doc.token,
                            name: doc.name,
                            type: doc.type,
                            spaceName: space.name,
                            spaceId: space.id
                        });
                    });
                    docs = [...docs, ...spaceDocs.map(doc => ({ ...doc, spaceName: space.name }))];
                }
                responseText = `在所有空间中找到 ${docs.length} 个文档:\n\n`;
            }
            // 按空间分组
            const docsBySpace = {};
            docs.forEach(doc => {
                const spaceName = doc.spaceName || '未知空间';
                if (!docsBySpace[spaceName]) {
                    docsBySpace[spaceName] = [];
                }
                docsBySpace[spaceName].push(doc);
            });
            // 格式化输出
            Object.keys(docsBySpace).forEach(spaceName => {
                responseText += `[${spaceName}]\n`;
                docsBySpace[spaceName].forEach((doc, index) => {
                    responseText += `${index + 1}. ${doc.name} (类型: ${doc.type}, ID: ${doc.token})\n`;
                });
                responseText += '\n';
            });
            return {
                content: [
                    {
                        type: 'text',
                        text: responseText
                    }
                ]
            };
        }
        catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `获取文档列表失败: ${error instanceof Error ? error.message : String(error)}`
                    }
                ]
            };
        }
    });
    // 下载并转换特定文档
    server.tool('download-document', {
        fileToken: z.string(),
        name: z.string().optional(),
        type: z.string().optional()
    }, async ({ fileToken, name, type }) => {
        try {
            await converter.init();
            // 检查数据库中是否已有该文档
            let doc = db.getDocumentByToken(fileToken);
            if (!doc) {
                // 如果数据库中没有，使用提供的信息创建
                doc = db.saveDocument({
                    token: fileToken,
                    name: name || '未命名文档',
                    type: type || 'doc',
                    spaceName: '',
                    spaceId: ''
                });
            }
            // 获取文档内容
            const fileType = doc.type === 'sheet' ? 'sheet' : 'docx';
            const content = await feishuAPI.getDocumentContent(fileToken, fileType);
            // 创建子文件夹
            const subFolder = doc.spaceName ? converter.sanitizeFileName(doc.spaceName) : '';
            // 保存为Markdown
            const filePath = await converter.saveAsMarkdown(doc.name, content, subFolder);
            // 更新数据库
            db.updateDocumentContent(doc.id, JSON.stringify(content), filePath);
            return {
                content: [
                    {
                        type: 'text',
                        text: `文档 "${doc.name}" 已成功下载并转换为Markdown，保存路径: ${filePath}`
                    }
                ]
            };
        }
        catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `下载文档失败: ${error instanceof Error ? error.message : String(error)}`
                    }
                ]
            };
        }
    });
    // 下载指定空间的所有文档
    server.tool('download-space-documents', {
        spaceId: z.string().optional()
    }, async ({ spaceId }) => {
        try {
            await converter.init();
            let docs = [];
            let spaceName = '所有空间';
            if (spaceId) {
                // 获取特定空间的文档
                const response = await feishuAPI.getDocuments(spaceId);
                docs = response.files || [];
                // 获取空间信息
                const spaces = await feishuAPI.getSpaces();
                const space = spaces.items.find(s => s.id === spaceId);
                spaceName = space ? space.name : '未知空间';
                // 保存空间到数据库
                if (space) {
                    db.saveSpace(space.id, space.name);
                }
            }
            else {
                // 获取所有空间
                const spaces = await feishuAPI.getSpaces();
                // 遍历所有空间获取文档
                for (const space of spaces.items) {
                    const response = await feishuAPI.getDocuments(space.id);
                    const spaceDocs = response.files || [];
                    // 添加空间信息
                    docs = [...docs, ...spaceDocs.map(doc => ({
                            ...doc,
                            spaceName: space.name,
                            spaceId: space.id
                        }))];
                    // 保存空间到数据库
                    db.saveSpace(space.id, space.name);
                }
            }
            const results = [];
            // 下载每个文档
            for (const doc of docs) {
                try {
                    // 保存文档到数据库
                    const savedDoc = db.saveDocument({
                        token: doc.token,
                        name: doc.name,
                        type: doc.type,
                        spaceName: doc.spaceName || spaceName,
                        spaceId: doc.spaceId || spaceId || ''
                    });
                    // 获取文档内容
                    const fileType = doc.type === 'sheet' ? 'sheet' : 'docx';
                    const content = await feishuAPI.getDocumentContent(doc.token, fileType);
                    // 创建子文件夹
                    const subFolder = savedDoc.spaceName ? converter.sanitizeFileName(savedDoc.spaceName) : '';
                    // 保存为Markdown
                    const filePath = await converter.saveAsMarkdown(doc.name, content, subFolder);
                    // 更新数据库
                    db.updateDocumentContent(savedDoc.id, JSON.stringify(content), filePath);
                    results.push({
                        name: doc.name,
                        success: true,
                        path: filePath
                    });
                }
                catch (error) {
                    results.push({
                        name: doc.name,
                        success: false,
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }
            // 计算结果
            const successCount = results.filter(r => r.success).length;
            const failCount = results.length - successCount;
            let responseText = `从"${spaceName}"下载文档完成!\n\n`;
            responseText += `总计: ${results.length} 个文档\n`;
            responseText += `成功: ${successCount} 个\n`;
            responseText += `失败: ${failCount} 个\n\n`;
            if (failCount > 0) {
                responseText += '失败的文档:\n';
                results.filter(r => !r.success).forEach(doc => {
                    responseText += `- ${doc.name}: ${doc.error}\n`;
                });
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: responseText
                    }
                ]
            };
        }
        catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `下载文档失败: ${error instanceof Error ? error.message : String(error)}`
                    }
                ]
            };
        }
    });
    // 搜索已下载的文档
    server.tool('search-documents', {
        query: z.string()
    }, async ({ query }) => {
        try {
            const docs = db.searchDocumentsByName(query);
            if (docs.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `未找到匹配 "${query}" 的文档。`
                        }
                    ]
                };
            }
            let responseText = `找到 ${docs.length} 个匹配 "${query}" 的文档:\n\n`;
            // 按空间分组
            const docsBySpace = {};
            docs.forEach(doc => {
                const spaceName = doc.spaceName || '未知空间';
                if (!docsBySpace[spaceName]) {
                    docsBySpace[spaceName] = [];
                }
                docsBySpace[spaceName].push(doc);
            });
            // 格式化输出
            Object.keys(docsBySpace).forEach(spaceName => {
                responseText += `[${spaceName}]\n`;
                docsBySpace[spaceName].forEach((doc, index) => {
                    responseText += `${index + 1}. ${doc.name} (ID: ${doc.token})`;
                    if (doc.path) {
                        responseText += ` [已下载: ${doc.path}]`;
                    }
                    responseText += '\n';
                });
                responseText += '\n';
            });
            return {
                content: [
                    {
                        type: 'text',
                        text: responseText
                    }
                ]
            };
        }
        catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `搜索文档失败: ${error instanceof Error ? error.message : String(error)}`
                    }
                ]
            };
        }
    });
}
