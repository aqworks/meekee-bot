var userLib = null;

/**
 * Define a function for initiating a conversation on installation
 * With Slack custom integrations, we don't have a way to find out who installed us, so we can't message them :(
 */
function onInstallation(bot, installer) {
  if (installer) {
    if (!userLib)
      userLib = require('./lib/user').init(controller);
    userLib.bootstrapFirstUser(installer, function(user_object){
      authenticate(user_object, bot, function(convo){
        convo.say("Thanks, your setup is now complete.\nI'll start sending notifications. ");
      });
    });
  }
}

/**
 * Configure the persistence options
 */
var config = {};
if (process.env.MONGODB_URI) {
  console.log("** Connecting to MongoDB");
  var BotkitStorage = require('botkit-storage-mongo');
  config = {
    storage: BotkitStorage({mongoUri: process.env.MONGODB_URI}),
  };
}

/**
 * Are being run as an app or a custom integration? The initialization will differ, depending
 */
if (process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET && process.env.PORT) {
  var app = require('./lib/apps');
  var controller = app.configure(process.env.PORT, process.env.SLACK_CLIENT_ID, process.env.SLACK_CLIENT_SECRET, config, onInstallation);
  console.log(JSON.stringify(controller.storage));
} else {
  console.log('Error: If this is a custom integration, please specify TOKEN in the environment. If this is an app, please specify SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, and PORT in the environment');
  process.exit(1);
}

/**
 * A demonstration for how to handle websocket events. In this case, just log when we have and have not
 * been disconnected from the websocket. In the future, it would be super awesome to be able to specify
 * a reconnect policy, and do reconnections automatically. In the meantime, we aren't going to attempt reconnects,
 * WHICH IS A B0RKED WAY TO HANDLE BEING DISCON NECTED. So we need to fix this.
 *
 * TODO: fixed b0rked reconnect behavior
 */
// Handle events related to the websocket connection to Slack

controller.on('rtm_open', function (bot) {
  // this is launched once per team since the bots settings differ
  console.info('** The RTM api just connected for team '+bot.team_info.name);

  if (!userLib)
    userLib = require('./lib/user').init(controller);

  controller.webserver.get('/google/auth/callback', function(req, res) {
    console.info("get /google/auth/callback was called.");
    res.send("<p>Next, copy and paste this Authentication Code in Slack to @meekee: <br/><strong>"+req.query.code+"</strong></p>");
  });

  setTimeout(function(){
    loop(bot, true);
  }, 3000);
  setInterval(function(){
    loop(bot, false);
  }, 60000); // 1min = 60000ms
});

controller.on('rtm_close', function (bot) {
    console.info('** The RTM api just closed');
});

/**
 * Core bot logic goes here!
 */
// BEGIN EDITING HERE!

function authenticate(user, bot, callback){
  bot.startPrivateConversation({user: user.id}, function(err, convo) {
    console.info("Started authenticate conversation with ", user);
    var text =  "Great, let's get started.\n";
        text += "1. Click this link to connect me with your Google Calendar: "+userLib.getAuthUrl()+"\n";
        text += "2. Get your Authentication Code\n";
        text += "3. Paste it here";
    if (err)
      console.log(err);
    else{
      authenticate_convo(user, convo, text, callback);

    }
  })
}

function sendAuthReminder(bot, user){
  var text =  "Hi! Please complete your setup so I can start sending notifications.\n";
      text += "1. Click this link to authenticate your Google Calendar: "+userLib.getAuthUrl()+"\n";
      text += "2. Get your Authentication Code\n";
      text += "3. Paste it here";
  bot.startPrivateConversation({user: user.id}, function(err, convo) {
    if (err)
      console.log(err);
    else
      authenticate_convo(user, convo, text);
  });
}

