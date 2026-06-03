const inquirer = require('inquirer');
const crypto = require('crypto');
const os = require('os');
const axios = require('axios');
const {getConfig, saveConfig, clearConfig, checkSecurity, CONFIG_PATH} = require('../utils/config');
const pkg = require('../../package.json');

/**
 * zy-cli config —— 管理知识库连接配置
 *     zy-cli config init     设备码绑定初始化
 *     zy-cli config show     查看当前配置
 *     zy-cli config clear    清除配置
 */
module.exports = function (program) {
    const configCmd = program.command('config')
        .description('管理知识库连接配置');

    // config init —— 设备码绑定初始化
    configCmd.command('init')
        .description('设备码绑定初始化')
        .action(async () => {
            const existing = getConfig();
            if (existing.url) {
                console.log('当前已有配置：');
                console.log('         URL： ' + existing.url);
                console.log('  设备绑定码： ' + (existing.deviceCode || '(无)'));
                console.log('');
                const {overwrite} = await inquirer.prompt([
                    {type: 'confirm', name: 'overwrite', message: '已有配置，是否覆盖？', default: false},
                ]);
                if (!overwrite) {
                    console.log('已取消。');
                    return;
                }
                console.log('');
            }
            // 1. 输入知识库 URL
            const {url} = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'url',
                    message: '知识库 URL：',
                    default: existing.url || '',
                    validate: (input) => {
                        if (!input.trim()) return 'URL 不能为空';
                        return true;
                    },
                },
            ]);
            const baseUrl = url.trim().replace(/\/+$/, '');
            // 2. 生成 RSA 密钥对
            console.log('正在生成本地密钥对...');
            const {privateKey, publicKey: publicKeyPem} = crypto.generateKeyPairSync('rsa', {
                modulusLength: 2048,
                publicKeyEncoding: {type: 'spki', format: 'pem'},
                privateKeyEncoding: {type: 'pkcs8', format: 'pem'},
            });
            // 去掉PEM头尾和换行，转为纯base64（DER格式），后端只认这种格式
            const publicKey = publicKeyPem
                .replace('-----BEGIN PUBLIC KEY-----', '')
                .replace('-----END PUBLIC KEY-----', '')
                .replace(/\s/g, '');
            // 3. 生成一次性设备绑定码（UUID，每次初始化都是新的）
            const deviceCode = crypto.randomUUID();
            const verifyUrl = baseUrl + '/#/zycli/device/verify?code=' + deviceCode;
            // 4. 打开浏览器
            console.log('');
            console.log('请在浏览器中打开以下链接完成登录绑定：');
            console.log('');
            console.log(verifyUrl);
            console.log('');
            try {
                openBrowser(verifyUrl);
            } catch (_) { /* 静默失败，用户手动打开 */
            }
            // 5. 轮询验证
            console.log('等待用户在浏览器中完成登录...');
            const verifyPath = '/cli/deviceBind/verify?code=' + deviceCode;
            const maxRetries = 60; // 最多等 5 分钟
            let verified = false;
            for (let i = 0; i < maxRetries; i++) {
                await sleep(5000);
                try {
                    const res = await axios.get(baseUrl + verifyPath, {timeout: 10000});
                    const data = res.data;
                    if (data && (data.errCode === 200 || data.code === 200 || data.verified)) {
                        verified = true;
                        console.log('');
                        console.log('登录验证成功！');
                        break;
                    }
                    if (i % 6 === 0) process.stdout.write('.'); // 每30秒一个点
                } catch (e) {
                    if (i % 6 === 0) process.stdout.write('.');
                }
            }
            console.log('');
            if (!verified) {
                console.log('等待超时，未检测到登录绑定，请重新执行 zy-cli config init');
                return;
            }
            // 6. 绑定设备公钥（附带私钥签名证明持有权）
            console.log('正在绑定设备...');
            let bindResData;
            try {
                const proof = crypto.createSign('RSA-SHA256').update(deviceCode).sign(privateKey, 'hex');
                let bindRes = await axios.post(baseUrl + '/cli/deviceBind/bind', null, {
                    params: {
                        code: deviceCode,
                        publicKey: publicKey,
                        proof: proof,
                        hostname: os.hostname(),
                        username: os.userInfo().username,
                    },
                    timeout: 15000,
                });
                if (!bindRes.data || bindRes.data.errCode !== 200) {
                    const errMsg = (bindRes.data && bindRes.data.errMsg) ? bindRes.data.errMsg : 'unknown error';
                    console.log('设备绑定失败: ' + errMsg);
                    return;
                }
                bindResData = (bindRes.data && bindRes.data.data) || {};
                const boundUser = bindResData.userName || '';
                console.log('设备绑定成功！' + (boundUser ? ' 当前用户：' + boundUser : ''));
            } catch (e) {
                console.log('设备绑定失败: ' + (e.response ? JSON.stringify(e.response.data) : e.message));
                return;
            }
            // 7. 保存配置
            const config = {
                url: baseUrl,
                deviceCode: deviceCode,
                privateKey: privateKey,
                userName: bindResData.userName || '',
                version: pkg.version,
                updatedAt: formatDateTime(new Date()),
            };
            saveConfig(config);
            console.log('');
            console.log('✓ 配置已加密保存到 ' + CONFIG_PATH);
            console.log('');
            console.log('配置摘要：');
            console.log('         URL： ' + config.url);
            console.log('  设备绑定码： ' + config.deviceCode);
            const warnings = checkSecurity();
            if (warnings.length > 0) {
                console.log('');
                console.log('⚠ 安全提醒：');
                warnings.forEach((w) => console.log('    ' + w));
            }
        });

    // config show —— 查看当前配置
    configCmd
        .command('show')
        .description('查看当前知识库连接配置')
        .action(() => {
            const config = getConfig();
            if (!config.url) {
                console.log('未配置，请先执行 zy-cli config init');
                return;
            }
            console.log('当前配置：');
            if (config._source === 'env') {
                console.log('  (来源: 环境变量 ZY_CLI_*)');
            }
            console.log('         URL： ' + config.url);
            console.log('  设备绑定码： ' + (config.deviceCode || '(无)'));
            if (config.userName) {
                console.log('    绑定用户： ' + config.userName);
            }
            if (config.updatedAt) {
                console.log('    更新时间： ' + config.updatedAt);
            }
            if (config._source !== 'env') {
                console.log('    配置文件： ' + CONFIG_PATH);
            }
        });

    // config clear —— 清除配置
    configCmd
        .command('clear')
        .description('清除知识库连接配置')
        .action(async () => {
            const config = getConfig();
            if (!config.url) {
                console.log('当前没有配置需要清除。');
                return;
            }
            const {confirm} = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'confirm',
                    message: '确认清除配置 (' + config.url + ') ？',
                    default: false,
                },
            ]);
            if (confirm) {
                clearConfig();
                console.log('✓ 配置已清除。');
            } else {
                console.log('已取消。');
            }
        });
};

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function openBrowser(url) {
    const {execSync} = require('child_process');
    const platform = os.platform();
    if (platform === 'win32') {
        execSync('start "" "' + url + '"', {shell: true});
    } else if (platform === 'darwin') {
        execSync('open "' + url + '"');
    } else {
        execSync('xdg-open "' + url + '"');
    }
}

function formatDateTime(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
        + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
}
