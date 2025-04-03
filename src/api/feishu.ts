import axios from 'axios';
import 'dotenv/config';

// 定义接口类型
export interface SpaceResponse {
  items: Array<{space_id: string, name: string, description?: string}>;
  page_token?: string;
  has_more: boolean;
}

export interface NodeResponse {
  items: Array<{
    node_token: string, 
    obj_token: string,
    obj_type: string,
    parent_node_token: string,
    space_id: string,
    title: string,
    owner_id: string,
    create_time: string,
    update_time: string
  }>;
  page_token?: string;
  has_more: boolean;
}

export interface DocumentMetaResponse {
  document: {
    document_id: string;
    title: string;
    revision: number;
    create_time: string;
    edit_time: string;
    owner_id: string;
  }
}

export interface DocumentContent {
  content: string;
  title?: string;
  revision: number;
  [key: string]: any;
}

export class FeishuClient {
  private appId: string;
  private appSecret: string;
  private accessToken: string | null;
  private tokenExpireTime: number;
  private baseUrl: string;

  constructor(appId?: string, appSecret?: string) {
    this.appId = appId || process.env.FEISHU_APP_ID || '';
    this.appSecret = appSecret || process.env.FEISHU_APP_SECRET || '';
    this.accessToken = null;
    this.tokenExpireTime = 0;
    this.baseUrl = 'https://open.feishu.cn/open-apis';

    if (!this.appId || !this.appSecret) {
      console.error('错误: 未配置飞书应用凭证。请在.env文件中设置FEISHU_APP_ID和FEISHU_APP_SECRET。');
    }
  }

