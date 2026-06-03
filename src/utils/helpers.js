/**
 * CLI 命令通用工具函数
 */
const cheerio = require('cheerio');
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

module.exports = {getConfig, request, uploadRequest, buildParams, printResult, handleError, stripHtml};
