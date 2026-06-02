const axios = require('axios');
const crypto = require('crypto');

/**
 * 开放API请求客户端
 * 签名方式：SHA256withRSA（对应 Java: SignAlgorithm.SHA256withRSA）
 */

/**
 * 生成随机 salt（模拟 Java 端 IdUtils.objectId()）
 */
function generateSalt() {
    return crypto.randomBytes(12).toString('hex');
}

/**
 * Base64 密钥转换为 PEM 格式
 * 自动识别 PKCS1/PKCS8 格式
 */
function toPEM(base64Key) {
    const raw = base64Key.replace(/\s/g, '');
    // PKCS1 格式：MII 开头 → BEGIN RSA PRIVATE KEY
    if (raw.startsWith('MII')) {
        const lines = raw.match(/.{1,64}/g).join('\n');
        return '-----BEGIN RSA PRIVATE KEY-----\n' + lines + '\n-----END RSA PRIVATE KEY-----';
    }
    // PKCS8 格式：MIG/MII 开头 → BEGIN PRIVATE KEY
    const lines = raw.match(/.{1,64}/g).join('\n');
    return '-----BEGIN PRIVATE KEY-----\n' + lines + '\n-----END PRIVATE KEY-----';
}

/**
 * SHA256withRSA 签名
 * privateKey 可能是 PEM 格式（本地生成）或 base64 编码的 PKCS1/PKCS8
 */
function rsaSign(privateKey, content) {
    const pemKey = privateKey.startsWith('-----') ? privateKey : toPEM(privateKey);
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(content);
    return sign.sign(pemKey, 'hex');
}

/**
 * 发送开放API请求
 * @param {object} config - { url, deviceCode, privateKey } 来自 getConfig()
 * @param {string} path  - API 路径，如 /openApi/v1/space/list
 * @param {object} params - 请求参数（salt 会自动注入）
 * @returns {Promise<object>} 响应数据
 */
async function request(config, path, params = {}) {
    // 注入 salt
    const fullParams = {salt: generateSalt(), ...params};
    // 序列化
    const content = JSON.stringify(fullParams);
    // SHA256withRSA 签名
    const encrypt = rsaSign(config.privateKey, content);
    // 构造表单
    const form = new URLSearchParams();
    form.append('content', content);
    form.append('encrypt', encrypt);
    form.append('deviceCode', config.deviceCode);
    // 发送 POST
    const url = config.url + path;
    const res = await axios.post(url, form.toString(), {
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        timeout: 15000,
    });
    return res.data;
}

/**
 * 构建签名载荷（不发送请求，返回 {content, encrypt} 供 upload 等场景复用）
 */
function signContent(config, params = {}) {
    const fullParams = {salt: generateSalt(), ...params};
    const content = JSON.stringify(fullParams);
    const encrypt = rsaSign(config.privateKey, content);
    return {content, encrypt};
}

/**
 * 文件上传请求（multipart/form-data）
 */
async function uploadRequest(config, path, params = {}, filePath) {
    const fs = require('fs');
    const {content, encrypt} = signContent(config, params);
    const FormData = require('form-data');
    const form = new FormData();
    form.append('content', content);
    form.append('encrypt', encrypt);
    form.append('deviceCode', config.deviceCode);
    form.append('key', config.deviceCode);
    form.append('files', fs.createReadStream(filePath));
    const url = config.url + path;
    const res = await axios.post(url, form, {
        headers: form.getHeaders(),
        timeout: 60000,
    });
    return res.data;
}

module.exports = {request, uploadRequest, signContent, generateSalt};
