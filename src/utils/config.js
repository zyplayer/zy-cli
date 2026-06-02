const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const {execSync} = require('child_process');

// 配置文件存放在用户主目录 ~/.zy-cli/config.enc
const CONFIG_DIR = path.join(os.homedir(), '.zy-cli');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.enc');

// 用于 PBKDF2 密钥派生的固定参数
const SALT = 'zy-cli-kb-secure-salt-v1';
const KEY_ITERATIONS = 100000;
const KEY_LENGTH = 32; // AES-256

/**
 * 获取机器指纹
 * Windows: MachineGuid 注册表项
 * Linux: /etc/machine-id
 * macOS: IOPlatformUUID 硬件UUID
 */
function getMachineFingerprint() {
    const platform = os.platform();
    try {
        if (platform === 'win32') {
            const output = execSync('reg query HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid', {
                encoding: 'utf-8',
                timeout: 5000
            });
            const match = output.match(/MachineGuid\s+REG_SZ\s+([a-f0-9-]+)/i);
            if (match) {
                return match[1];
            }
        } else if (platform === 'linux') {
            const machineId = fs.readFileSync('/etc/machine-id', 'utf-8').trim();
            if (machineId) {
                return machineId;
            }
            // 有些发行版用 dbus machine-id
            const dbusId = fs.readFileSync('/var/lib/dbus/machine-id', 'utf-8').trim();
            if (dbusId) {
                return dbusId;
            }
        } else if (platform === 'darwin') {
            const output = execSync('ioreg -d2 -c IOPlatformExpertDevice | awk -F\\" \'/IOPlatformUUID/{print $(NF-1)}\'', {
                encoding: 'utf-8',
                shell: true,
                timeout: 5000
            });
            const uuid = output.trim();
            if (uuid) {
                return uuid;
            }
        }
    } catch (e) {
        // 获取失败，降级到兜底方案
    }
    // 兜底：组合多个半固定标识（CPU型号 + 架构 + home目录）
    const cpuModel = os.cpus()[0] ? os.cpus()[0].model : '';
    return cpuModel + '|' + os.arch() + '|' + os.homedir();
}

/**
 * 派生加密密钥（绑定当前机器指纹）
 * 换了机器就无法解密，config.enc 即使被盗走也无法破解
 */
function deriveKey() {
    const fingerprint = getMachineFingerprint();
    return crypto.pbkdf2Sync(fingerprint, SALT, KEY_ITERATIONS, KEY_LENGTH, 'sha512');
}

/**
 * AES-256-GCM 加密，返回格式: iv:authTag:ciphertext（均为 hex）
 */
function encrypt(plaintext) {
    const key = deriveKey();
    const iv = crypto.randomBytes(12); // GCM 推荐 12 字节
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(plaintext, 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

/**
 * AES-256-GCM 解密，输入格式: iv:authTag:ciphertext（均为 hex）
 */
function decrypt(payload) {
    const parts = payload.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
    }
    const key = deriveKey();
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    return decrypted;
}

/**
 * 获取配置
 * 优先级：环境变量 > 加密配置文件
 * 环境变量: ZY_CLI_URL, ZY_CLI_PRIVATE_KEY, ZY_CLI_DEVICE_CODE
 */
function getConfig() {
    // 环境变量优先（CI / 临时使用场景）
    const envUrl = process.env.ZY_CLI_URL;
    const envPrivateKey = process.env.ZY_CLI_PRIVATE_KEY;
    const envDeviceCode = process.env.ZY_CLI_DEVICE_CODE;
    if (envUrl && envPrivateKey && envDeviceCode) {
        return {
            url: envUrl,
            deviceCode: envDeviceCode,
            privateKey: envPrivateKey,
            _source: 'env',
        };
    }
    // 读加密配置文件
    if (!fs.existsSync(CONFIG_PATH)) {
        return {};
    }
    try {
        const encrypted = fs.readFileSync(CONFIG_PATH, 'utf-8');
        const raw = decrypt(encrypted);
        return JSON.parse(raw);
    } catch (err) {
        // 解密失败可能是换了机器，提示用户重新配置
        if (err.code === 'ERR_OSSL_UNSUPPORTED' || err.message.includes('auth') || err.message.includes('Invalid')) {
            console.error('Config decryption failed: machine or user changed, run zy-cli config init again');
        } else {
            console.error('Failed to read config:', err.message);
        }
        return {};
    }
}

/**
 * 保存配置（加密写入，并设置文件权限为仅 owner 可读写）
 */
function saveConfig(config) {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, {recursive: true});
    }
    const raw = JSON.stringify(config, null, 2);
    const encrypted = encrypt(raw);
    fs.writeFileSync(CONFIG_PATH, encrypted);
    // 设置文件权限：仅 owner 可读写（Unix 600，Windows 下静默忽略）
    try {
        if (os.platform() !== 'win32') {
            fs.chmodSync(CONFIG_PATH, 0o600);
            fs.chmodSync(CONFIG_DIR, 0o700);
        }
    } catch (_) {
        // 权限设置失败不影响主流程
    }
}

/**
 * 清除配置
 */
function clearConfig() {
    if (fs.existsSync(CONFIG_PATH)) {
        fs.unlinkSync(CONFIG_PATH);
    }
}

/**
 * 检查配置文件安全性
 */
function checkSecurity() {
    const warnings = [];
    if (!fs.existsSync(CONFIG_PATH)) {
        return warnings;
    }
    // 检查文件权限（仅 Unix）
    if (os.platform() !== 'win32') {
        try {
            const stat = fs.statSync(CONFIG_PATH);
            // mode & 0o077 检查 group/other 是否有任何权限
            if ((stat.mode & 0o077) !== 0) {
                warnings.push('Config file has group/other permissions, run: chmod 600 ' + CONFIG_PATH);
            }
        } catch (_) { /* ignore */
        }
    }
    return warnings;
}

module.exports = {
    CONFIG_DIR,
    CONFIG_PATH,
    getConfig,
    saveConfig,
    clearConfig,
    checkSecurity,
    getMachineFingerprint,
};