function authenticate_convo(user, convo, text, callback){
  // Set task to timeout after 1mins.
  convo.task.timeLimit = 60000;

  console.log("asking user to click on link for auth. will wait for ms", convo.task.timeLimit);
  // ask to catch answer
  convo.ask(text,function(response, convo) {
    console.log("received an answer");
    // if code matches RegExp
    userLib.getFirstTimeToken(user, response.text, function(success, error){
      if (error){
        console.warn("The google api token couldnt be generated.");
        convo.say(error);
        convo.next();

      } else if (success){ // got token
        console.info("answer matches token code regex.");
        convo.next();
        console.log("Getting user timezone");
        userLib.getTimezone(user);
        if (callback){
          console.log("ok! calling callback ", callback);
          callback(convo);
        }
        else if (!user.reminders){ // a new user will already have reminders on
          console.log("it's a new user so has reminders on.");
          userLib.turnRemindersOn(user, function(text){
            console.log("Say: ", text);
            convo.say(text);
          });
        } else {
          console.log("Okay, I'll start sending you notifications. (user already has reminders on.)");
          convo.say("Okay, I'll start sending you notifications.");
        }
      } else { // couldnt get token
        console.warn("answer DOESNT matches token code regex. `Sorry, it seems it's not the right code. :thinking_face:.`");
        convo.say("Sorry, it seems it's not the right code. :thinking_face:.");
        convo.silentRepeat();
      }
    });
  });
}

function sendNotification(bot, user, notifications, error_message){
  console.log("["+bot.team_info.name+"] sending "+notifications.length+" notifications to "+user.id);
  if (notifications.length){
    console.log(user.id);
    bot.startPrivateConversation({user: user.id}, function(err,convo) {
      if (err){
        console.error(err);
      } else if(error_message) {
        console.error(error_message);
        convo.say(error_message);
      } else
        for (notification of notifications){
          console.info("say ", notification);
          convo.say(notification);
        }
    });
  }
}

function sendSevenDaysReminder(bot, user){
  console.info("send seven_days_reminder for "+user.id);
  bot.startPrivateConversation({user: user.id}, function(err, convo) {
    if (err)
      console.error(err);
    else {
      var line1 = "Hi <@"+convo.context.user+">, it's already been a week since I started sending notifications.\nHow's it going so far? :simple_smile:\nAppreciate if you could share feedback with @AQbots on Twitter!\n\nIf you think your teammates might also enjoy receiving notifications, I'd love to help them out, too. Here's a suggested announcement :bell: :";
      var line2 = "> Hi everyone, I've started using Meekee, a tiny bot that connects with Google Calendar to send just-in-time meeting notifications on Slack. It's super helpful! :bellhop_bell:\n> Try it out by saying `start` to <@"+convo.context.bot.identity.name+">\nOn the other hand, if it's _not_ working for you, do `stop` to stop receiving notifications.\n Thank you!";

      convo.say(line1);
      console.log(line1);
      convo.say(line2);
      console.log(line2);
      console.info("sent!");
    }
  });
}

function sendOneMonthReminder(bot, user){
  console.info("send sendOneMonthReminder for "+user.id);
  bot.startPrivateConversation({user: user.id}, function(err,convo) {
    if (err)
      console.error(err);
    else {
      var line1 = "Hi <@"+user.id+">, guess what? It's been a whole month since I started sending you notifications -- "+user.notifications+" so far! :tada: "
      convo.say(line1);
      console.log(line1);

      userLib.getUsersForTeam(bot.team_info.id, function(users){
        var teammates_users = [];
        for (u of users){
          // TODO: change second part once PR is merged
          if (u.reminders && u.id != user.id && u.team_id == bot.team_info.id){
            teammates_users.push("<@"+u.id+">");
          }
        }
        console.log("found these team members:");
        console.log(teammates_users);

        if (teammates_users.length > 0){
          var line2 = "Here's who else is getting to meetings on time: "+teammates_users.join(", ")+" :wink: ";
          convo.say(line2);
          console.log(line2);
        }

        var line3 = "If you have any feedback or want to give a shout out to the people who made me, they're on Twitter @AQbots. Thanks and see you before your next meeting!";
        convo.say(line3);
        console.log(line3);
        console.info("sent!");
      });
    }
  });
}

