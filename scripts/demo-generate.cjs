#!/usr/bin/env node

const { generate } = require('../services/api/src/agent/taskAgent.cjs');

const input = {
  audience: '大学生',
  scenario: '学习和移动办公',
  goal: '种草并引导到店咨询',
  platform: 'xiaohongshu',
  model: 'HUAWEI MateBook 14',
  requirements: ['突出便携', '突出屏幕体验'],
  image_count: 4,
  include_price: false,
};

generate(input)
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => {
    console.error(JSON.stringify({ status: 'error', message: error.message }, null, 2));
    process.exitCode = 1;
  });
