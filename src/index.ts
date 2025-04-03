#!/usr/bin/env node
import { FeishuMcpServer } from "./server.js";
import { resolve } from "path";
import { config } from "dotenv";
import 'dotenv/config';

// 加载.env文件
config({ path: resolve(process.cwd(), ".env") });

// 检查必要的环境变量
if (!process.env.FEISHU_APP_ID || !process.env.FEISHU_APP_SECRET) {
  console.error("错误: 请设置环境变量 FEISHU_APP_ID 和 FEISHU_APP_SECRET");
  console.error("您可以在 .env 文件中配置这些变量，例如：");
  console.error("FEISHU_APP_ID=your_app_id");
  console.error("FEISHU_APP_SECRET=your_app_secret");
  process.exit(1);
}

export async function startServer(): Promise<void> {
  const port = parseInt(process.env.PORT || '7777', 10);
  
  // 创建服务器实例
  const server = new FeishuMcpServer(
    process.env.FEISHU_APP_ID as string,
    process.env.FEISHU_APP_SECRET as string
  );
  
  try {
    // 启动HTTP服务器
    console.log("启动飞书MCP服务器...");
    await server.startHttp(port);
  } catch (error) {
    console.error("服务器启动失败:", error);
    process.exit(1);
  }
}

// 启动服务器
startServer(); 