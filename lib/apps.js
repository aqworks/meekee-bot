/**
 * Helpers for configuring a bot as an app
 * https://api.slack.com/slack-apps
 */

var Botkit = require('botkit');

var _bots = {};

function _trackBot(bot) {
  _bots[bot.config.token] = bot;
}

function die(err) {
  console.error(err);
  process.exit(1);
}

module.exports = {
  configure: function (port, clientId, clientSecret, config, onInstallation) {
    var controller = Botkit.slackbot(config).configureSlackApp(
      {
        clientId: clientId,
        clientSecret: clientSecret,
        scopes: ['bot'], //TODO it would be good to move this out a level, so it can be configured at the root level
      }
    );

    controller.setupWebserver(process.env.PORT,function(err,webserver) {
      controller.createWebhookEndpoints(controller.webserver);
      controller.createOauthEndpoints(controller.webserver,function(err,req,res) {
        if (err) {
          res.status(500).send('ERROR: ' + err);
          console.error("createOauthEndpoints returned an error: ", err);
        } else {
          res.send('Meekee has been added to your Slack team!');
          console.info("displayed message `Meekee has been added to your Slack team!` to page");
        }
      });
    });

    controller.on('create_bot', function (bot, config) {
      if (_bots[bot.config.token]) {
        // already online! do nothing.
      } else {
        bot.startRTM(function (err) {
          if (err){
            console.error("create_bot error: ");
            die(err);
          }

          _trackBot(bot);

          if (onInstallation) onInstallation(bot, config.createdBy);
        });
      }
    });

    controller.storage.teams.all(function (err, teams) {
      if (err)
        throw new Error(err);

      // connect all teams with bots up to slack!
      for (var t in teams) {
        if (teams[t].bot) {
          console.log("team "+teams[t].name+" has bot settings.");
          controller.spawn(teams[t]).startRTM(function (err, bot) {
            if (err){
              console.warn('Error connecting bot to Slack ('+teams[t].name+'):', err);
              // Mark team as inactive in DB.
              teams[t].account_inactive = true;
              controller.storage.teams.save(teams[t]);
              console.warn('marking team '+teams[t].name+' as `account_inactive`');
            } else {
              console.info("spawned bot for team "+bot.team_info.name);
              _trackBot(bot);
            }
          });
        }
      }
    });
    return controller;
  }
}
