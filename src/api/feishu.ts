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
}