function loop(bot, first_loop){
  // console.log("Team ["+bot.team_info.name+"]");
  userLib.getUsersForTeam(bot.team_info.id, function(users){
    if (users.length > 0) {
      for (user of users) {
        if (user.google_token && user.reminders){
          // Because we don't wait for callback (what callback?) before querying the first events
          // the notifications sent this turn might not have the right timezone
          // if the timezone has changed
          if (first_loop)
            userLib.getTimezone(user);

          userLib.checkCalendar(user, function(user, notifications, error_message){
            if (notifications.length > 0)
              sendNotification(bot, user, notifications, error_message);
          });
        }

        // if reminders are on and we have a auth_reminder timedate BUT we dont have a google_token yet (aka authenticate hasnt gone through yet)
        if (user.reminders && user.auth_reminder && !user.google_token){
          var now = new Date(); // to other function ?
          now.setSeconds(0);
          now.setMilliseconds(0);
          if (now.getTime() == user.auth_reminder.getTime())
            sendAuthReminder(bot, user);
        }

        if (user.seven_days_reminder && user.google_token){
          var now = new Date();
          now.setSeconds(0);
          now.setMilliseconds(0);
          if (now.getTime() == user.seven_days_reminder.getTime())
            sendSevenDaysReminder(bot, user);
        }

        if (user.one_month_reminder && user.google_token){
          var now = new Date();
          now.setSeconds(0);
          now.setMilliseconds(0);
          if (now.getTime() == user.one_month_reminder.getTime())
            sendOneMonthReminder(bot, user);
        }
      };
    }
  });
}

function errorMessage(err){
  bot.reply(message, err);
}

controller.hears(["hello", "hi", "greetings"], ["direct_mention", "mention", "direct_message"],
  function(bot,message) {
    console.info("hears greetings from "+message.user);
    bot.reply(message, "Hello! :simple_smile:");
    console.log("reply 'Hello! :simple_smile:'");
  }
);

controller.hears('thanks', 'direct_message', function (bot, message) {
  console.info("hears 'thanks' from "+message.user);
  bot.reply(message, 'Thank you!');
  console.log("reply 'Thank you!'");
});

controller.hears('start', ['direct_mention', 'mention', 'direct_message'], function (bot, message) {
  console.info(" hears 'start' from user "+message.user);

  userLib.getUser(message.user, function(user){
    console.log("Do we have a user ?" );
    console.log(user);
    if (!user){
      console.log("no user found: let's create one.");
      newUser(message, bot, authenticate);

    } else if (user.google_token){
      console.log("we found a user and he has a token");
      turnRemindersOn(user, function(text){
        bot.reply(message, text);
      });

    } else {
      console.log("user exists but he doesnt have a token : authenticate");
      authenticate(user, bot);
    }
  });
});

controller.hears('stop', ['direct_mention', 'mention', 'direct_message'], function (bot, message) {
  console.log("hears 'stop' from "+message.user);
  userLib.getUser(message.user, function(user){
    userLib.turnRemindersOff(user, function(error){
      if (error){
        console.error(error);
        bot.reply(message, text);
      } else {
        bot.reply(message, "Okay, I'll stop sending you notifications. When you want to re-start them, just type `start` in this channel!");
        console.log("Okay, I'll stop sending you notifications. When you want to re-start them, just type `start` in this channel!");
      }
    });
  });
});

controller.hears('help', ['direct_mention', 'mention', 'direct_message'], function (bot, message) {
  console.log("hears 'help' from "+message.user);
  bot.reply(message, "Please check the FAQ on meekee.io or get in touch on Twitter @AQbots or hello@aqworks.com. Thanks!");
  console.log("Please check the FAQ on meekee.io or get in touch on Twitter @AQbots or hello@aqworks.com. Thanks!");
});

controller.hears('2hours', ['direct_mention', 'mention', 'direct_message'], function (bot, message) {
  userLib.getUser(message.user, function(user){
    sendAuthReminder(bot, user);
  });
});

controller.hears('7days', ['direct_mention', 'mention', 'direct_message'], function (bot, message) {
  userLib.getUser(message.user, function(user){
    sendSevenDaysReminder(bot, user);
  });
});

controller.hears('1month', ['direct_mention', 'mention', 'direct_message'], function (bot, message) {
  userLib.getUser(message.user, function(user){
    sendOneMonthReminder(bot, user);
  });
});

controller.on('direct_message,mention,direct_mention', function (bot, message) {
  console.log("hears 'direct_message,mention,direct_mention' from "+message.user);
  bot.api.reactions.add({
    timestamp: message.ts,
    channel: message.channel,
    name: 'robot_face',
  }, function (err) {
    if (err)
      console.log(err)
    bot.reply(message, "Sorry, I didn't get that.");
   });
});
