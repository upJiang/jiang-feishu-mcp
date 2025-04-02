declare module '@modelcontextprotocol/sdk' {
  export interface McpServerOptions {
    name: string;
    version: string;
    [key: string]: any;
  }

  export interface McpTool<T = any> {
    (params: T): Promise<{
      content: Array<{
        type: string;
        text: string;
        [key: string]: any;
      }>;
      [key: string]: any;
    }>;
  }

  export interface McpServer {
    connect(transport: any): Promise<void>;
    
    tool<T = any>(
      name: string, 
      schema: Record<string, any>, 
      handler: McpTool<T>
    ): void;
  }

  export function createMcpServer(options: McpServerOptions): McpServer;
  
  export class StdioServerTransport {
    constructor();
  }
}

// 为dist路径添加相同的类型定义
declare module '@modelcontextprotocol/sdk/dist/server/index.js' {
  export * from '@modelcontextprotocol/sdk';
}

declare module '@modelcontextprotocol/sdk/dist/server/stdio.js' {
  export * from '@modelcontextprotocol/sdk';
} 