#!/usr/bin/env node

import 'dotenv/config';
import fs from 'fs-extra';
import path from 'path';
import http from 'http';
import { AddressInfo } from 'net';
import axios from 'axios';

// 创建docs目录
const docsPath = process.env.DOCS_SAVE_PATH || './docs';
fs.ensureDirSync(docsPath);

// 检查环境变量
if (!process.env.FEISHU_APP_ID || !process.env.FEISHU_APP_SECRET) {
  console.error('错误: 未配置飞书应用凭证。');
  console.error('请创建 .env 文件并填写 FEISHU_APP_ID 和 FEISHU_APP_SECRET。');
  console.error('可以从 .env.example 文件复制一份模板。');
  process.exit(1);
}

// 创建SSE连接集合
const sseClients = new Set<http.ServerResponse>();

// 发送SSE事件
function sendSseEvent(res: http.ServerResponse, event: string, data: any) {
  const dataStr = typeof data === 'object' ? JSON.stringify(data) : data;
  res.write(`event: ${event}\ndata: ${dataStr}\n\n`);
}

// 飞书API客户端
class FeishuClient {
  private appId: string;
  private appSecret: string;
  private accessToken: string = '';
  private tokenExpireTime: number = 0;

  constructor(appId: string, appSecret: string) {
    this.appId = appId;
    this.appSecret = appSecret;
  }

  // 获取访问令牌
  async getAccessToken(): Promise<string> {
    // 如果令牌有效，直接返回
    if (this.accessToken && Date.now() < this.tokenExpireTime) {
      return this.accessToken;
    }

    // 获取新令牌
    try {
      const response = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
        app_id: this.appId,
        app_secret: this.appSecret
      });

