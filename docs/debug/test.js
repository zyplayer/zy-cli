/**
 * zy-cli 命令端到端测试
 * 运行方式: node docs/debug/test.js
 */
const {execSync} = require('child_process');

const SPACE_ID = 21;
const CLI = 'node bin/cli.js';

function run(cmd) {
    console.log('$ ' + cmd);
    try {
        const output = execSync(CLI + ' ' + cmd, {encoding: 'utf-8', timeout: 30000, cwd: __dirname + '/../..'});
        console.log(output);
    } catch (err) {
        console.error('failed:', err.stderr || err.message);
    }
}

// console.log('=== 测试搜索文档（全局） ===');
// run('page search --keywords test --pageNum 1');
//
// console.log('\n=== 测试搜索文档（指定空间） ===');
// run('page search --spaceId ' + SPACE_ID + ' --keywords test --fromName false');
//
// console.log('\n=== 测试上传文件 ===');
// run('page upload --spaceId ' + SPACE_ID + ' --name test.ini --editorType 1 --file d:/test.ini');
//
// console.log('\n=== 测试上传文件 ===');
// run('contact search-user --phone +8615228861532');

console.log('\n=== 测试上传文件 ===');
run('contact search-dept --name 服务');
