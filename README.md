# 飞书云文档 MCP

一个用于拉取飞书云文档并转换为Markdown的MCP服务，可以连接到Cursor、Claude等AI客户端。

## 功能特点

- 支持获取飞书全部云文档空间和文档列表
- 自动将飞书文档转换为Markdown格式
- 按空间分类保存文档
- 支持文档搜索和下载
- 通过MCP协议与AI客户端连接
- 使用内存数据库，无需额外配置

## 什么是MCP

MCP (Model Context Protocol) 是一个革命性的工具，它让我们能够将自己的服务和各种 LLM 客户端（如 Claude、Cursor）无缝连接。它充当一个桥梁，让 AI 能够直接调用我们的服务。

- **MCP 客户端（Client）**：AI 应用程序（如 Claude Desktop 或 Cursor），负责发起请求并与服务器通信
- **MCP 服务器（Server）**：轻量级程序（本项目），负责暴露飞书文档功能，并通过标准化协议与客户端交互

## 安装

### 从源码安装

```bash
# 克隆项目
git clone https://github.com/yourusername/jiang-feishu-mcp.git
cd jiang-feishu-mcp

# 安装依赖
pnpm install

# 编译项目
pnpm run build

# 启动服务
pnpm start

# 设置为全局命令 (可选)
pnpm link --global
```

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

# 保存文档的本地路径 (可选，默认为 ./docs)
DOCS_SAVE_PATH=./docs
```

获取飞书应用凭证的步骤：

1. 访问[飞书开放平台](https://open.feishu.cn/)并登录
2. 创建一个企业自建应用
3. 在应用详情页获取App ID和App Secret
4. 确保开启了云文档相关权限（文档、表格、云空间读取权限）

## 在Cursor中使用

1. 编译项目：`pnpm run build`
2. 复制编译后的路径，例如：`D:\StudyProject\jiang-feishu-mcp\build\index.js`
3. 打开Cursor的设置页面
4. 找到"MCP Server"设置
5. 添加新的MCP Server，填入上面的路径
6. 保存设置

现在，您可以在Cursor中使用以下命令：

- `list-spaces`: 列出所有文档空间
- `list-documents`: 列出所有或指定空间的文档
- `download-document`: 下载特定文档并转换为Markdown
- `download-space-documents`: 下载特定空间的所有文档 
- `search-documents`: 搜索已下载的文档

## 使用内存数据库

本项目使用内存数据库存储文档信息，这意味着：

- 不需要额外安装数据库软件
- 程序重启后数据会重置
- 已下载的Markdown文件会持久保存在磁盘上
- 适合轻量级使用场景

## 技术架构

该项目使用了以下技术：

- Node.js：运行环境
- TypeScript：开发语言
- MCP SDK：实现MCP服务器接口
- 内存数据库：存储文档元数据
- StdioServerTransport：用于与MCP客户端通信
- 动态模块导入：避免路径解析问题

服务器入口文件使用动态导入避免模块路径问题，并通过URL转换确保在不同平台上的兼容性。

## 注意事项

- 应用需要有访问飞书云文档的权限
- 飞书文档格式复杂，转换为Markdown可能会丢失部分格式
- 对于大型文档，下载过程可能需要一定时间
- 服务启动后会自动监听标准输入/输出，不需要配置端口

## 技术栈

- Node.js
- TypeScript
- MCP SDK
- 内存数据库
- 飞书API

## 开发

欢迎贡献代码或提出问题！

## 许可证

MIT 