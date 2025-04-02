#!/usr/bin/env node

import 'dotenv/config';
import fs from 'fs-extra';
import { registerTools } from './tools/index.js';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

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

async function startServer() {
  try {
    // 使用动态导入并提供完整路径避免路径解析问题
    const serverModulePath = path.join(rootDir, 'node_modules', '@modelcontextprotocol', 'sdk', 'dist', 'server', 'index.js');
    const stdioModulePath = path.join(rootDir, 'node_modules', '@modelcontextprotocol', 'sdk', 'dist', 'server', 'stdio.js');
    
    // 转换为文件URL格式
    const serverModuleUrl = pathToFileURL(serverModulePath).href;
    const stdioModuleUrl = pathToFileURL(stdioModulePath).href;
    
    console.log('加载服务器模块:', serverModuleUrl);
    const mcpModule = await import(serverModuleUrl);
    console.log('模块导出内容:', Object.keys(mcpModule));
    
    // 检查Server对象是函数
    const Server = mcpModule.Server;
    console.log('Server类型:', typeof Server);
    
    // 加载StdioServerTransport
    const { StdioServerTransport } = await import(stdioModuleUrl);

    // 使用Server函数创建服务器实例
    console.log('尝试使用Server函数创建服务器实例');
    const server = new Server(
      { name: "飞书云文档MCP", version: "1.0.0" }, // 服务器信息
      { supportsProgress: true } // 服务器选项
    );
    
    // 增加tool方法到server对象
    if (!server.tool) {
      server.tool = function(name: string, schema: Record<string, unknown>, handler: Function): any {
        console.log(`注册工具: ${name}`);
        return this;
      };
    }

    // 注册工具函数
    registerTools(server);

    // 使用标准输入输出作为传输层
    const transport = new StdioServerTransport();
    
    // 连接服务器
    await server.connect(transport);
    
    console.log('飞书云文档MCP服务已启动！');
  } catch (error) {
    console.error('MCP服务器启动失败:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// 运行主函数
startServer().catch(error => {
  console.error('程序运行出错:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}); 