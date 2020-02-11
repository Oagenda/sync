'use strict';

const path = require('path');
const redis = require('redis');
const mails = require('@openagenda/mails');
const promisifyRedis = require('./utils/promisifyRedis');

function getClient(config) {
  return promisifyRedis(redis.createClient(config));
}

async function push(config, stats) {
  const { log } = config;

  if (!config.redis) {
    log('Redis is not configured, stats not pushed');
    return;
  }

  const { client, listKey } = config.redis;

  const redisClient = getClient(client);
  const result = [];

  for (const key of [].concat(listKey)) {
    result.push(await redisClient.rpush(key, JSON.stringify(stats)));
  }

  redisClient.end(true);

  return result;
}

async function get(config, listKeyOpt) {
  const { log } = config;

  if (!config.redis) {
    log('Redis is not configured, stats not pushed');
    return;
  }

  const { client } = config.redis;
  const listKey = listKeyOpt || config.redis.listKey;

  const redisClient = getClient(client);

  const length = await redisClient.llen(listKey);
  const result = (await redisClient.lrange(listKey, 0, length))
    .map(v => JSON.parse(v));

  await redisClient.ltrim(listKey, 1, 0);

  redisClient.end(true);

  return result;
}

async function sendReport(config) {
  const { log } = config;

  if (!config.redis) {
    log('Redis is not configured, impossible to send report');
    return;
  }

  if (!config.mails) {
    log('@openagenda/mails is not configured, impossible to send report');
    return;
  }

  if (typeof config.sendTo !== 'object' || config.sendTo === null) {
    log('`config.sendTo` is not passed, nothing to do');
    return;
  }

  await mails.init({
    templatesDir: path.join(__dirname, 'templates'),
    ...config.mails
  });

  for (const [listKey, to] of Object.entries(config.sendTo)) {
    const data = await get(config, listKey);

    if (!data.length) {
      continue;
    }

    await mails({
      template: 'report',
      from: 'no-reply@mail.openagenda.com',
      replyTo: 'admin@openagenda.com',
      to,
      data: {
        data
      }
    });
  }
}

module.exports = {
  push,
  get,
  sendReport
};
