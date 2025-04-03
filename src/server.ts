// 先导入依赖
import express, { Request, Response } from "express";
import { IncomingMessage, ServerResponse } from "http";
import { z } from "zod";
import 'dotenv/config';
import * as fs from 'fs-extra';
import * as path from 'path';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// 导入自定义模块
import { FeishuClient } from './api/feishu.js';

// 创建docs目录
const docsPath = process.env.DOCS_SAVE_PATH || './docs';
fs.ensureDirSync(docsPath);

// 简单的日志记录器
export const Logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args)
};

/**
 * 飞书MCP服务器
 */
export class FeishuMcpServer {
  private server: McpServer;
  private feishuClient: FeishuClient;
  private transport: Transport | null = null;

  /**
   * 构造函数
   * @param appId 飞书应用ID
   * @param appSecret 飞书应用密钥
   */
  constructor(appId?: string, appSecret?: string) {
    // 创建飞书客户端
    this.feishuClient = new FeishuClient(appId, appSecret);

    // 创建MCP服务器
    this.server = new McpServer({
      name: "飞书文档MCP服务",
      version: "1.0.0",
    }, {
      capabilities: {
        logging: {},
        tools: {},
      },
    });

    // 注册工具
    this.registerTools();
  }

  /**
   * 注册MCP工具
   */
  private registerTools() {
    const { feishuClient } = this;

    // 列出文档空间
    this.server.tool(
      "list-spaces",
      "列出所有可用的飞书文档空间",
      {},
      async () => {
        try {
          const response = await feishuClient.getSpaces();
          const spaces = response.items || [];
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  spaces: spaces.map(space => ({
                    id: space.space_id, 
                    name: space.name
                  }))
                })
              }
            ]
          };
        } catch (error: any) {
          Logger.error(`获取空间列表失败:`, error);
          return {
            isError: true,
            content: [
              { 
                type: "text", 
                text: `获取空间列表失败: ${error.message || '未知错误'}` 
              }
            ]
          };
        }
      }
    );

    // 列出文档
    this.server.tool(
      "list-documents",
      "获取指定空间或所有空间的文档列表",
      {
        spaceId: z.string().optional().describe("空间ID，不提供则返回所有空间的文档")
      },
      async ({ spaceId }: { spaceId?: string }) => {
        try {
          let allDocuments: any[] = [];

          if (spaceId) {
            // 获取指定空间的文档
            try {
              const response = await feishuClient.getNodes(spaceId);
              allDocuments = (response.items || []).map(node => ({
                id: node.node_token,
                name: node.title || 'Untitled',
                type: node.obj_type || 'Unknown',
                spaceId: spaceId
              }));
            } catch (error: any) {
              if (error.message?.includes('权限')) {
                return {
                  isError: true,
                  content: [{ type: "text", text: `无权访问空间(${spaceId})的文档` }]
                };
              }
              throw error;
            }
          } else {
            // 获取所有空间的文档
            const spacesResponse = await feishuClient.getSpaces();
            const spaces = spacesResponse.items || [];
            
            for (const space of spaces) {
              try {
                const response = await feishuClient.getNodes(space.space_id);
                const documents = (response.items || []).map(node => ({
                  id: node.node_token,
                  name: node.title || 'Untitled',
                  type: node.obj_type || 'Unknown',
                  spaceId: space.space_id,
                  spaceName: space.name
                }));
                allDocuments = [...allDocuments, ...documents];
              } catch (error: any) {
                // 跳过无法访问的空间
                if (!error.message?.includes('权限')) {
                  Logger.error(`获取空间(${space.space_id})的文档列表失败:`, error);
                }
              }
            }
          }
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ documents: allDocuments })
              }
            ]
          };
        } catch (error: any) {
          Logger.error(`获取文档列表失败:`, error);
          return {
            isError: true,
            content: [
              { 
                type: "text", 
                text: `获取文档列表失败: ${error.message || '未知错误'}` 
              }
            ]
          };
        }
      }
    );

    // 下载文档
    this.server.tool(
      "download-document",
      "下载并保存指定的文档",
      {
        documentId: z.string().describe("文档ID"),
        spaceName: z.string().optional().describe("空间名称，用于文件夹组织")
      },
      async ({ documentId, spaceName }: { documentId: string, spaceName?: string }) => {
        try {
          // 获取文档元数据
          const metaResponse = await feishuClient.getDocumentMeta(documentId);
          if (!metaResponse) {
            return {
              isError: true,
              content: [{ type: "text", text: "获取文档元数据失败" }]
            };
          }
          
          // 获取文档内容
          const content = await feishuClient.getDocumentContent(documentId);
          if (!content) {
            return {
              isError: true,
              content: [{ type: "text", text: "获取文档内容失败" }]
            };
          }
          
          // 创建保存路径
          const dirPath = spaceName 
            ? path.join(docsPath, this.sanitizeFileName(spaceName))
            : docsPath;
          
          fs.ensureDirSync(dirPath);
          
          // 保存文档
          // 使用安全的方式访问title，避免类型错误
          const docTitle = (metaResponse as any).title || `未命名文档_${documentId}`;
          const fileName = `${this.sanitizeFileName(docTitle)}.md`;
          const filePath = path.join(dirPath, fileName);
          
          fs.writeFileSync(filePath, content.content || '');
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  file: filePath,
                  title: docTitle
                })
              }
            ]
          };
        } catch (error: any) {
          Logger.error(`下载文档失败:`, error);
          return {
            isError: true,
            content: [
              { 
                type: "text", 
                text: `下载文档失败: ${error.message || '未知错误'}` 
              }
            ]
          };
        }
      }
    );

    // 下载空间内所有文档
    this.server.tool(
      "download-space-documents",
      "下载指定空间内的所有文档",
      {
        spaceId: z.string().describe("空间ID")
      },
      async ({ spaceId }: { spaceId: string }) => {
        try {
          // 获取空间信息
          const spacesResponse = await feishuClient.getSpaces();
          const spaces = spacesResponse.items || [];
          const space = spaces.find(s => s.space_id === spaceId);
          
          if (!space) {
            return {
              isError: true,
              content: [{ type: "text", text: `未找到ID为${spaceId}的空间` }]
            };
          }
          
          // 获取空间下的文档列表
          const nodesResponse = await feishuClient.getNodes(spaceId);
          const nodes = nodesResponse.items || [];
          
          // 创建空间文件夹
          const spaceFolderName = this.sanitizeFileName(space.name);
          const spaceFolderPath = path.join(docsPath, spaceFolderName);
          fs.ensureDirSync(spaceFolderPath);
          
          // 下载所有文档
          let successCount = 0;
          let failCount = 0;
          
          for (const node of nodes) {
            try {
              // 只下载文档类型的节点
              if (node.obj_type !== 'docx') {
                continue;
              }
              
              // 获取文档内容
              const content = await feishuClient.getDocumentContent(node.node_token);
              if (!content) {
                failCount++;
                continue;
              }
              
              // 保存文档
              const fileName = `${this.sanitizeFileName(node.title || '未命名文档')}.md`;
              const filePath = path.join(spaceFolderPath, fileName);
              
              fs.writeFileSync(filePath, content.content || '');
              successCount++;
            } catch (error) {
              failCount++;
              Logger.error(`下载文档(${node.title || node.node_token})失败:`, error);
            }
          }
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  totalCount: nodes.length,
                  successCount: successCount,
                  failCount: failCount,
                  spaceName: space.name,
                  folderPath: spaceFolderPath
                })
              }
            ]
          };
        } catch (error: any) {
          Logger.error(`下载空间文档失败:`, error);
          return {
            isError: true,
            content: [
              { 
                type: "text", 
                text: `下载空间文档失败: ${error.message || '未知错误'}` 
              }
            ]
          };
        }
      }
    );

    // 搜索文档
    this.server.tool(
      "search-documents",
      "在已下载的文档中搜索关键词",
      {
        keyword: z.string().describe("搜索关键词")
      },
      async ({ keyword }: { keyword: string }) => {
        try {
          const results: Array<{
            file: string;
            matches: Array<{ line: number; text: string }>;
          }> = [];

          // 确保docs目录存在
          if (!fs.existsSync(docsPath)) {
            return { 
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ 
                    matches: [],
                    message: "未找到已下载的文档"
                  })
                }
              ]
            };
          }

          // 递归搜索文件
          const searchInDirectory = (directory: string) => {
            const files = fs.readdirSync(directory);
            
            for (const file of files) {
              const fullPath = path.join(directory, file);
              const stat = fs.statSync(fullPath);
              
              if (stat.isDirectory()) {
                searchInDirectory(fullPath);
              } else if (file.endsWith('.md')) {
                try {
                  const content = fs.readFileSync(fullPath, 'utf-8');
                  const lines = content.split('\n');
                  const matches: Array<{ line: number; text: string }> = [];
                  
                  lines.forEach((line, index) => {
                    if (line.toLowerCase().includes(keyword.toLowerCase())) {
                      matches.push({
                        line: index + 1,
                        text: line.trim()
                      });
                    }
                  });
                  
                  if (matches.length > 0) {
                    results.push({
                      file: path.relative(docsPath, fullPath),
                      matches
                    });
                  }
                } catch (error) {
                  Logger.error(`搜索文件(${fullPath})失败:`, error);
                }
              }
            }
          };
          
          searchInDirectory(docsPath);
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  matches: results,
                  total: results.length
                })
              }
            ]
          };
        } catch (error: any) {
          Logger.error(`搜索文档失败:`, error);
          return {
            isError: true,
            content: [
              { 
                type: "text", 
                text: `搜索文档失败: ${error.message || '未知错误'}` 
              }
            ]
          };
        }
      }
    );
  }

  /**
   * 清理文件名，移除非法字符
   */
  private sanitizeFileName(name: string): string {
    return name.replace(/[\/\\:*?"<>|]/g, '_');
  }

  /**
   * 启动标准输入输出模式
   */
  async startStdio() {
    const transport = new StdioServerTransport();
    this.transport = transport;
    await this.connect(transport);
    return this;
  }

  /**
   * 启动HTTP服务器
   * @param port 端口号
   */
  async startHttp(port: number = 7777) {
    const app = express();
    
    // 添加健康检查终端
    app.get('/health', (req: Request, res: Response) => {
      res.status(200).send('OK');
    });

    // 主页 - 简单的HTML界面
    app.get('/', (req: Request, res: Response) => {
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>飞书文档MCP服务</title>
            <style>
              body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
              h1 { color: #3370ff; }
              .status { padding: 10px; border-radius: 4px; display: inline-block; }
              .running { background-color: #e3f0e3; color: #2b702b; }
              pre { background-color: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; }
            </style>
          </head>
          <body>
            <h1>飞书文档MCP服务</h1>
            <p>状态: <span class="status running">运行中</span></p>
            <h2>可用功能:</h2>
            <ul>
              <li>列出文档空间</li>
              <li>列出文档</li>
              <li>下载特定文档</li>
              <li>下载空间内所有文档</li>
              <li>搜索已下载的文档</li>
            </ul>
            <p>文档保存路径: ${docsPath}</p>
          </body>
        </html>
      `);
    });

    // SSE 路由
    app.get('/mcp', async (req: Request, res: Response) => {
      console.log("新的MCP SSE连接已建立");
      const transport = new SSEServerTransport(
        "/mcp-messages",
        res as unknown as ServerResponse<IncomingMessage>,
      );
      this.transport = transport;
      await this.connect(transport);
    });

    app.post('/mcp-messages', async (req: Request, res: Response) => {
      if (!this.transport) {
        res.status(400).send("SSE连接尚未建立");
        return;
      }
      
      const sseTransport = this.transport as SSEServerTransport;
      await sseTransport.handlePostMessage(
        req as unknown as IncomingMessage,
        res as unknown as ServerResponse<IncomingMessage>,
      );
    });

    // 启动HTTP服务器
    return new Promise<this>((resolve) => {
      const server = app.listen(port, () => {
        Logger.log(`HTTP服务器已启动，监听端口: ${port}`);
        Logger.log(`SSE端点: http://localhost:${port}/mcp`);
        Logger.log(`消息端点: http://localhost:${port}/mcp-messages`);
        resolve(this);
      });
    });
  }

  /**
   * 连接到传输层
   */
  private async connect(transport: Transport): Promise<void> {
    await this.server.connect(transport);

    Logger.log = (...args: any[]) => {
      this.server.server.sendLoggingMessage({
        level: "info",
        data: args,
      });
      console.log(...args);
    };
    
    Logger.error = (...args: any[]) => {
      this.server.server.sendLoggingMessage({
        level: "error",
        data: args,
      });
      console.error(...args);
    };

    Logger.log("服务器已连接，可以处理请求");
  }
}

// 用于动态导入
export { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"; 