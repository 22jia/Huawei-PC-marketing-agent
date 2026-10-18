#!/usr/bin/env node

const { retrieveEvidence } = require('../services/api/src/services/evidenceService.cjs');

const query = process.argv.slice(2).join(' ').trim() || 'HUAWEI MateBook 14';
retrieveEvidence(query, { limit: 3 })
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(JSON.stringify({ status: 'error', message: error.message }, null, 2));
    process.exitCode = 1;
  });
