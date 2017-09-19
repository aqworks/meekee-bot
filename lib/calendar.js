var time = require('time');

module.exports = {
  init: function(){
    var mins = 3;

    function randomReaction(){
      reaction = [
        ":simple_smile:",
        ":simple_smile::v:",
        ":muscle:",
        ":muscle: :simple_smile:",
        ":slightly_smiling_face:",
        ":wave:",
        ":rabbit:",
        ":cat2:",
        ":coffee:",
        ":wink::point_up:",
        ":sparkles:",
        ":nerd_face:",
        ":robot_face:",
        ":information_desk_person:",
        ":v:",
        ":the_horns:",
        ":nerd_face::the_horns:",
        ":nerd_face::spock-hand:",
        ":spock-hand:",
        ":panda_face:",
        ":panda_face::the_horns:",
        ":unicorn_face:",
        ":new_moon_with_face::full_moon_with_face:",
        ":jack_o_lantern:",
        ":dango:",
        ":watermelon:",
        ":pizza:",
        ":telephone_receiver:",
        ":phone:",
        ":fax:",
        ":bellhop_bell:",
        ":crystal_ball:"
      ];
      return reaction[Math.floor(Math.random() * (reaction.length))];
    }

    function nowPlusMinutes(remind_me) {
      now = new Date;
      now.setMinutes(now.getMinutes() + remind_me);
      now.setSeconds(0);
      return now.toISOString();
    }

    function shouldIremindNow(args, event){
      start = new Date(event.start.dateTime);
      min = new Date(args.timeMin).getTime();
      max = new Date(args.timeMax).getTime();

      low_diff = Math.floor((min - start.getTime())/1000);
      high_diff = Math.floor((max - start.getTime())/1000);

      if (event.start.dateTime && event.attendees && low_diff === 0 && high_diff === 60){
        //status at the root of the event data concerns only owner
        for (att of event.attendees) {
          if (att.self && att.responseStatus !== "declined")
            return true;
        }
      }
      return false;
    }

    function formatNotification(event, timezone){
      text = "";
      attendees = "";

      if (event.attendees){
        for (att of event.attendees) {
          if (!att.self && att.responseStatus !== "declined" && !att.resource) {
            if (att.displayName)
              attendees += att.displayName+", ";
            if (!att.displayName)
              attendees += att.email+", ";
          }
        }
      }
      if (event.start.dateTime) {
        start = new time.Date(event.start.dateTime).setTimezone(timezone);
        end = new time.Date(event.end.dateTime).setTimezone(timezone);
        text  = "*"+start.getHours()+":"+('00'+start.getMinutes()).slice((-2));
        text += "-"+end.getHours()+":"+('00'+end.getMinutes()).slice((-2))+"*";
      }
      if (event.location)
        text += " At "+event.location;
      text += "\n";
      if (event.description)
        text += "\n"+event.description;

      var title = "Ready for "+event.summary+"? "+randomReaction();
      var attachments = {
        fallback: title,
        color: "#439FE0",
        mrkdwn_in: ["text", "fields"],
        title: event.summary,
        text: text
      };
      if (event.hangoutLink)
        attachments.title_link = event.hangoutLink;

      if (event.organizer || attendees.length)
        attachments.fields = [];

      if (event.organizer)
        var organizer = {
          "title": "Invited by", "short": true
        };
        if (event.organizer.displayName)
          organizer["value"] = event.organizer.displayName;
        if (!event.organizer.displayName)
          organizer["value"] = event.organizer.email;
        attachments.fields.push(organizer);

      if (attendees.length)
        attachments.fields.push({
          "title": "with",
          "value": attendees.slice(0, -2),
          "short": true
        });

      return {
        text: title,
        attachments: [attachments]
      }
    }

    // PUBLIC METHODS -> add to return
    var getEventArgs = function(oauth2Client){
      // TODO: is there a way to exclude events that are all-day ?
      return {
        auth: oauth2Client,
        calendarId: 'primary',
        maxResults: 5,
        singleEvents: true,
        orderBy: 'startTime',
        timeZone: "utc",
        timeMin: nowPlusMinutes(mins),
        timeMax: nowPlusMinutes(mins+1)
      }
    }

    var getSettingsArgs = function(oauth2Client){
      return {
        auth: oauth2Client,
        setting: "timezone"
      }
    }

    var filterEvents = function(args, response, user_object){
      var notifications = [];

      if (response.items && response.items.length > 0) {
        // console.log("events for "+user_object.id+": "+response.items.map(function(e){return e.summary}).join());
        for (event of response.items){
          if(shouldIremindNow(args, event)){
            console.info("will show the event: "+event.summary+" for user "+user_object.id);
            console.info(event);
            notifications.push(formatNotification(event, user_object.timezone));
          }
        }
      }
      return notifications;
    }

    var handleQueryError = function(err, args){
      console.error(args);
      console.error("Query to API returned an error:");
      console.error(err);
    }

    return {
      getEventArgs,
      getSettingsArgs,
      filterEvents,
      handleQueryError
    };
  }
}
