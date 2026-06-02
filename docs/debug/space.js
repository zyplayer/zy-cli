/**
 * CLI 命令全套调试脚本 —— 验证命令行本身是否正常工作
 * 用法：node docs/debug/space.js
 *
 * 流程：
 *   1. 新建空间 → 拿到 spaceId
 *   2. 用 spaceId 更新空间
 *   3. 查看空间列表
 *   4. 空间发版
 *   5. 新建分组
 *   6. 查看分组列表
 */

const { execSync } = require('child_process');

const CLI = 'node bin/cli.js';
const TAG = '[cli-debug]';
let spaceId = null;

function run(cmd) {
  console.log('\n' + '='.repeat(60));
  console.log(TAG, '>', cmd);
  console.log('='.repeat(60));
  try {
    const output = execSync(cmd, { encoding: 'utf-8', cwd: __dirname + '/../..' });
    console.log(output.trim());
    return output.trim();
  } catch (err) {
    console.error(TAG, '失败:', err.message);
    if (err.stdout) console.log(err.stdout);
    if (err.stderr) console.error(err.stderr);
    throw err;
  }
}

// 1. 新建空间
const name = 'CLI调试-' + Date.now();
let output = run(`${CLI} space update --name "${name}" --type 1`);

// 2. 从空间列表里拿到刚创建的空间 ID
output = run(`${CLI} space list`);
try {
  const json = JSON.parse(output);
  const list = json.data.list || json.data || [];
  const item = list.find(e => e.name === name);
  spaceId = item ? (item.id || item.spaceId) : null;
  if (spaceId) {
    console.log(TAG, '获取到 spaceId =', spaceId);
  } else {
    console.log(TAG, '未找到匹配空间，尝试取第一条');
    spaceId = list[0] && (list[0].id || list[0].spaceId);
  }
} catch (e) {
  console.log(TAG, '解析列表 JSON 失败，跳过后续步骤');
}

if (!spaceId) {
  console.log(TAG, '未获取到 spaceId，后续步骤跳过');
  return;
}

// 3. 更新空间
run(`${CLI} space update --id ${spaceId} --name "${name}-已更新" --type 1`);

// 4. 空间发版
run(`${CLI} space create-version --spaceId ${spaceId} --versionName "v${Date.now()}"`);

// 5. 新建分组
run(`${CLI} group update --groupName "调试分组-${Date.now()}"`);

// 6. 分组列表
run(`${CLI} group list`);

console.log('\n' + TAG, '全部命令执行完成');
