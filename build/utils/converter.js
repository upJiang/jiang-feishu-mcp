import TurndownService from 'turndown';
import fs from 'fs-extra';
import path from 'path';
import 'dotenv/config';
// 定义转换器类
export class DocConverter {
    turndownService;
    savePath;
    constructor() {
        this.savePath = process.env.DOCS_SAVE_PATH || './docs';
        // 初始化turndown服务
        this.turndownService = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced',
            emDelimiter: '*'
        });
        // 增强turndown配置，添加表格支持
        this.turndownService.addRule('tables', {
            filter: 'table',
            replacement: function (content, node) {
                // 简单实现，实际项目中可能需要更复杂的表格处理逻辑
                return '\n' + content + '\n';
            }
        });
    }
    // 初始化保存目录
    async init() {
        await fs.ensureDir(this.savePath);
    }
    // 简化文档名称，移除特殊字符
    sanitizeFileName(fileName) {
        return fileName
            .replace(/[\\/:*?"<>|]/g, '_')
            .replace(/\s+/g, '_');
    }
    // 处理飞书文档内容
    processDocContent(content) {
        try {
            if (typeof content === 'string') {
                // 如果内容已经是字符串，尝试解析JSON
                try {
                    content = JSON.parse(content);
                }
                catch (e) {
                    // 已经是字符串，不需要解析
                    return content;
                }
            }
            // 处理doc文档
            if (content.content) {
                // 这里实际可能需要更复杂的解析，简化版本
                let markdown = '';
                const blocks = content.content.blocks || [];
                for (const block of blocks) {
                    // 根据不同的块类型，处理为markdown
                    if (block.type === 'paragraph') {
                        markdown += block.text + '\n\n';
                    }
                    else if (block.type === 'heading') {
                        const level = block.level || 1;
                        markdown += '#'.repeat(level) + ' ' + block.text + '\n\n';
                    }
                    else if (block.type === 'code') {
                        markdown += '```' + (block.language || '') + '\n' + block.text + '\n```\n\n';
                    }
                    else if (block.type === 'list') {
                        for (const item of (block.items || [])) {
                            markdown += '- ' + item.text + '\n';
                        }
                        markdown += '\n';
                    }
                    // 其他类型的块可以根据需要添加
                }
                return markdown;
            }
            // 处理电子表格
            if (content.valueRange || content.sheets) {
                let markdown = '';
                const data = content.valueRange ? [content.valueRange] : content.sheets;
                for (const sheet of data) {
                    if (sheet.values && sheet.values.length > 0) {
                        markdown += `## ${sheet.sheetName || 'Sheet'}\n\n`;
                        // 创建表格
                        const values = sheet.values;
                        if (values.length > 0) {
                            // 表头
                            markdown += '| ' + values[0].join(' | ') + ' |\n';
                            // 分隔行
                            markdown += '| ' + values[0].map(() => '---').join(' | ') + ' |\n';
                            // 数据行
                            for (let i = 1; i < values.length; i++) {
                                markdown += '| ' + values[i].join(' | ') + ' |\n';
                            }
                            markdown += '\n';
                        }
                    }
                }
                return markdown;
            }
            // 如果以上都不匹配，返回JSON字符串
            return JSON.stringify(content, null, 2);
        }
        catch (error) {
            console.error('处理文档内容出错:', error);
            return `处理内容出错: ${error instanceof Error ? error.message : String(error)}\n\n原始内容:\n${JSON.stringify(content)}`;
        }
    }
    // 将文档内容保存为Markdown文件
    async saveAsMarkdown(fileName, content, subFolder = '') {
        try {
            const safeName = this.sanitizeFileName(fileName);
            const targetDir = path.join(this.savePath, subFolder);
            // 确保目录存在
            await fs.ensureDir(targetDir);
            const filePath = path.join(targetDir, `${safeName}.md`);
            const markdownContent = this.processDocContent(content);
            await fs.writeFile(filePath, markdownContent, 'utf8');
            return filePath;
        }
        catch (error) {
            console.error('保存Markdown文件出错:', error);
            throw error;
        }
    }
}
// 导出单例实例
export default new DocConverter();
