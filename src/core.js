const {program} = require('commander');
const path = require('path');
const fs = require('fs');

/**
 * CLI核心框架
 * 自动扫描 commands/ 目录，注册子命令
 */

// 框架版本号（从 package.json 读取）
const pkg = require('../package.json');

/**
 * 启动CLI，自动加载所有子命令
 */
function run() {
    program
        .name('zy-cli')
        .description('zyplayer-doc知识库CLI命令行工具')
        .version(pkg.version);

    // 自动扫描 commands/ 目录并注册子命令
    const commandsDir = path.join(__dirname, 'commands');
    if (fs.existsSync(commandsDir)) {
        const files = fs.readdirSync(commandsDir);
        files.forEach((file) => {
            if (file.endsWith('.js')) {
                try {
                    const command = require(path.join(commandsDir, file));
                    if (typeof command === 'function') {
                        command(program);
                    }
                } catch (err) {
                    console.error(`Failed to load command: ${file}`, err.message);
                }
            }
        });
    }

    // 解析命令行参数
    program.parse(process.argv);
}

module.exports = {run, program};