  async getAccessToken(): Promise<string> {
    // 如果token还有效，直接返回
    if (this.accessToken && Date.now() < this.tokenExpireTime) {
      return this.accessToken;
    }

    try {
      const response = await axios.post(`${this.baseUrl}/auth/v3/tenant_access_token/internal`, {
        app_id: this.appId,
        app_secret: this.appSecret
      });

      if (response.data.code === 0) {
        const token = response.data.tenant_access_token;
        // 存储新token
        this.accessToken = token;
        // 设置过期时间（提前5分钟过期，以防刚好到期）
        this.tokenExpireTime = Date.now() + (response.data.expire * 1000) - (5 * 60 * 1000);
        return token;
      } else {
        throw new Error(`获取飞书Token失败: ${response.data.msg}`);
      }
    } catch (error) {
      console.error('获取飞书Token出错:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async request<T>(method: string, url: string, data: any = null, params: any = null): Promise<T> {
    try {
      const token = await this.getAccessToken();
      
      console.log(`发送请求: ${method} ${this.baseUrl}${url}`);
      console.log('请求参数:', params);
      console.log('请求数据:', data);
      console.log('请求头:', {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8'
      });
      
      const response = await axios({
        method,
        url: `${this.baseUrl}${url}`,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8'
        },
        data,
        params
      });
      
      console.log(`API响应状态码: ${response.status}`);
      
      if (response.data && response.data.code === 0) {
        console.log('API响应成功',response.data);
        return response.data.data as T;
      } else {
        const errorMsg = response.data?.msg || '未知错误';
        const errorCode = response.data?.code || -1;
        console.error(`API请求失败: 错误码 ${errorCode}, 错误信息: ${errorMsg}`);
        throw new Error(`API请求失败: ${errorMsg} (错误码: ${errorCode})`);
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        console.error(`请求 ${url} 失败:`, {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });
      } else {
        console.error(`请求 ${url} 失败:`, error instanceof Error ? error.message : String(error));
      }
      throw error;
    }
  }

  // 获取知识空间列表
  // 权限要求: wiki:wiki 或 wiki:wiki:readonly
  async getSpaces(pageSize = 50, pageToken = ''): Promise<SpaceResponse> {
    try {
      console.log('调用获取知识空间列表API');
      const params: any = { page_size: pageSize };
      if (pageToken) {
        params.page_token = pageToken;
      }
      
      // 使用最新的Wiki V2 API
      return this.request<SpaceResponse>('GET', '/wiki/v2/spaces', null, params);
    } catch (error) {
      console.error('获取知识空间列表失败:', error instanceof Error ? error.message : String(error));
      // 模拟权限不足错误
      if (error instanceof Error && error.message.includes('Access denied')) {
        throw new Error('API权限不足: 需要wiki:wiki或wiki:wiki:readonly权限');
      }
      // 返回空结果而不是直接抛出错误
      return { items: [], has_more: false };
    }
  }

  // 获取知识空间内的节点列表
  // 权限要求: wiki:wiki 或 wiki:wiki:readonly
  async getNodes(spaceId: string, parentNodeToken = '', pageSize = 50, pageToken = ''): Promise<NodeResponse> {
    try {
      console.log(`调用获取节点列表API，空间ID: ${spaceId}`);
      const params: any = { page_size: pageSize };
      
      if (parentNodeToken) {
        params.parent_node_token = parentNodeToken;
      }
      
      if (pageToken) {
        params.page_token = pageToken;
      }
      
      // 使用Wiki V2 API获取节点列表
      return this.request<NodeResponse>('GET', `/wiki/v2/spaces/${spaceId}/nodes`, null, params);
    } catch (error) {
      console.error('获取节点列表失败:', error instanceof Error ? error.message : String(error));
      // 模拟权限不足错误
      if (error instanceof Error && error.message.includes('Access denied')) {
        throw new Error('API权限不足: 需要wiki:wiki或wiki:wiki:readonly权限');
      }
      // 返回空结果而不是直接抛出错误
      return { items: [], has_more: false };
    }
  }
  
  // 获取节点详情
  // 权限要求: wiki:wiki 或 wiki:wiki:readonly
  async getNodeInfo(nodeToken: string): Promise<any> {
    try {
      console.log(`获取节点信息，节点Token: ${nodeToken}`);
      return this.request<any>('GET', `/wiki/v2/spaces/get_node`, null, { node_token: nodeToken });
    } catch (error) {
      console.error('获取节点信息失败:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  // 获取文档元数据
  // 权限要求: docs:document:readonly 或 docs:document
  async getDocumentMeta(documentId: string): Promise<DocumentMetaResponse> {
    try {
      console.log(`获取文档元数据，文档ID: ${documentId}`);
      return this.request<DocumentMetaResponse>('GET', `/doc/v3/documents/${documentId}`);
    } catch (error) {
      console.error('获取文档元数据失败:', error instanceof Error ? error.message : String(error));
      // 模拟权限不足错误
      if (error instanceof Error && error.message.includes('Access denied')) {
        throw new Error('API权限不足: 需要docs:document:readonly或docs:document权限');
      }
      throw error;
    }
  }

  // 获取文档内容
  // 权限要求: docs:document:readonly 或 docs:document
  async getDocumentContent(documentId: string): Promise<DocumentContent> {
    try {
      console.log(`获取文档内容，文档ID: ${documentId}`);
      return this.request<DocumentContent>('GET', `/doc/v3/documents/${documentId}/raw_content`);
    } catch (error) {
      console.error('获取文档内容失败:', error instanceof Error ? error.message : String(error));
      // 模拟权限不足错误
      if (error instanceof Error && error.message.includes('Access denied')) {
        throw new Error('API权限不足: 需要docs:document:readonly或docs:document权限');
      }
      // 返回空内容而不是直接抛出错误
      return { content: '', revision: 0 };
    }
  }
  
  // 根据不同的文档类型获取内容
  // 权限要求: 取决于文档类型，通常需要相应的readonly权限
  async getContentByType(objToken: string, objType: string): Promise<DocumentContent> {
    try {
      console.log(`获取内容，Token: ${objToken}, 类型: ${objType}`);
      
      switch (objType.toLowerCase()) {
        case 'doc':
          return this.getDocumentContent(objToken);
        case 'sheet':
          // Sheet API 实现
          throw new Error('暂不支持获取电子表格内容');
        case 'bitable':
          // Bitable API 实现
          throw new Error('暂不支持获取多维表格内容');
        default:
          throw new Error(`不支持的文档类型: ${objType}`);
      }
    } catch (error) {
      console.error('获取内容失败:', error instanceof Error ? error.message : String(error));
      return { content: '', revision: 0 };
    }
  }
  
  // 下载Wiki节点的文档内容
  // 需要多个权限: wiki:wiki:readonly 和 docs:document:readonly
  async downloadWikiDocument(nodeToken: string): Promise<{ content: string; title: string }> {
    try {
      console.log(`下载Wiki文档，节点Token: ${nodeToken}`);
      
      // 1. 先获取节点信息，获取obj_token和obj_type
      const nodeInfo = await this.getNodeInfo(nodeToken);
      
      if (!nodeInfo || !nodeInfo.node) {
        throw new Error(`未找到节点信息: ${nodeToken}`);
      }
      
      const { obj_token, obj_type, title } = nodeInfo.node;
      
      if (!obj_token || !obj_type) {
        throw new Error(`节点信息不完整: ${nodeToken}`);
      }
      
      // 2. 根据obj_type获取文档内容
      const contentResponse = await this.getContentByType(obj_token, obj_type);
      const content = contentResponse.content || '';
      
      return { content, title: title || '未命名文档' };
    } catch (error) {
      console.error('下载Wiki文档出错:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
  
  // 下载知识空间内所有文档
  // 需要多个权限: wiki:wiki:readonly 和 docs:document:readonly
  async downloadSpaceDocuments(spaceId: string): Promise<{ downloaded: number; total: number; failed: number }> {
    try {
      console.log(`下载知识空间文档，知识空间ID: ${spaceId}`);
      
      // 获取知识空间内所有节点
      let allNodes: any[] = [];
      let pageToken = '';
      let hasMore = true;
      
      while (hasMore) {
        const response = await this.getNodes(spaceId, '', 100, pageToken);
        allNodes = [...allNodes, ...(response.items || [])];
        pageToken = response.page_token || '';
        hasMore = response.has_more || false;
        
        // 避免无限循环
        if (!pageToken) {
          break;
        }
      }
      
      console.log(`找到 ${allNodes.length} 个节点`);
      
      // 只保留文档类型的节点
      const docNodes = allNodes.filter(node => 
        node.obj_type === 'doc' || node.obj_type === 'sheet' || node.obj_type === 'bitable'
      );
      
      console.log(`其中有 ${docNodes.length} 个文档节点`);
      
      let downloaded = 0;
      let failed = 0;
      
      // 逐个下载文档
      for (const node of docNodes) {
        try {
          await this.downloadWikiDocument(node.node_token);
          downloaded++;
        } catch (error) {
          console.error(`下载文档 ${node.title} 失败:`, error instanceof Error ? error.message : String(error));
          failed++;
        }
      }
      
      return { downloaded, total: docNodes.length, failed };
    } catch (error) {
      console.error('下载知识空间文档出错:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
  
  // 搜索Wiki知识库
  // 权限要求: wiki:wiki:readonly
  async searchWiki(keyword: string, spaceId?: string): Promise<any> {
    try {
      console.log(`搜索Wiki，关键词: ${keyword}`);
      
      const params: any = { 
        query: keyword,
        page_size: 20 
      };
      
      if (spaceId) {
        params.space_id = spaceId;
      }
      
      return this.request<any>('GET', '/wiki/v2/search', null, params);
    } catch (error) {
      console.error('搜索Wiki失败:', error instanceof Error ? error.message : String(error));
      // 模拟权限不足错误
      if (error instanceof Error && error.message.includes('Access denied')) {
        throw new Error('API权限不足: 需要wiki:wiki:readonly权限');
      }
      return { items: [] };
    }
  }
}

export default new FeishuClient(); 