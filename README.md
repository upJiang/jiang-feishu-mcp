# 飞书文档 MCP

一个用于连接飞书文档的Model Context Protocol (MCP) 服务，可以在Cursor等AI客户端中直接访问飞书文档空间和文档列表。

## 功能特点

- 支持获取飞书全部云文档空间列表
- 支持获取指定空间的文档列表
- 通过MCP协议与AI客户端无缝连接

## 什么是MCP

MCP (Model Context Protocol) 是一个将自定义服务与各种LLM客户端（如Claude、Cursor）无缝连接的协议。它允许AI直接调用和使用我们的服务功能。

- **MCP客户端**：AI应用程序（如Claude Desktop或Cursor），负责发起请求并与服务器通信
- **MCP服务器**：本项目，暴露飞书文档功能，通过标准化协议与客户端交互

## 安装与运行

### 从源码安装

```bash
# 克隆项目
git clone https://github.com/yourusername/jiang-feishu-mcp.git
cd jiang-feishu-mcp

# 安装依赖
pnpm install

# 启动服务
pnpm start
```

服务器将在本地7777端口启动。

## 配置

在使用前，您需要创建一个`.env`文件配置飞书应用凭证：

```bash
# 复制示例配置文件
cp .env.example .env
```

然后编辑`.env`文件，填入您的飞书应用凭证：

```
FEISHU_APP_ID=your_app_id_here
FEISHU_APP_SECRET=your_app_secret_here

# 可选：设置端口号 (默认为7777)
PORT=7777

# 可选：设置文档保存路径 (默认为 ./docs)
DOCS_SAVE_PATH=./docs
```

获取飞书应用凭证的步骤：

1. 访问[飞书开放平台](https://open.feishu.cn/)并登录
2. 创建一个企业自建应用
3. 在应用详情页获取App ID和App Secret
4. 确保开启了云文档相关权限（文档、表格、云空间读取权限）

## 在Cursor中使用

1. 启动服务器：`pnpm start`
2. 打开Cursor的设置页面
3. 找到"Model Context Protocol"设置
4. 添加新的MCP Server，URL填入：`http://localhost:7777/mcp`
5. 保存设置

现在，您可以在Cursor中使用以下工具：

- `list-spaces`: 列出所有文档空间
- `list-documents`: 列出所有或指定空间的文档

## 示例用法

在Cursor中，您可以这样使用MCP工具：

```
请列出我所有的飞书文档空间
```

```
请列出空间ID为"XYZ123"中的所有文档
```

## 技术架构

该项目使用了以下技术：

- Node.js 和 TypeScript：开发环境
- MCP SDK：实现MCP服务器接口
- Express：提供HTTP服务
- 飞书开放API：访问飞书文档内容

## 注意事项

- 应用需要有访问飞书云文档的权限

## 许可证

MIT 