      if (response.data.code === 0) {
        this.accessToken = response.data.tenant_access_token;
        // 令牌有效期通常为2小时，提前5分钟过期
        this.tokenExpireTime = Date.now() + (response.data.expire - 300) * 1000;
        return this.accessToken;
      } else {
        throw new Error(`获取飞书访问令牌失败: ${response.data.msg}`);
      }
    } catch (error) {
      console.error('获取飞书访问令牌出错:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  // 列出所有文档空间
  async listSpaces(): Promise<any[]> {
    try {
      const token = await this.getAccessToken();
      const response = await axios.get('https://open.feishu.cn/open-apis/wiki/v2/spaces', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8'
        }
      });

      if (response.data.code === 0) {
        return response.data.data.items || [];
      } else {
        throw new Error(`获取文档空间列表失败: ${response.data.msg}`);
      }
    } catch (error) {
      console.error('获取文档空间列表出错:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  // 列出空间内的文档
  async listDocuments(spaceId?: string): Promise<any[]> {
    try {
      const token = await this.getAccessToken();
      
      // 如果没有提供spaceId，先获取所有空间
      if (!spaceId) {
        const spaces = await this.listSpaces();
        if (spaces.length === 0) {
          return [];
        }
        // 使用第一个空间
        spaceId = spaces[0].space_id;
      }
      
      const url = `https://open.feishu.cn/open-apis/wiki/v2/spaces/${spaceId}/nodes`;
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8'
        }
      });

      if (response.data.code === 0) {
        return response.data.data.items || [];
      } else {
        throw new Error(`获取文档列表失败: ${response.data.msg}`);
      }
    } catch (error) {
      console.error('获取文档列表出错:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
  
  // 下载文档
  async downloadDocument(fileToken: string): Promise<{ content: string; title: string }> {
    try {
      const token = await this.getAccessToken();
      
      // 首先获取文档元数据
      const metaUrl = `https://open.feishu.cn/open-apis/doc/v2/documents/${fileToken}`;
      const metaResponse = await axios.get(metaUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (metaResponse.data.code !== 0) {
        throw new Error(`获取文档元数据失败: ${metaResponse.data.msg}`);
      }
      
      const title = metaResponse.data.data.document?.title || '未命名文档';
      
      // 获取文档内容
      const contentUrl = `https://open.feishu.cn/open-apis/doc/v2/documents/${fileToken}/raw_content`;
      const contentResponse = await axios.get(contentUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (contentResponse.data.code !== 0) {
        throw new Error(`获取文档内容失败: ${contentResponse.data.msg}`);
      }
      
      // 保存文档内容到文件
      const content = contentResponse.data.data.content || '';
      const fileName = `${title.replace(/[\\/:*?"<>|]/g, '_')}.md`;
      const filePath = path.join(docsPath, fileName);
      
      fs.writeFileSync(filePath, content, 'utf8');
      
      return { content, title };
    } catch (error) {
      console.error('下载文档出错:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
  
  // 下载空间内所有文档
  async downloadSpaceDocuments(spaceId: string): Promise<{ downloaded: number; total: number; failed: number }> {
    try {
      // 获取空间内所有文档
      const documents = await this.listDocuments(spaceId);
      let downloaded = 0;
      let failed = 0;
      
      // 创建空间文件夹
      const spaceFolderName = `space_${spaceId}`;
      const spaceFolderPath = path.join(docsPath, spaceFolderName);
      fs.ensureDirSync(spaceFolderPath);
      
      // 依次下载每个文档
      for (const doc of documents) {
        try {
          const result = await this.downloadDocument(doc.node_token);
          const fileName = `${result.title.replace(/[\\/:*?"<>|]/g, '_')}.md`;
          const filePath = path.join(spaceFolderPath, fileName);
          
          fs.writeFileSync(filePath, result.content, 'utf8');
          downloaded++;
        } catch (error) {
          console.error(`下载文档 ${doc.title} 失败:`, error instanceof Error ? error.message : String(error));
          failed++;
        }
      }
      
      return { downloaded, total: documents.length, failed };
    } catch (error) {
      console.error('下载空间文档出错:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
  
  // 搜索已下载的文档
  async searchDocuments(keyword: string): Promise<Array<{ title: string; path: string; matches: string[] }>> {
    if (!keyword) {
      throw new Error('搜索关键词不能为空');
    }
    
    const results: Array<{ title: string; path: string; matches: string[] }> = [];
    
    // 递归搜索文件
    const searchInDir = (dirPath: string) => {
      const files = fs.readdirSync(dirPath);
      
      for (const file of files) {
        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // 递归搜索子目录
          searchInDir(fullPath);
        } else if (file.endsWith('.md')) {
          // 搜索Markdown文件
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');
            const matches: string[] = [];
            
            // 查找包含关键词的行
            for (const line of lines) {
              if (line.toLowerCase().includes(keyword.toLowerCase())) {
                // 提取匹配行的上下文（最多150个字符）
                const start = Math.max(0, line.toLowerCase().indexOf(keyword.toLowerCase()) - 50);
                const context = line.substring(start, start + 150) + (start + 150 < line.length ? '...' : '');
                matches.push(context);
                
                // 最多返回5个匹配项
                if (matches.length >= 5) break;
              }
            }
            
            if (matches.length > 0) {
              // 从文件名中提取标题
              const title = path.basename(file, '.md');
              results.push({
                title,
                path: fullPath,
                matches
              });
            }
          } catch (error) {
            console.error(`搜索文件 ${fullPath} 时出错:`, error instanceof Error ? error.message : String(error));
          }
        }
      }
    };
    
    // 开始搜索
    searchInDir(docsPath);
    
    return results;
  }
}

// 创建飞书客户端实例
const feishuClient = new FeishuClient(
  process.env.FEISHU_APP_ID as string,
  process.env.FEISHU_APP_SECRET as string
);

// 创建一个简单的HTTP服务器
const server = http.createServer((req, res) => {
  // 设置CORS头，允许跨域请求
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理OPTIONS请求（预检请求）
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // 添加HTTP请求日志
  console.log(`收到HTTP请求: ${req.method} ${req.url} 来自 ${req.socket.remoteAddress}:${req.socket.remotePort}`);

  // 处理根路径请求
  if (req.url === '/' || req.url === '') {
    console.log('提供根路径页面');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>飞书云文档MCP服务器</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
          h1 { color: #333; }
          .info { background-color: #f8f8f8; padding: 20px; border-radius: 5px; }
          .success { color: green; }
        </style>
      </head>
      <body>
        <h1>飞书云文档MCP服务器</h1>
        <div class="info">
          <p><span class="success">✓</span> 服务器运行中</p>
          <p>请在Cursor中配置使用地址: <strong>http://localhost:${process.env.MCP_PORT || 3001}/mcp</strong></p>
          <p>本服务器提供以下功能:</p>
          <ul>
            <li>获取飞书文档空间列表</li>
            <li>获取文档列表</li>
            <li>下载文档</li>
            <li>搜索文档</li>
          </ul>
        </div>
      </body>
      </html>
    `);
  } else if (req.url === '/mcp') {
    console.log(`接收到MCP请求: ${req.method}`);
    // 提供MCP服务端点
    if (req.method === 'GET') {
      // 设置SSE连接头
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no' // 禁用Nginx缓冲
      });
      
      // 发送SSE保持连接的心跳包
      let heartbeatTimer: NodeJS.Timeout;
      const heartbeat = () => {
        if (sseClients.has(res)) {
          // 发送注释行作为心跳，保持连接
          res.write(': heartbeat\n\n');
        }
      };

      // 设置心跳间隔（每30秒）
      heartbeatTimer = setInterval(heartbeat, 30010);
      
      // 发送初始连接消息
      sendSseEvent(res, 'connected', { status: 'ok', message: '已连接到飞书云文档MCP服务器' });
      
      // 将客户端添加到集合中
      sseClients.add(res);
      
      // 处理客户端断开连接
      req.on('close', () => {
        sseClients.delete(res);
        clearInterval(heartbeatTimer);
        console.log('客户端断开连接，当前连接数:', sseClients.size);
      });
      
      console.log('新的SSE客户端连接，当前连接数:', sseClients.size);
      
      // 注意：此处不结束响应，保持连接打开
    } else if (req.method === 'POST') {
      // 处理POST请求，处理MCP协议
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        try {
          const request = JSON.parse(body);
          console.log('收到MCP请求:', JSON.stringify(request, null, 2));
          
          // 根据请求类型返回不同的响应
          if (request.method === 'initialize') {
            // 初始化请求
            console.log('处理initialize请求');
            const response = {
              jsonrpc: "2.0",
              result: {
                name: "飞书云文档MCP",
                version: "1.0.0",
                capabilities: {
                  tools: [
                    {
                      name: "list-spaces",
                      description: "列出所有可用的飞书文档空间",
                      parameters: {}
                    },
                    {
                      name: "list-documents",
                      description: "列出指定空间或所有空间的文档",
                      parameters: {
                        spaceId: {
                          type: "string",
                          description: "可选，指定文档空间ID"
                        }
                      }
                    },
                    {
                      name: "download-document",
                      description: "下载并保存指定文档",
                      parameters: {
                        fileToken: {
                          type: "string",
                          description: "文档的fileToken"
                        }
                      }
                    },
                    {
                      name: "download-space-documents",
                      description: "下载指定空间的所有文档",
                      parameters: {
                        spaceId: {
                          type: "string",
                          description: "文档空间ID"
                        }
                      }
                    },
                    {
                      name: "search-documents",
                      description: "搜索已下载的文档",
                      parameters: {
                        keyword: {
                          type: "string",
                          description: "搜索关键词"
                        }
                      }
                    }
                  ]
                }
              },
              id: request.id
            };
            
            console.log('发送initialize响应:', JSON.stringify(response, null, 2));
            
            // 向所有SSE客户端广播响应
            for (const client of sseClients) {
              try {
                sendSseEvent(client, 'response', response);
              } catch (err) {
                console.error('发送SSE事件出错:', err instanceof Error ? err.message : String(err));
              }
            }
            
            // 同时也通过POST请求直接响应
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));
          } else if (request.method === 'run_tool') {
            // 工具执行请求
            const toolName = request.params.name;
            const parameters = request.params.parameters;
            console.log(`执行工具: ${toolName}`, parameters);
            
            // 执行工具并获取响应
            const toolResult = await handleToolExecution(toolName, parameters);
            
            // 构建响应
            const response = {
              jsonrpc: "2.0",
              result: toolResult,
              id: request.id
            };
            
            // 向所有SSE客户端广播响应
            for (const client of sseClients) {
              sendSseEvent(client, 'response', response);
            }
            
            // 同时也通过POST请求直接响应
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));
          } else {
            // 未知方法
            const response = {
              jsonrpc: "2.0",
              error: {
                code: -32601,
                message: "Method not found",
                data: {
                  method: request.method
                }
              },
              id: request.id
            };
            
            // 向所有SSE客户端广播响应
            for (const client of sseClients) {
              sendSseEvent(client, 'error', response);
            }
            
            // 同时也通过POST请求直接响应
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));
          }
        } catch (error) {
          console.error('处理请求时出错:', error instanceof Error ? error.message : String(error));
          
          const errorResponse = {
            jsonrpc: "2.0",
            error: {
              code: -32700,
              message: "Parse error",
              data: {
                details: error instanceof Error ? error.message : String(error)
              }
            },
            id: null
          };
          
          // 向所有SSE客户端广播错误
          for (const client of sseClients) {
            sendSseEvent(client, 'error', errorResponse);
          }
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(errorResponse));
        }
      });
    } else {
      // 返回标准JSON-RPC错误响应而不是405
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32600,
          message: "Invalid Request",
          data: {
            method: req.method
          }
        },
        id: null
      }));
    }
  } else if (req.url === '/health') {
    // 添加健康检查端点
    console.log('健康检查请求');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      uptime: process.uptime(),
      sse_clients: sseClients.size,
      timestamp: new Date().toISOString()
    }));
  } else {
    console.log(`未找到路径: ${req.url}`);
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '未找到请求的资源' }));
  }
});

// 处理工具执行
async function handleToolExecution(toolName: string, parameters: any) {
  try {
    switch (toolName) {
      case 'list-spaces':
        const spaces = await feishuClient.listSpaces();
        return {
          content: [
            {
              type: "text",
              text: `找到 ${spaces.length} 个文档空间:\n\n` + 
                spaces.map((space, index) => 
                  `${index + 1}. ${space.name} (ID: ${space.space_id})`
                ).join('\n')
            }
          ]
        };
        
      case 'list-documents':
        const spaceId = parameters?.spaceId;
        const documents = await feishuClient.listDocuments(spaceId);
        return {
          content: [
            {
              type: "text",
              text: `找到 ${documents.length} 个文档:\n\n` + 
                documents.map((doc, index) => 
                  `${index + 1}. ${doc.title} (ID: ${doc.node_token})`
                ).join('\n')
            }
          ]
        };
        
      case 'download-document':
        const fileToken = parameters?.fileToken;
        if (!fileToken) {
          throw new Error('缺少必要参数: fileToken');
        }
        
        const downloadResult = await feishuClient.downloadDocument(fileToken);
        return {
          content: [
            {
              type: "text",
              text: `文档 "${downloadResult.title}" 已下载并保存为Markdown文件。\n文件保存在: ${path.join(docsPath, downloadResult.title.replace(/[\\/:*?"<>|]/g, '_') + '.md')}`
            }
          ]
        };
        
      case 'download-space-documents':
        const downloadSpaceId = parameters?.spaceId;
        if (!downloadSpaceId) {
          throw new Error('缺少必要参数: spaceId');
        }
        
        const downloadSpaceResult = await feishuClient.downloadSpaceDocuments(downloadSpaceId);
        return {
          content: [
            {
              type: "text",
              text: `已成功下载 ${downloadSpaceResult.downloaded} 个文档 (总共 ${downloadSpaceResult.total} 个)。\n${downloadSpaceResult.failed > 0 ? `下载失败: ${downloadSpaceResult.failed} 个` : ''}\n文件保存在: ${path.join(docsPath, 'space_' + downloadSpaceId)}`
            }
          ]
        };
        
      case 'search-documents':
        const keyword = parameters?.keyword;
        if (!keyword) {
          throw new Error('缺少必要参数: keyword');
        }
        
        const searchResults = await feishuClient.searchDocuments(keyword);
        
        if (searchResults.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `未找到包含关键词 "${keyword}" 的文档。请先下载文档，然后再搜索。`
              }
            ]
          };
        }
        
        let resultText = `找到 ${searchResults.length} 个包含关键词 "${keyword}" 的文档:\n\n`;
        
        searchResults.forEach((result, index) => {
          resultText += `${index + 1}. ${result.title}\n`;
          resultText += `   文件路径: ${result.path}\n`;
          resultText += `   匹配内容:\n`;
          
          result.matches.forEach((match, mIdx) => {
            resultText += `     ${mIdx + 1}) ${match}\n`;
          });
          
          resultText += '\n';
        });
        
        return {
          content: [
            {
              type: "text",
              text: resultText
            }
          ]
        };
        
      default:
        return {
          content: [
            {
              type: "text",
              text: `工具 "${toolName}" 尚未实现。`
            }
          ]
        };
    }
  } catch (error) {
    console.error(`执行工具 ${toolName} 时出错:`, error instanceof Error ? error.message : String(error));
    return {
      content: [
        {
          type: "text",
          text: `执行工具时出错: ${error instanceof Error ? error.message : String(error)}`
        }
      ]
    };
  }
}

// 默认端口为3001，但也可以通过环境变量设置
const port = parseInt(process.env.MCP_PORT || '3001', 10);

// 启动HTTP服务器，明确显示所有可用地址
server.listen(port, '0.0.0.0', () => {
  const address = server.address() as AddressInfo;
  console.log('---------------------------------------');
  console.log(`飞书云文档MCP HTTP服务器已启动在端口 ${address.port}`);
  console.log('可用的服务器地址:');
  console.log(`- http://localhost:${address.port}/mcp`);
  console.log(`- http://127.0.0.1:${address.port}/mcp`);
  try {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        // 跳过内部IPv6地址和非IPv4地址
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`- http://${net.address}:${address.port}/mcp`);
        }
      }
    }
  } catch (error) {
    console.error('获取网络接口信息出错:', error instanceof Error ? error.message : String(error));
  }
  console.log('---------------------------------------');
  console.log('请在浏览器中访问以下地址测试服务器:');
  console.log(`- http://localhost:${address.port}`);
  console.log(`- http://localhost:${address.port}/health`);
  console.log('---------------------------------------');
});

// 处理服务器错误
server.on('error', (error) => {
  console.error('HTTP服务器错误:', error instanceof Error ? error.message : String(error));
  if ((error as any).code === 'EADDRINUSE') {
    console.error(`端口 ${port} 已被占用，请尝试通过环境变量 MCP_PORT 设置其他端口`);
  }
  process.exit(1);
});

// 处理进程关闭信号
process.on('SIGINT', () => {
  console.log('接收到中断信号，正在关闭服务器...');
  server.close();
  process.exit(0);
}); 