var util = require('util');
var calendar = require('./calendar').init();

var google = require('googleapis');
var OAuth2 = google.auth.OAuth2;
var oauth2Client = new OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URL
);

module.exports = {
  init: function(controller){
    var storage = controller.storage;

    // PUBLIC METHODS -> add to return

    getAuthUrl = function(){
      return oauth2Client.generateAuthUrl({
        access_type: 'offline', // 'online' (default) or 'offline' (gets refresh_token),
        approval_prompt: 'force', // this will force the sending of a refresh_token. shouldnt be necessary the first time..
        scope: [ 'https://www.googleapis.com/auth/calendar.readonly' ]
      });
    }

    getUsersForTeam = function(team_id, callback){
      storage.users.find({team_id: team_id}, function(err, users){
        if (err)
          console.error(err);
        else{
          callback(users);
        }
      });
    }

    getUser = function(user, callback){
      storage.users.get(user, function(err, data){
        if (err)
          console.error(err);
        else
          callback(data);
      });
    }

    bootstrapFirstUser = function(id, callback){
      getUser(id, function(user_object){
        var auth_reminder = new Date();
        // DONT refactor to save returned value
        auth_reminder.setSeconds(0);
        auth_reminder.setMilliseconds(0);
        auth_reminder.setHours(auth_reminder.getHours()+2);
        var seven_days_reminder = new Date();
        seven_days_reminder.setSeconds(0);
        seven_days_reminder.setMilliseconds(0);
        seven_days_reminder.setDate(seven_days_reminder.getDate()+7);
        var one_month_reminder = new Date();
        one_month_reminder.setSeconds(0);
        one_month_reminder.setMilliseconds(0);
        one_month_reminder.setDate(one_month_reminder.getDate()+28);

        user_object.reminders = true;
        user_object.notifications = 0;
        user_object.creation_date = new Date();
        user_object.auth_reminder = auth_reminder;
        user_object.seven_days_reminder = seven_days_reminder;
        user_object.one_month_reminder = one_month_reminder;
        saveUser(user_object, function(){
          console.log("installer user created bootstrapped: ");
          console.log(user_object);
          callback(user_object);
        });
      });
    }

    newUser = function(message, bot, callback){
      var auth_reminder = new Date();
      // DONT refactor to save returned value
      auth_reminder.setSeconds(0);
      auth_reminder.setMilliseconds(0);
      auth_reminder.setHours(auth_reminder.getHours()+2);
      user = {
        id: message.user,
        team_id: message.team,
        reminders: true,
        notifications: 0,
        creation_date: new Date(),
        auth_reminder: auth_reminder
      };
      saveUser(user, function(){
        console.log("new user created : "+message.user);
        callback(user, bot);
      });
    }

    saveUser = function(user_object, callback, dont_update_date){
      if (dont_update_date === undefined)
        user_object.update_date = new Date();
      storage.users.save(user_object, function(err, data){
        if (err)
          console.error(err);
        else
          callback();
      });
    }

    turnRemindersOn = function (user_object, callback){
      if (user_object.reminders == true){
        callback("Notifications are already turned on.");
      } else {
        user_object.reminders = true;
        user_object.update_date = new Date();
        storage.users.save(user_object, function(err) {
          if (err){
            console.error(err);
            var message = err;
          } else
            var message = "Okay, I'll start sending you notifications.";
          callback(message);
        });
      }
    }

    turnRemindersOff = function (user_object, callback){
      user_object.reminders = false;
      user_object.update_date = new Date();
      storage.users.save(user_object, function(err) {
        if (err)
          console.error(err);
        callback(err);
      });
    }

    // TODO : what to call after we get the authcode returned by GET /oauthcallback?code={authorizationCode}
    getFirstTimeToken = function(user_object, code, callback){
      oauth2Client.getToken(code, function (err, tokens) {
        if (err){
          console.log("err : ", err);
          var text =  err.toString();
          callback(false, null);
        } else {
          user_object.google_token = tokens;
          saveUser(user_object, function(){
            if (err){
              console.error(err);
              var message = err;
              callback(false, error);
            } else
              callback(true, null);
          }, false); // not a user interaction: dont update the date
        }
      });
    }

    updateToken = function(user_object){
      // get credentials and potentially refreshed token + save it if updated.
      oauth2Client.setCredentials(user_object.google_token);

      // if the token has been refreshed
      if (oauth2Client.credentials.access_token != user_object.google_token.access_token){
        console.info("auth token has changed for user", user_object);
        console.info("refreshing token it in the DB");
        user_object.google_token = oauth2Client.credentials;
        saveUser(user_object, function(){
          if (err)
            console.error(err);
        }, false); // not a user interaction: dont update the date
      }
    }

    checkCalendar = function(user_object, callback){
      var notifications = [];
      var error = null;

      updateToken(user_object);
      var args = calendar.getEventArgs(oauth2Client);
      google.calendar('v3').events.list(args, function(err, response){
          if (err)
            error = calendar.handleQueryError(err, args);
          else {
            notifications = calendar.filterEvents(args, response, user_object);

            if (notifications.length){
              // update notification count in DB (async)
              user_object.notifications += notifications.length;
              saveUser(user_object, function(){
                if (err)
                  console.error(err);
              }, false); // not a user interaction: dont update the date
            }
          }
          callback(user_object, notifications, error);
        }
      );
    }

    getTimezone = function(user_object, callback){
      updateToken(user_object, oauth2Client);
      var args = calendar.getSettingsArgs(oauth2Client);
      google.calendar('v3').settings.get(
        args,
        function(err, response){
          if (err)
            calendar.handleQueryError(err, args);
          else {
            user_object.timezone = response.value;
            console.log("User "+user_object.id+"'s timezone will be updated to '"+user_object.timezone+"'");
            saveUser(user_object, function(user_object){
              if (err)
                console.error(err);
            }, false); // not a user interaction: dont update the date
          }
        }
      );
    }

    return {
      getAuthUrl,
      getUsersForTeam,
      bootstrapFirstUser,
      newUser,
      getUser,
      saveUser,
      turnRemindersOn,
      turnRemindersOff,
      getFirstTimeToken,
      checkCalendar,
      getTimezone
    };
  }
}
