import axios from 'axios';
import 'dotenv/config';
class FeishuAPI {
    appId;
    appSecret;
    accessToken;
    tokenExpireTime;
    baseUrl;
    constructor() {
        this.appId = process.env.FEISHU_APP_ID || '';
        this.appSecret = process.env.FEISHU_APP_SECRET || '';
        this.accessToken = null;
        this.tokenExpireTime = 0;
        this.baseUrl = 'https://open.feishu.cn/open-apis';
        if (!this.appId || !this.appSecret) {
            console.error('错误: 未配置飞书应用凭证。请在.env文件中设置FEISHU_APP_ID和FEISHU_APP_SECRET。');
        }
    }
    async getAccessToken() {
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
            }
            else {
                throw new Error(`获取飞书Token失败: ${response.data.msg}`);
            }
        }
        catch (error) {
            console.error('获取飞书Token出错:', error instanceof Error ? error.message : String(error));
            throw error;
        }
    }
    async request(method, url, data = null, params = null) {
        const token = await this.getAccessToken();
        try {
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
            if (response.data.code === 0) {
                return response.data.data;
            }
            else {
                throw new Error(`API请求失败: ${response.data.msg}`);
            }
        }
        catch (error) {
            console.error(`请求 ${url} 失败:`, error instanceof Error ? error.message : String(error));
            throw error;
        }
    }
    // 获取文档空间列表
    async getSpaces() {
        return this.request('GET', '/drive/v1/spaces');
    }
    // 获取文档列表
    async getDocuments(spaceId, pageSize = 100, pageToken = '') {
        return this.request('GET', '/drive/v1/files', null, {
            space_id: spaceId,
            page_size: pageSize,
            page_token: pageToken
        });
    }
    // 获取文档内容
    async getDocumentContent(fileToken, fileType) {
        const endpoint = fileType === 'docx'
            ? `/doc/v2/documents/${fileToken}/raw_content`
            : `/sheet/v2/spreadsheets/${fileToken}/values`;
        return this.request('GET', endpoint);
    }
}
export default new FeishuAPI();
