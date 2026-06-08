/**
 * CLI 命令通用工具函数
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const axios = require('axios');
const cheerio = require('cheerio');
const MarkdownIt = require('markdown-it');
const {getConfig} = require('./config');
const {request, uploadRequest} = require('./api');

/**
 * 从 commander opts 构建请求参数，映射 option key → API 参数字段
 * @param {object} opts - commander 解析后的 options
 * @param {string[]} fields - API 参数字段名列表
 * @param {object} aliasMap - { apiField: 'optionKey' } 映射（当 option 名≠API 字段名时用）
 */
function buildParams(opts, fields, aliasMap = {}) {
    const params = {};
    fields.forEach((field) => {
        const optKey = aliasMap[field] || field;
        if (opts[optKey] !== undefined && opts[optKey] !== null) {
            params[field] = opts[optKey];
        }
    });
    return params;
}

/**
 * 输出API响应，支持按字段列表过滤data中的字段
 * @param {object} data - API 响应数据
 * @param {string[]} fields - 需要输出的字段名列表，不传则原样输出全部
 */
function printResult(data, fields = []) {
    if (!fields || fields.length === 0) {
        const resp = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        console.log(resp);
        return;
    }
    const output = {};
    if (data.errCode !== undefined) {
        output.errCode = data.errCode;
    }
    if (data.errMsg !== undefined && data.errMsg !== null) {
        output.errMsg = data.errMsg;
    }
    if (data.data !== undefined) {
        if (Array.isArray(data.data)) {
            output.data = data.data.map((item) => filterFields(item, fields));
        } else if (typeof data.data === 'object' && data.data !== null) {
            output.data = filterFields(data.data, fields);
        } else {
            output.data = data.data;
        }
        if (!output.data || (Array.isArray(output.data) && output.data.length === 0)) {
            output.data = undefined;
        }
    }
    console.log(JSON.stringify(output, null, 2));
}

function filterFields(item, fields) {
    const filtered = {};
    fields.forEach((f) => {
        if (item[f] !== undefined) {
            filtered[f] = item[f];
        }
    });
    return filtered;
}

function handleError(err) {
    if (err.code === 'ECONNREFUSED') {
        console.log('连接失败: 无法连接到知识库服务，请检查 URL 配置是否正确');
    } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
        console.log('请求超时: 知识库服务无响应');
    } else if (err.response) {
        const body = typeof err.response.data === 'object' ? JSON.stringify(err.response.data) : err.response.data;
        console.log('HTTP error: ' + err.response.status + ' ' + body);
    } else {
        console.log('Request failed: ' + err.message);
    }
}

// 使用 cheerio 将 HTML 转为纯文本
function stripHtml(html) {
    if (!html) return '';
    return cheerio.load(html).text();
}

/**
 * 从文档内容中提取所有图片引用（本地 / 远程 / data URI）
 * HTML 用 cheerio 解析，Markdown 用 markdown-it 解析
 * @param {string} content - 文档内容
 * @param {number} editorType - 1=HTML 2=Markdown
 * @returns {{originalSrc: string, type: 'local'|'remote'|'data'}[]} 图片引用列表
 */
