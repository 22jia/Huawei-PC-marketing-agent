#!/usr/bin/env node

const { assistCustomer } = require('../services/api/src/agent/customerAgent.cjs');

const input = {
  customer_description: '大学生，常在图书馆写论文，担心电脑太重；已有华为手机，希望传文件方便。',
  model: 'HUAWEI MateBook 14',
  follow_up_days: [1, 3, 7],
};

assistCustomer(input)
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => {
    console.error(JSON.stringify({ status: 'error', message: error.message }, null, 2));
    process.exitCode = 1;
  });
