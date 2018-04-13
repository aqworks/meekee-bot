
#### Install

`npm install`

#### this is how you run the script locally

Install local tunnel: `npm install -g localtunnel`
Run it: `lt --port 8765 --subdomain meekee`

You also need a mongodb instance.

To run the bot needs a slack app and a google API account.

```
SLACK_CLIENT_ID=xxx SLACK_CLIENT_SECRET=xxx PORT=8765 MONGODB_URI=mongodb://localhost/meekee GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=xxx GOOGLE_REDIRECT_URL=https://meekee.localtunnel.me/google/auth/callback npm start
```

### Details on the implementation

Check out [Marion's article on Medium](https://medium.com/aq-writes/making-meekee-a-slack-bot-using-google-calendar-3af129a3a25) for details on the authentication implementation.