function extractImages(content, editorType) {
    if (!content) return [];
    const images = [];
    const classify = (src) => {
        if (!src) return null;
        if (/^data:/i.test(src)) return 'data';
        if (/^https?:\/\//i.test(src)) return 'remote';
        return 'local';
    };
    if (editorType === 1) {
        const $ = cheerio.load(content);
        $('img[src]').each((i, el) => {
            const src = $(el).attr('src');
            const type = classify(src);
            if (type) images.push({ originalSrc: src.trim(), type });
        });
    } else if (editorType === 2) {
        const md = new MarkdownIt();
        const tokens = md.parse(content, {});
        walkImageTokens(tokens, images, classify);
    }
    return images;
}

/** 递归遍历 markdown-it token 树，提取 image 类型的 src */
function walkImageTokens(tokens, images, classify) {
    for (const token of tokens) {
        if (token.type === 'inline' && token.children) {
            for (const child of token.children) {
                if (child.type === 'image') {
                    const srcAttr = child.attrs && child.attrs.find(a => a[0] === 'src');
                    if (srcAttr && srcAttr[1]) {
                        const src = srcAttr[1].trim();
                        const type = classify(src);
                        if (type) images.push({ originalSrc: src, type });
                    }
                }
            }
        }
        if (token.children) {
            walkImageTokens(token.children, images, classify);
        }
    }
}

/**
 * 解析本地图片路径：相对路径基于文件所在目录，绝对路径直接返回
 */
function resolveImagePath(imagePath, fileDir) {
    if (!imagePath) return imagePath;
    if (path.isAbsolute(imagePath)) return imagePath;
    return fileDir ? path.resolve(fileDir, imagePath) : path.resolve(imagePath);
}

/**
 * 下载远程图片到临时目录，返回临时文件路径
 * @param {string} url - 远程图片 URL
 * @returns {Promise<string>} 临时文件绝对路径，失败时抛出 Error
 */
async function downloadRemoteImage(url) {
    let urlObj;
    try {
        urlObj = new URL(url);
    } catch (e) {
        throw new Error('图片地址格式无效: ' + url);
    }
    let basename = path.basename(urlObj.pathname) || 'image';
    // 去除查询参数干扰（path.basename 对 ?query 的情况可能不准）
    if (basename.includes('?')) basename = basename.split('?')[0];
    const timestamp = Date.now();
    const ext = path.extname(basename) || '.png';
    const filename = path.basename(basename, ext) + '_' + timestamp + ext;
    const destPath = path.join(os.tmpdir(), filename);
    let response;
    try {
        response = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
    } catch (err) {
        if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') throw new Error('下载超时');
        if (err.code === 'ECONNREFUSED') throw new Error('连接被拒绝');
        if (err.code === 'ENOTFOUND') throw new Error('域名解析失败');
        throw new Error('下载失败: ' + (err.message || '未知错误'));
    }
    if (response.status !== 200) throw new Error('下载失败 HTTP ' + response.status);
    const contentType = response.headers['content-type'] || '';
    if (contentType && !contentType.startsWith('image/')) throw new Error('非图片资源, Content-Type: ' + contentType);
    if (!response.data || response.data.byteLength === 0) throw new Error('下载内容为空');
    fs.writeFileSync(destPath, Buffer.from(response.data));
    return destPath;
}

/**
 * 解码 data URI 写入临时文件，返回临时文件路径
 * @param {string} dataUri - data: URI 字符串
 * @returns {string} 临时文件绝对路径
 */
function decodeDataUri(dataUri) {
    const match = dataUri.match(/^data:([^;,]*)(;base64)?,(.+)$/i);
    if (!match) throw new Error('data URI 格式无效');
    const mimeType = match[1] || 'image/png';
    const isBase64 = match[2] === ';base64';
    const data = match[3];
    const ext = (mimeType.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '');
    const destPath = path.join(os.tmpdir(), 'data_' + Date.now() + '.' + ext);
    const buffer = isBase64 ? Buffer.from(data, 'base64') : Buffer.from(decodeURIComponent(data));
    fs.writeFileSync(destPath, buffer);
    return destPath;
}

/**
 * 从图片 URL 提取文件标识（最后一个 / 后的内容，不含 ? 参数）
 * @param {string} src - 图片 src（本地路径或远程 URL）
 * @returns {string|null}
 */
function extractFileKey(src) {
    if (!src) return null;
    const noQuery = src.split('?')[0];
    const idx = noQuery.lastIndexOf('/');
    const name = idx >= 0 ? noQuery.slice(idx + 1) : noQuery;
    return name || null;
}

/**
 * 批量检测文件是否已在知识库中存在
 * @param {object} config
 * @param {string[]} names - 文件标识列表
 * @returns {Promise<Set<string>>} 已存在的文件标识集合
 */
async function batchCheckFiles(config, names) {
    const uniqueNames = [...new Set(names.filter(Boolean))];
    if (uniqueNames.length === 0) return new Set();
    const result = await request(config, '/openApi/v1/space/page/file/check', { names: uniqueNames });
    if (result && result.errCode === 200 && Array.isArray(result.data)) {
        return new Set(result.data);
    }
    return new Set();
}

/**
 * 并发映射：对每个元素执行 async mapper，最多同时运行 limit 个
 * @param {Array} items - 输入数组
 * @param {Function} mapper - (item) => Promise，对每个元素的异步处理
 * @param {number} limit - 最大并发数，默认 5
 * @returns {Promise<Array>} 与 items 顺序一致的结果数组
 */
async function concurrentMap(items, mapper, limit = 5) {
    limit = Math.max(1, limit);
    if (items.length === 0) return [];
    const results = new Array(items.length);
    let idx = 0;
    let running = 0;
    return new Promise((resolve) => {
        function next() {
            while (running < limit && idx < items.length) {
                const i = idx++;
                running++;
                // 用 Promise.resolve 兜底同步异常，确保 mapper 同步抛错也能走 .catch
                let p;
                try { p = Promise.resolve(mapper(items[i])); }
                catch (e) { p = Promise.reject(e); }
                p.then((r) => {
                    results[i] = r;
                    running--;
                    next();
                }).catch((r) => {
                    results[i] = r;
                    running--;
                    next();
                });
            }
            if (running === 0 && idx >= items.length) {
                resolve(results);
            }
        }
        next();
    });
}

module.exports = {getConfig, request, uploadRequest, buildParams, printResult, handleError, stripHtml, extractImages, resolveImagePath, downloadRemoteImage, decodeDataUri, extractFileKey, batchCheckFiles, concurrentMap};
