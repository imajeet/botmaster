import test from 'ava';
import http from 'http';
import express from 'express';
import _ from 'lodash';
import request from 'request-promise';

import Botmaster from '../../lib';
import MockBot from '../_mock_bot';

const testTitleBase = 'Botmaster #addBot';

test(`${testTitleBase} works with a bot that doesn't require webhhooks`, (t) => {
  t.plan(3);

  return new Promise((resolve) => {
    const botmaster = new Botmaster();

    botmaster.on('server running', () => {
      const bot = new MockBot();

      botmaster.addBot(bot);
      t.is(Object.keys(botmaster.__serverRequestListeners).length, 0);
      t.is(botmaster.bots.length, 1);
      t.is(botmaster.bots[0], bot);
      botmaster.server.close(resolve);
    });
  });
});

const arbitraryBotMacro = (t, botSettings) => {
  t.plan(3);
  return new Promise((resolve) => {
    const botmaster = new Botmaster();

    botmaster.on('server running', () => {
      const bot = new MockBot(botSettings);

      botmaster.addBot(bot);
      t.is(Object.keys(botmaster.__serverRequestListeners).length, 1);
      t.is(botmaster.bots.length, 1);

      const updateToSend = { text: 'Hello world' };
      const requestOptions = {
        method: 'POST',
        uri: `http://localhost:3000/mock/${botSettings.webhookEndpoint}`,
        json: updateToSend,
      };

      request(requestOptions);

      botmaster.on('update', (onUpdateBot, update) => {
        t.deepEqual(update.raw, updateToSend);
        botmaster.server.close(resolve);
      });
    });
  });
};

test(`${testTitleBase} works with an express bot`, arbitraryBotMacro, {
  requiresWebhook: true,
  webhookEndpoint: 'express',
});

test(`${testTitleBase} works with a koa bot`, arbitraryBotMacro, {
  requiresWebhook: true,
  webhookEndpoint: 'koa',
});

test(`${testTitleBase} works with an express server AND both an express and a koa bot`, (t) => {
  t.plan(6);

  return new Promise((resolve) => {
    // just dev's personal app stuff
    const app = express();

    const appResponse = {
      text: 'wadup?',
    };

    app.use('/someRoute', (req, res) => {
      res.json(appResponse);
    });
    // ///////////////////////////////

    const myServer = http.createServer(app);

    const botmaster = new Botmaster({
      server: myServer,
    });

    myServer.listen(3000, () => {
      // creating and adding bots
      const koaBotSettings = {
        requiresWebhook: true,
        webhookEndpoint: 'koa',
      };

      const expressBotSettings = {
        requiresWebhook: true,
        webhookEndpoint: 'express',
      }
      const koaBot = new MockBot(koaBotSettings);
      const expressBot = new MockBot(expressBotSettings);

      botmaster.addBot(koaBot);
      botmaster.addBot(expressBot);
      t.is(Object.keys(botmaster.__serverRequestListeners).length, 2);
      t.is(botmaster.bots.length, 2);

      const updateToSendToKoaBot = { text: 'Hello Koa Bot' };
      const updateToSendToExpressBot = { text: 'Hello express Bot' };

      const koaBotRequestOptions = {
        method: 'POST',
        uri: 'http://localhost:3000/mock/koa',
        json: updateToSendToKoaBot,
      };

      const expressBotRequestOptions = {
        method: 'POST',
        uri: 'http://localhost:3000/mock/express',
        json: updateToSendToExpressBot,
      };

      request(koaBotRequestOptions)
      .then(() => request(expressBotRequestOptions));

      let receivedUpdatesCount = 0;
      botmaster.on('update', (onUpdateBot, update) => {
        receivedUpdatesCount += 1;
        if (update.raw.text.indexOf('Koa') > -1) {
          t.deepEqual(update.raw, updateToSendToKoaBot);
        } else if (update.raw.text.indexOf('express') > -1) {
          t.deepEqual(update.raw, updateToSendToExpressBot);
        }
        if (receivedUpdatesCount === 2) {
          const appRequestOptions = {
            uri: 'http://localhost:3000/someRoute',
            json: true,
          };
          request.get(appRequestOptions)

          .then((body) => {
            t.deepEqual(appResponse, body);
            t.is(botmaster.server, myServer);
            botmaster.server.close(resolve);
          });
        }
      });
    });
  });
});
