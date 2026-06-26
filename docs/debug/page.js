/**
 * page 命令调试
 * 用法：node docs/debug/page.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CLI = 'node bin/cli.js';
const TAG = '[cli-debug:page]';
const SPACE_ID = 21;
let pageId = null;

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
  }
}

// 1. 新建文档
const name = 'CLI文档-' + Date.now();
run(`${CLI} page update --spaceId ${SPACE_ID} --name "${name}" --editorType 2`);

// 2. 文档列表 → 拿 pageId
const output = run(`${CLI} page list --spaceId ${SPACE_ID}`);
try {
  const json = JSON.parse(output);
  const list = json.data.list || json.data || [];
  const item = list.find(e => e.name === name);
  pageId = item ? (item.id || item.pageId) : null;
  if (pageId) {
    console.log(TAG, '获取到 pageId =', pageId);
  } else {
    pageId = list[0] && (list[0].id || list[0].pageId);
    console.log(TAG, '未匹配，用第一条 pageId =', pageId);
  }
} catch (e) {
  console.log(TAG, '解析 JSON 失败');
}

if (!pageId) {
  console.log(TAG, '未拿到 pageId，后续跳过');
  return;
}

// 3. 更新文档
const updateFile = path.join(__dirname, 'page-update-test.md');
fs.writeFileSync(updateFile, '测试内容', 'utf-8');
run(`${CLI} page update --id ${pageId} --spaceId ${SPACE_ID} --name "${name}-已更新" --editorType 2 --file "${updateFile}"`);

// 4. 发布文档
run(`${CLI} page release --id ${pageId}`);

// 5. 分享文档
run(`${CLI} page share --id ${pageId} --shareFlag 1`);

// 6. 删除文档（移到回收站）
run(`${CLI} page delete --pageId ${pageId} --spaceId ${SPACE_ID} --delFlag 1`);

console.log('\n' + TAG, '全部命令执行完成');
