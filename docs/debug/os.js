/**
 * page 命令调试
 * 用法：node docs/debug/os.js
 */

const os = require('os');

console.log(os.hostname(), process.env.USER, process.env.USERNAME, JSON.stringify(os.userInfo()));

//
// const cpuModel = os.cpus()[0] ? os.cpus()[0].model : '';
//
// console.log( cpuModel + '|' + os.arch() + '|' + os.homedir());
//
//
// const crypto = require('crypto');
//
// // 1. 加密：注册时使用
// const password = '123456';
// // 生成随机盐（推荐 16 字节以上）
// const salt = crypto.randomBytes(16);
// // PBKDF2 加密
// const hash = crypto.pbkdf2Sync(password, salt, 10000, 32, 'sha256');
//
// // 入库：盐 + 加密结果都要存（校验必须用到 salt）
// const saveStr = `${hash.toString('hex')}`;
// console.log('存储内容：', saveStr);
//
